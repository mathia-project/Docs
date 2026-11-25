"""Common interface and exceptions for structured generation providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


class ProviderError(Exception):
    """Base exception for all AI provider failures."""
    pass


class ProviderTimeoutError(ProviderError):
    """Raised when an AI provider call times out."""
    pass


class ProviderQuotaError(ProviderError):
    """Raised when an AI provider rate limit or quota is exceeded (HTTP 429)."""
    pass


class ProviderInvalidResponseError(ProviderError):
    """Raised when the provider produces invalid JSON or malformed content."""
    pass


class ProviderTruncatedError(ProviderError):
    """Raised when output was truncated due to token limits."""
    pass


class ProviderConfigurationError(ProviderError):
    """Raised when required provider configuration or credentials are missing."""
    pass


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class StructuredGenerationRequest:
    system_prompt: str
    user_prompt: str
    output_schema: Optional[Dict[str, Any]] = None
    temperature: float = 0.2
    max_output_tokens: int = 4096
    timeout_seconds: float = 30.0


@dataclass
class StructuredGenerationResult:
    provider_name: str
    model_name: str
    model_version: Optional[str] = None
    finish_reason: str = "stop"
    data: Any = field(default_factory=dict)
    raw_text: Optional[str] = None
    usage: TokenUsage = field(default_factory=TokenUsage)
    duration_ms: float = 0.0


class StructuredGenerationProvider(ABC):
    """Internal contract for structured generation providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g., 'google_vertex', 'mock')."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Identifier of the model."""
        pass

    @abstractmethod
    async def generate_structured(
        self, request: StructuredGenerationRequest
    ) -> StructuredGenerationResult:
        """Executes structured generation and returns normalized result."""
        pass

