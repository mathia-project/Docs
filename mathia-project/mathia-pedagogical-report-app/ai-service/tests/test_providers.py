import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.providers.base import (
    ProviderConfigurationError,
    ProviderError,
    ProviderInvalidResponseError,
    ProviderQuotaError,
    ProviderTimeoutError,
    ProviderTruncatedError,
    StructuredGenerationRequest,
)
from app.providers.factory import get_structured_provider, set_provider_override
from app.providers.google_vertex import GoogleVertexStructuredProvider, clean_schema_for_gemini
from app.providers.mock import MockStructuredProvider


def test_mock_provider_valid_response():
    async def _test():
        provider = MockStructuredProvider()
        req = StructuredGenerationRequest(
            system_prompt="Test system",
            user_prompt="Generate test questions",
            output_schema={"type": "object"},
        )
        result = await provider.generate_structured(req)
        assert result.provider_name == "mock"
        assert result.model_name == "mock-deterministic-v1"
        assert result.finish_reason == "stop"
        assert isinstance(result.data, dict)
        assert result.duration_ms >= 0

    asyncio.run(_test())


def test_mock_provider_simulated_timeout():
    async def _test():
        provider = MockStructuredProvider(simulated_error="timeout")
        req = StructuredGenerationRequest(system_prompt="sys", user_prompt="usr")
        with pytest.raises(ProviderTimeoutError) as exc_info:
            await provider.generate_structured(req)
        assert "timeout" in str(exc_info.value).lower()

    asyncio.run(_test())


def test_mock_provider_simulated_quota():
    async def _test():
        provider = MockStructuredProvider(simulated_error="quota")
        req = StructuredGenerationRequest(system_prompt="sys", user_prompt="usr")
        with pytest.raises(ProviderQuotaError) as exc_info:
            await provider.generate_structured(req)
        assert "quota" in str(exc_info.value).lower() or "429" in str(exc_info.value)

    asyncio.run(_test())


def test_mock_provider_simulated_invalid_json():
    async def _test():
        provider = MockStructuredProvider(simulated_error="invalid_json")
        req = StructuredGenerationRequest(system_prompt="sys", user_prompt="usr")
        with pytest.raises(ProviderInvalidResponseError):
            await provider.generate_structured(req)

    asyncio.run(_test())


def test_mock_provider_simulated_truncated():
    async def _test():
        provider = MockStructuredProvider(simulated_error="truncated")
        req = StructuredGenerationRequest(system_prompt="sys", user_prompt="usr")
        with pytest.raises(ProviderTruncatedError):
            await provider.generate_structured(req)

    asyncio.run(_test())


def test_mock_provider_simulated_server_error():
    async def _test():
        provider = MockStructuredProvider(simulated_error="server_error")
        req = StructuredGenerationRequest(system_prompt="sys", user_prompt="usr")
        with pytest.raises(ProviderError):
            await provider.generate_structured(req)

    asyncio.run(_test())


def test_clean_schema_for_gemini():
    raw_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://example.com/schema.json",
        "title": "Test Title",
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "name of item"},
            "identifier": {
                "type": "string",
                "format": "uuid",
                "minLength": 1,
                "maxLength": 36,
                "pattern": "^[a-f0-9-]+$",
            },
            "nested": {
                "title": "Nested",
                "type": "array",
                "items": {"title": "SubItem", "type": "string"},
            },
        },
    }
    cleaned = clean_schema_for_gemini(raw_schema)
    assert "$schema" not in cleaned
    assert "$id" not in cleaned
    assert "title" not in cleaned
    assert cleaned["type"] == "object"
    assert "description" not in cleaned["properties"]["name"]
    assert "format" not in cleaned["properties"]["identifier"]
    assert "minLength" not in cleaned["properties"]["identifier"]
    assert "maxLength" not in cleaned["properties"]["identifier"]
    assert "pattern" not in cleaned["properties"]["identifier"]
    assert "title" not in cleaned["properties"]["nested"]
    assert "title" not in cleaned["properties"]["nested"]["items"]


def test_google_vertex_unconfigured_error():
    async def _test():
        # Without a project and location, ADC-backed Vertex AI cannot initialize.
        provider = GoogleVertexStructuredProvider(project_id="", location="")
        req = StructuredGenerationRequest(system_prompt="sys", user_prompt="usr")
        with pytest.raises(ProviderConfigurationError):
            await provider.generate_structured(req)

    asyncio.run(_test())


@pytest.mark.parametrize(
    "model_name, expected_temperature",
    [("gemini-test", 0.2), ("gemini-3.1-flash-lite", 1.0)],
)
def test_google_genai_sdk_structured_generation(model_name, expected_temperature):
    class FakeModels:
        def __init__(self):
            self.config = None

        async def generate_content(self, *, model, contents, config):
            self.config = config
            assert model == model_name
            assert contents == "Generate a test document"
            return SimpleNamespace(
                text='{"ok": true}',
                parsed={"ok": True},
                candidates=[SimpleNamespace(finish_reason="STOP")],
                usage_metadata=SimpleNamespace(
                    prompt_token_count=10,
                    candidates_token_count=5,
                    total_token_count=15,
                ),
                model_version="gemini-test-version",
            )

    class FakeAsyncClient:
        def __init__(self, models):
            self.models = models

        async def aclose(self):
            return None

    fake_models = FakeModels()
    fake_client = SimpleNamespace(
        aio=FakeAsyncClient(fake_models),
        close=lambda: None,
    )

    async def _test():
        with patch("app.providers.google_vertex.genai.Client", return_value=fake_client):
            provider = GoogleVertexStructuredProvider(
                project_id="test-project",
                location="europe-west1",
                model_name=model_name,
            )
            result = await provider.generate_structured(
                StructuredGenerationRequest(
                    system_prompt="Return JSON",
                    user_prompt="Generate a test document",
                    temperature=0.2,
                    output_schema={
                        "type": "object",
                        "properties": {"ok": {"type": "boolean"}},
                        "required": ["ok"],
                    },
                )
            )

            assert result.provider_name == "google_vertex"
            assert result.data == {"ok": True}
            assert result.usage.total_tokens == 15
            assert fake_models.config.temperature == expected_temperature
            assert fake_models.config.response_mime_type == "application/json"
            assert fake_models.config.response_json_schema["type"] == "object"
            await provider.aclose()

    asyncio.run(_test())


def test_provider_factory_fallback_and_override():
    provider = get_structured_provider()
    assert isinstance(provider, MockStructuredProvider)

    custom = MockStructuredProvider(model_name="custom-test")
    set_provider_override(custom)
    try:
        assert get_structured_provider().model_name == "custom-test"
    finally:
        set_provider_override(None)
    assert get_structured_provider().model_name == "mock-deterministic-v1"

