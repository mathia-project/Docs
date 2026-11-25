"""Mock structured provider for deterministic local execution and test simulation."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, Optional

from app.providers.base import (
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


class MockStructuredProvider(StructuredGenerationProvider):
    """Local mock provider with simulation flags for unit testing edge cases."""

    def __init__(
        self,
        model_name: str = "mock-deterministic-v1",
        simulated_delay: float = 0.0,
        simulated_error: Optional[str] = None,
        canned_data: Optional[Dict[str, Any]] = None,
    ):
        self._model_name = model_name
        self.simulated_delay = simulated_delay
        self.simulated_error = simulated_error
        self.canned_data = canned_data

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return self._model_name

    async def generate_structured(
        self, request: StructuredGenerationRequest
    ) -> StructuredGenerationResult:
        start_time = time.perf_counter()

        if self.simulated_delay > 0:
            await asyncio.sleep(self.simulated_delay)

        if self.simulated_error == "timeout":
            raise ProviderTimeoutError("Mock provider simulated timeout")
        elif self.simulated_error == "quota":
            raise ProviderQuotaError("Mock provider simulated quota exceeded (HTTP 429)")
        elif self.simulated_error == "invalid_json":
            raise ProviderInvalidResponseError("Mock provider simulated invalid JSON response")
        elif self.simulated_error == "truncated":
            raise ProviderTruncatedError("Mock provider simulated truncation (max_tokens reached)")
        elif self.simulated_error == "server_error":
            raise ProviderError("Mock provider simulated 500 server error")

        # Determine returned data
        if self.canned_data is not None:
            data = self.canned_data
        else:
            # If prompt asks for questions
            if "questions" in request.user_prompt or (
                request.output_schema and "questions" in str(request.output_schema)
            ):
                data = {
                    "schema_version": "1.0",
                    "questions": [],
                }
            else:
                data = {
                    "schema_version": "1.0",
                    "title": "Informe de Progreso Pedagógico Simulado",
                    "summary": "El estudiante muestra un rendimiento consistente en los dominios evaluados.",
                    "strengths": [],
                    "areas_for_improvement": [],
                    "action_plan": [],
                    "limitations": ["Evaluación basada en simulación mock"],
                }

        duration_ms = (time.perf_counter() - start_time) * 1000
        raw_text = json.dumps(data)

        return StructuredGenerationResult(
            provider_name=self.provider_name,
            model_name=self.model_name,
            model_version="1.0.0",
            finish_reason="stop",
            data=data,
            raw_text=raw_text,
            usage=TokenUsage(
                prompt_tokens=len(request.user_prompt) // 4,
                completion_tokens=len(raw_text) // 4,
                total_tokens=(len(request.user_prompt) + len(raw_text)) // 4,
            ),
            duration_ms=round(duration_ms, 2),
        )

