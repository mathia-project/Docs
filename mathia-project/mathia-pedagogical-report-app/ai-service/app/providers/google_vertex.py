"""Google Gen AI SDK adapter for Gemini on Vertex AI using ADC."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from google import genai
from google.genai import types

from app.core.config import get_settings
from app.providers.base import (
    ProviderConfigurationError,
    ProviderError,
    ProviderInvalidResponseError,
    ProviderQuotaError,
    ProviderTimeoutError,
    ProviderTruncatedError,
    StructuredGenerationProvider,
    StructuredGenerationRequest,
    StructuredGenerationResult,
    TokenUsage,
)

logger = logging.getLogger("ai_service.providers.google_vertex")


def clean_schema_for_gemini(
    schema: dict[str, Any], *, inside_properties: bool = False
) -> dict[str, Any]:
    """Removes JSON-schema properties not supported by Gemini responseSchema."""
    if not isinstance(schema, dict):
        return schema
    cleaned = {}
    # Gemini response schemas do not accept some JSON Schema annotations and
    # can reject otherwise valid Pydantic schemas when they encode many nested
    # constraints (long arrays, numeric bounds, or complex string matchers).
    # These are generation hints only; the complete contract is still enforced
    # by Pydantic after the model response is received.
    unsupported_keys = {
        "$schema",
        "$id",
        "default",
        "examples",
        "format",
        "minLength",
        "maxLength",
        "pattern",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minItems",
        "maxItems",
    }
    for k, v in schema.items():
        # `title` and `description` are unsupported schema metadata at the
        # object level, but they are valid resource property names.
        if k in unsupported_keys or (
            k in {"title", "description"} and not inside_properties
        ):
            continue
        if isinstance(v, dict):
            cleaned[k] = clean_schema_for_gemini(
                v, inside_properties=(k == "properties")
            )
        elif isinstance(v, list):
            cleaned[k] = [
                clean_schema_for_gemini(item, inside_properties=inside_properties)
                if isinstance(item, dict)
                else item
                for item in v
            ]
        else:
            cleaned[k] = v
    # Gemini's response schema requires every object property to be listed in
    # `required`, including fields that are nullable in the Pydantic contract.
    # Nullability is preserved by the property's type/anyOf definition.
    properties = cleaned.get("properties")
    if isinstance(properties, dict):
        cleaned["required"] = list(properties.keys())
    return cleaned


class GoogleVertexStructuredProvider(StructuredGenerationProvider):
    """Structured generation adapter backed by the Google Gen AI SDK.

    Authentication uses Application Default Credentials. Locally this can be
    provided by ``GOOGLE_APPLICATION_CREDENTIALS`` or ``gcloud auth
    application-default login``. In Google Cloud, use the service account
    attached to the runtime.
    """

    def __init__(
        self,
        project_id: str | None = None,
        location: str | None = None,
        model_name: str | None = None,
        max_concurrency: int = 4,
    ):
        settings = get_settings()
        self._project_id = project_id or getattr(settings, "google_cloud_project", None)
        self._location = location or getattr(settings, "google_cloud_location", "us-central1")
        self._model_name = model_name or getattr(
            settings, "google_genai_model", "gemini-3.1-flash-lite"
        )
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._client: genai.Client | None = None

    @property
    def provider_name(self) -> str:
        return "google_vertex"

    @property
    def model_name(self) -> str:
        return self._model_name

    def _build_client(self) -> genai.Client:
        """Build one long-lived SDK client for connection reuse."""
        if not self._project_id or not self._location:
            raise ProviderConfigurationError(
                "Vertex AI requires GOOGLE_CLOUD_PROJECT and "
                "GOOGLE_CLOUD_LOCATION. Configure ADC for authentication."
            )

        return genai.Client(
            vertexai=True,
            project=self._project_id,
            location=self._location,
            http_options=types.HttpOptions(api_version="v1"),
        )

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = self._build_client()
        return self._client

    async def aclose(self) -> None:
        """Close the SDK's async client when the application shuts down."""
        if self._client is not None:
            await self._client.aio.aclose()
            self._client.close()
            self._client = None

    async def generate_grounded(self, prompt: str, *, timeout_seconds: float = 90.0):
        """Search with native grounding metadata (separate from JSON generation).

        Gemini 2.5 cannot combine the search tool with a JSON response schema.
        Reuse this provider's authenticated client and concurrency limit.
        """
        async with self._semaphore:
            try:
                response = await asyncio.wait_for(
                    self._get_client().aio.models.generate_content(
                        model=self.model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            tools=[types.Tool(google_search=types.GoogleSearch())],
                            temperature=1.0,
                            max_output_tokens=8000,
                        ),
                    ),
                    timeout=timeout_seconds,
                )
            except TimeoutError as exc:
                raise ProviderTimeoutError("Google Search grounding timed out") from exc
            except Exception as exc:
                if getattr(exc, "code", None) == 429 or "429" in str(exc):
                    raise ProviderQuotaError("Google Search quota exceeded") from exc
                raise ProviderError("Google Search grounding request failed") from exc
        candidates = response.candidates or []
        if not candidates or not response.text:
            raise ProviderInvalidResponseError("Google Search returned no content")
        if str(candidates[0].finish_reason).split(".")[-1] == "MAX_TOKENS":
            raise ProviderTruncatedError("Google Search response was truncated")
        return response

    async def generate_structured(
        self, request: StructuredGenerationRequest
    ) -> StructuredGenerationResult:
        start_time = time.perf_counter()

        async with self._semaphore:
            config_kwargs: dict[str, Any] = {
                "system_instruction": request.system_prompt,
                # Gemini 3 recommends the default temperature to avoid looping.
                "temperature": (
                    1.0 if self._model_name.startswith("gemini-3") else request.temperature
                ),
                "max_output_tokens": request.max_output_tokens,
                "response_mime_type": "application/json",
            }
            if request.output_schema:
                config_kwargs["response_json_schema"] = clean_schema_for_gemini(
                    request.output_schema
                )

            config = types.GenerateContentConfig(**config_kwargs)
            client = self._get_client()

            try:
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=self._model_name,
                        contents=request.user_prompt,
                        config=config,
                    ),
                    timeout=request.timeout_seconds,
                )
            except TimeoutError as exc:
                raise ProviderTimeoutError(
                    f"Google Gen AI call timed out after {request.timeout_seconds}s"
                ) from exc
            except Exception as exc:
                status_code = getattr(exc, "status_code", None)
                if status_code == 429 or "429" in str(exc):
                    raise ProviderQuotaError(
                        "Google Cloud rate limit / quota exceeded (429)"
                    ) from exc
                raise ProviderError(f"Google Gen AI request failed: {str(exc)[:300]}") from exc

            candidates = getattr(response, "candidates", None) or []
            first = candidates[0] if candidates else None
            finish_reason = getattr(first, "finish_reason", None) if first else None
            finish_reason = getattr(finish_reason, "name", finish_reason) or "STOP"
            if finish_reason in ("MAX_TOKENS", "LENGTH"):
                raise ProviderTruncatedError(
                    "Gemini response was truncated due to max_output_tokens"
                )

            raw_text = getattr(response, "text", None)
            if not raw_text:
                raise ProviderInvalidResponseError("Gemini returned an empty response")

            parsed_data = getattr(response, "parsed", None)
            if parsed_data is None:
                try:
                    parsed_data = json.loads(raw_text)
                except json.JSONDecodeError as exc:
                    raise ProviderInvalidResponseError(
                        "Gemini returned invalid JSON "
                        f"(finish_reason={finish_reason}, chars={len(raw_text)}): {exc}"
                    ) from exc
            elif hasattr(parsed_data, "model_dump"):
                parsed_data = parsed_data.model_dump()

            usage_meta = getattr(response, "usage_metadata", None)
            usage = TokenUsage(
                prompt_tokens=getattr(usage_meta, "prompt_token_count", 0) or 0,
                completion_tokens=getattr(usage_meta, "candidates_token_count", 0) or 0,
                total_tokens=getattr(usage_meta, "total_token_count", 0) or 0,
            )

            duration_ms = (time.perf_counter() - start_time) * 1000
            return StructuredGenerationResult(
                provider_name=self.provider_name,
                model_name=self.model_name,
                model_version=getattr(response, "model_version", None),
                finish_reason=str(finish_reason),
                data=parsed_data,
                raw_text=raw_text,
                usage=usage,
                duration_ms=round(duration_ms, 2),
            )

