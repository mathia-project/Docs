from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.resource_generation import (
    ResourceGenerationRequest,
    SearchResultItem,
)
from app.services.resource_generator import (
    generate_resources,
    set_search_provider_override,
)


@pytest.fixture(autouse=True)
def clean_search_override():
    set_search_provider_override(None)
    with patch("app.services.resource_generator._validate_curriculum_path", return_value=None):
        yield
    set_search_provider_override(None)


@pytest.mark.anyio
async def test_generate_document_resource():
    req = ResourceGenerationRequest(
        course_id="grade-6",
        domain_id="6.EE",
        resource_type="document",
        target_level="reinforcement",
        language="es",
        quantity=2,
    )
    res = await generate_resources(req)
    assert res.schema_version == "1.0"
    assert len(res.resources) == 2
    for r in res.resources:
        assert r.resource_type == "document"
        assert r.status == "draft"
        assert r.body and len(r.body) > 10
        assert r.url is None
        assert r.exercise is None
        assert r.generation.mode == "generated"


@pytest.mark.anyio
async def test_generate_exercise_resource():
    req = ResourceGenerationRequest(
        course_id="grade-6",
        domain_id="6.EE",
        resource_type="exercise",
        target_level="practice",
        language="es",
        quantity=1,
    )
    res = await generate_resources(req)
    assert len(res.resources) == 1
    r = res.resources[0]
    assert r.resource_type == "exercise"
    assert r.status == "draft"
    assert r.body is not None
    assert r.exercise is not None
    assert len(r.exercise.items) >= 1
    for item in r.exercise.items:
        assert item.prompt.strip()
        assert item.answer.strip()
        assert item.solution.strip()


@pytest.mark.anyio
@pytest.mark.parametrize("resource_type", ["document", "exercise"])
async def test_generate_italian_resource(resource_type):
    request = ResourceGenerationRequest(
        course_id="grade-6",
        domain_id="6.EE",
        resource_type=resource_type,
        target_level="reinforcement",
        language="it",
        quantity=1,
    )

    resource = (await generate_resources(request)).resources[0]
    assert resource.language == "it"
    assert resource.status == "draft"
    assert "rinforzo" in resource.description
    if resource_type == "document":
        assert "Concetti chiave" in resource.body
    else:
        assert resource.exercise.instructions.startswith("Leggi")
        assert "**Risposta:**" in resource.body
        assert "**Soluzione:**" in resource.body


@pytest.mark.anyio
async def test_search_disabled_when_not_configured():
    req = ResourceGenerationRequest(
        course_id="grade-6",
        domain_id="6.EE",
        resource_type="video",
        target_level="practice",
        language="es",
        quantity=1,
    )
    with pytest.raises(HTTPException) as exc_info:
        await generate_resources(req)
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "resource_search_unavailable"


@pytest.mark.anyio
async def test_search_enabled_with_verifiable_results():
    def mock_search(query: str) -> list[SearchResultItem]:
        return [
            SearchResultItem(
                url="https://verified-education.org/fractions-video",
                title="Visual Fractions Video",
                snippet="Comprehensive guide to fractions.",
                publisher="Verified Edu",
                language="en", resource_type="video",
                language_evidence="English spoken explanation.",
            )
        ]

    req = ResourceGenerationRequest(
        course_id="grade-6",
        domain_id="6.NS",
        resource_type="video",
        target_level="practice",
        language="en",
        quantity=1,
    )

    res = await generate_resources(req, search_provider=mock_search)
    assert len(res.resources) == 1
    r = res.resources[0]
    assert r.resource_type == "video"
    assert r.url == "https://verified-education.org/fractions-video"
    assert r.generation.mode == "web_search"
    assert r.generation.search is not None
    assert r.generation.search.selected_url == "https://verified-education.org/fractions-video"
    assert len(r.generation.search.results) == 1


@pytest.mark.anyio
async def test_reject_hallucinated_urls_not_in_search():
    def mock_search(query: str) -> list[SearchResultItem]:
        return [
            SearchResultItem(
                url="https://verified-education.org/video-1",
                title="Video 1",
                language="es", resource_type="video",
                language_evidence="Explicación hablada en español.",
            )
        ]

    req = ResourceGenerationRequest(
        course_id="grade-6",
        domain_id="6.NS",
        resource_type="video",
        target_level="practice",
        language="es",
        quantity=1,
    )

    with patch("app.services.resource_generator.datetime") as mock_dt:
        mock_dt.now.return_value.isoformat.return_value = "2026-09-28T00:00:00Z"
        res = await generate_resources(req, search_provider=mock_search)
        assert res.resources[0].url == "https://verified-education.org/video-1"


@pytest.mark.parametrize("language", ["es", "it"])
def test_resource_generation_api_endpoint(language):
    client = TestClient(app)

    from app.api.routes.resource_generation import verify_authenticated_user

    app.dependency_overrides[verify_authenticated_user] = lambda: {"id": "teacher-123"}

    try:
        response = client.post(
            "/ai/resources/generate",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "course_id": "grade-6",
                "domain_id": "6.EE",
                "resource_type": "document",
                "target_level": "reinforcement",
                "language": language,
                "quantity": 1,
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["schema_version"] == "1.0"
        assert len(data["resources"]) == 1
        assert data["resources"][0]["status"] == "draft"
        assert data["resources"][0]["language"] == language
    finally:
        app.dependency_overrides.clear()
