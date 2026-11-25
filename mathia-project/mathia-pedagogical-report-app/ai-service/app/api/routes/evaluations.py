from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, status

from app.core.config import get_settings
from app.schemas.evaluations import AttemptSubmitRequest, AttemptSubmitResponse
from app.services.evaluator import grade_attempt

router = APIRouter(tags=["evaluations"])


@router.post(
    "/attempts/{attempt_id}/submit",
    response_model=AttemptSubmitResponse,
    status_code=status.HTTP_200_OK,
    summary="Authoritatively grade and submit a test attempt",
)
async def submit_attempt_endpoint(
    attempt_id: UUID,
    payload: AttemptSubmitRequest | None = None,
    authorization: Annotated[str | None, Header()] = None,
) -> AttemptSubmitResponse:
    settings = get_settings()
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization.split("Bearer ", 1)[1].strip()

    answers = payload.answers if payload else []

    return await grade_attempt(
        attempt_id=attempt_id,
        auth_token=auth_token,
        client_answers=answers,
        db_url=settings.database_url,
        directus_url=settings.directus_url,
    )

