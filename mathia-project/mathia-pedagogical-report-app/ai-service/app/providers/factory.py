"""Factory for structured generation providers."""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.providers.base import ProviderConfigurationError, StructuredGenerationProvider
from app.providers.google_vertex import GoogleVertexStructuredProvider
from app.providers.mock import MockStructuredProvider

logger = logging.getLogger("ai_service.providers.factory")

_PROVIDER_OVERRIDE: StructuredGenerationProvider | None = None
_PROVIDER_INSTANCE: StructuredGenerationProvider | None = None


def set_provider_override(provider: StructuredGenerationProvider | None) -> None:
    """Sets a global override provider, useful for unit and integration testing."""
    global _PROVIDER_OVERRIDE, _PROVIDER_INSTANCE
    _PROVIDER_OVERRIDE = provider
    _PROVIDER_INSTANCE = None


async def close_structured_provider() -> None:
    """Close a provider client during FastAPI shutdown when supported."""
    global _PROVIDER_INSTANCE
    provider = _PROVIDER_INSTANCE
    _PROVIDER_INSTANCE = None
    close = getattr(provider, "aclose", None)
    if close is not None:
        await close()


def get_structured_provider() -> StructuredGenerationProvider:
    """Returns the configured structured provider with safe mock fallback."""
    if _PROVIDER_OVERRIDE is not None:
        return _PROVIDER_OVERRIDE

    global _PROVIDER_INSTANCE
    if _PROVIDER_INSTANCE is not None:
        return _PROVIDER_INSTANCE

    settings = get_settings()
    provider_name = getattr(
        settings,
        "ai_structured_provider",
        getattr(settings, "ai_provider", "mock"),
    ).lower()

    if provider_name in ("google", "google_vertex", "vertex"):
        try:
            _PROVIDER_INSTANCE = GoogleVertexStructuredProvider()
            return _PROVIDER_INSTANCE
        except Exception as exc:
            raise ProviderConfigurationError(
                f"Google Vertex provider initialization failed: {exc}"
            ) from exc

    _PROVIDER_INSTANCE = MockStructuredProvider()
    return _PROVIDER_INSTANCE

