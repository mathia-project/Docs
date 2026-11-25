from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException
from google.genai import types

from app.providers.base import ProviderError, StructuredGenerationResult
from app.providers.google_vertex import GoogleVertexStructuredProvider
from app.schemas.resource_generation import ResourceGenerationRequest, SearchResultItem
from app.services.resource_generator import generate_resources
from app.services.resource_search import (
    is_public_web_url,
    resolve_google_citation,
    search_resources,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


def grounded_response():
    return types.GenerateContentResponse(
        candidates=[types.Candidate(
            finish_reason="STOP",
            content=types.Content(parts=[types.Part(text="Lezione di matematica in italiano.")]),
            grounding_metadata=types.GroundingMetadata(
                web_search_queries=["equazioni scuola media italiano"],
                search_entry_point=types.SearchEntryPoint(rendered_content="<div>Google</div>"),
                grounding_chunks=[
                    types.GroundingChunk(web=types.GroundingChunkWeb(
                        uri="https://education.example/italiano", title="Equazioni")),
                    types.GroundingChunk(web=types.GroundingChunkWeb(
                        uri="https://education.example/english", title="Equations")),
                    types.GroundingChunk(web=types.GroundingChunkWeb(
                        uri="https://education.example/uncited", title="No evidence")),
                ],
                grounding_supports=[types.GroundingSupport(
                    grounding_chunk_indices=[0, 1],
                    segment=types.Segment(text="Lezione in italiano; English lesson."),
                )],
            ),
        )],
    )


def selection(index=0, language="it", resource_type="link"):
    return {
        "source_index": index, "title": "Equazioni", "description": "Esercizi guidati.",
        "content_language": language, "language_evidence": "Spiegazioni in italiano.",
        "resource_type": resource_type,
    }


@pytest.mark.anyio
async def test_only_cited_correct_language_and_type_can_become_resources():
    provider = GoogleVertexStructuredProvider(project_id="test")
    provider.generate_grounded = AsyncMock(return_value=grounded_response())
    provider.generate_structured = AsyncMock(return_value=StructuredGenerationResult(
        provider_name="google_vertex", model_name="gemini-2.5-flash",
        data={"resources": [
            selection(40), selection(1, "en"), selection(0, "unknown"),
            selection(2), selection(0, "it", "video"), selection(), selection(),
        ]},
    ))
    request = ResourceGenerationRequest(
        course_id="grade-6", domain_id="6.EE", language="it", resource_type="link",
    )
    with (
        patch("app.services.resource_search.google_search_configured", return_value=True),
        patch("app.services.resource_search.get_structured_provider", return_value=provider),
    ):
        result = await search_resources(request, "Equazioni")
    assert len(result.results) == 1
    assert result.results[0].url == "https://education.example/italiano"
    assert result.results[0].language == "it"
    assert result.web_search_queries == ["equazioni scuola media italiano"]
    assert result.search_entry_point == "<div>Google</div>"
    assert "Italian" in provider.generate_grounded.call_args.args[0]
    assert "unknown" in provider.generate_structured.call_args.args[0].system_prompt


@pytest.mark.anyio
async def test_no_grounding_never_falls_back_to_generated_links():
    provider = GoogleVertexStructuredProvider(project_id="test")
    response = grounded_response()
    response.candidates[0].grounding_metadata = None
    provider.generate_grounded = AsyncMock(return_value=response)
    provider.generate_structured = AsyncMock()
    with (
        patch("app.services.resource_search.google_search_configured", return_value=True),
        patch("app.services.resource_search.get_structured_provider", return_value=provider),
    ):
        result = await search_resources(ResourceGenerationRequest(
            course_id="grade-6", domain_id="6.EE", resource_type="link",
        ), "Equations")
    assert result.results == []
    provider.generate_structured.assert_not_called()


@pytest.mark.anyio
@pytest.mark.parametrize("language", ["en", "es", "it"])
async def test_mixed_or_unknown_language_results_are_not_relabelled(language):
    def search(_query):
        return [SearchResultItem(
            url="https://example.org/resource", title="A foreign resource",
            language="en" if language != "en" else "es", resource_type="video",
            language_evidence="Original language is different.",
        )]
    with patch("app.services.resource_generator._validate_curriculum_path", return_value=None):
        with pytest.raises(HTTPException) as caught:
            await generate_resources(ResourceGenerationRequest(
                course_id="grade-6", domain_id="6.EE", resource_type="video",
                language=language,
            ), search_provider=search)
    assert caught.value.detail == "resource_search_no_results_in_language"


@pytest.mark.parametrize("url", [
    "http://example.org", "https://127.0.0.1/a", "https://[::1]/a",
    "https://169.254.169.254/", "https://localhost/a", "https://service.internal/a",
    "https://user:password@example.org/a", "https://example.org:8080/a", "javascript:alert(1)",
])
def test_unsafe_citation_urls_are_rejected(url):
    assert not is_public_web_url(url)


@pytest.mark.anyio
async def test_google_redirect_is_resolved_without_fetching_destination():
    calls = []
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://www.youtube.com/watch?v=abcdefghijk"})
    source = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/source"
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await resolve_google_citation(client, source) == "https://www.youtube.com/watch?v=abcdefghijk"
    assert calls == [source]


@pytest.mark.anyio
async def test_google_grounding_uses_search_without_json_schema():
    provider = GoogleVertexStructuredProvider(project_id="test")
    generate = AsyncMock(return_value=grounded_response())
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    with patch.object(provider, "_get_client", return_value=client):
        await provider.generate_grounded("Search in Italian")
    config = generate.call_args.kwargs["config"]
    assert config.tools[0].google_search is not None
    assert config.response_mime_type is None
    assert config.response_json_schema is None


@pytest.mark.anyio
async def test_search_provider_failure_is_not_hidden():
    provider = GoogleVertexStructuredProvider(project_id="test")
    generate = AsyncMock(side_effect=RuntimeError("upstream failed"))
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    with patch.object(provider, "_get_client", return_value=client):
        with pytest.raises(ProviderError):
            await provider.generate_grounded("Search in Spanish")
