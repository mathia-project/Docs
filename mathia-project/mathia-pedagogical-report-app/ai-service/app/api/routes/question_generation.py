"""FastAPI route for generating assessment questions with AI."""

from __future__ import annotations

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import get_settings
from app.schemas.question_generation import (
    QuestionGenerationRequest,
    QuestionGenerationResult,
)
from app.services.question_generator import generate_questions_proposal

logger = logging.getLogger("ai_service.question_generation")

router = APIRouter(prefix="/ai/questions", tags=["questions generation"])


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


@router.post("/generate", response_model=QuestionGenerationResult)
async def generate_questions_endpoint(
    request: QuestionGenerationRequest,
    user: Annotated[dict, Depends(verify_authenticated_user)],
) -> QuestionGenerationResult:
    """Generates structured questions aligned to a mandatory curriculum standard."""
    try:
        result = await generate_questions_proposal(request)
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        logger.exception("Error during question generation: %s", exc)
        raise HTTPException(500, f"Question generation failed: {exc}") from exc
