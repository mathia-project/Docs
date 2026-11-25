"""FastAPI route for generating pedagogical resources with AI."""

from __future__ import annotations

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import get_settings
from app.providers.base import ProviderError, ProviderQuotaError, ProviderTimeoutError
from app.schemas.resource_generation import (
    ResourceGenerationRequest,
    ResourceGenerationResponse,
)
from app.services.resource_generator import generate_resources, is_search_available

logger = logging.getLogger("ai_service.resource_generation")

router = APIRouter(prefix="/ai/resources", tags=["resources generation"])


def extract_bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "authentication_required")
    return token.strip()


async def verify_authenticated_user(token: Annotated[str, Depends(extract_bearer_token)]) -> dict:
    """Verifies user session with Directus without administrative bypass."""
    directus_url = get_settings().directus_url.rstrip("/") + "/"
    async with httpx.AsyncClient(
        base_url=directus_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    ) as client:
        try:
            resp = await client.get("users/me", params={"fields": "id,email,role"})
        except httpx.RequestError as exc:
            raise HTTPException(503, "auth_service_unavailable") from exc

        if resp.status_code == 401:
            raise HTTPException(401, "authentication_required")
        if resp.status_code != 200:
            raise HTTPException(403, "access_denied")

        return resp.json().get("data", {})


@router.get("/capabilities")
async def resource_capabilities(
    user: Annotated[dict, Depends(verify_authenticated_user)],
) -> dict:
    return {"web_search": is_search_available()}


@router.post("/generate", response_model=ResourceGenerationResponse)
async def generate_resources_endpoint(
    request: ResourceGenerationRequest,
    user: Annotated[dict, Depends(verify_authenticated_user)],
) -> ResourceGenerationResponse:
    """Generates structured pedagogical resources (documents, exercises) or verified search resources."""
    try:
        return await generate_resources(request)
    except HTTPException:
        raise
    except ProviderQuotaError as exc:
        raise HTTPException(429, "resource_search_quota_exceeded") from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(504, "resource_generation_timeout") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except ProviderError as exc:
        logger.exception("Configured AI provider failed")
        raise HTTPException(502, "resource_generation_provider_failed") from exc
    except Exception as exc:
        logger.exception("Error generating resources")
        raise HTTPException(500, "generation_failed") from exc
