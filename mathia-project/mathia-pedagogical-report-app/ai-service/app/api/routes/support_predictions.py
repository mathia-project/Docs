from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.schemas.support_predictions import StoredSupportPrediction
from app.services.evaluator import verify_auth_token
from app.services.support_access import resolve_support_prediction_school
from app.services.support_prediction import predict_and_store_student_support

router = APIRouter(prefix="/predict", tags=["predictions"])


@router.post(
    "/student/{student_id}/support",
    response_model=StoredSupportPrediction,
    status_code=status.HTTP_201_CREATED,
    summary="Predict and store the student's educational-support signal",
)
async def create_student_support_prediction(
    student_id: UUID,
    authorization: Annotated[str | None, Header()] = None,
) -> StoredSupportPrediction:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A Directus bearer token is required",
        )

    settings = get_settings()
    token = authorization.split("Bearer ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A Directus bearer token is required",
        )
    user_data = await verify_auth_token(settings.directus_url, token)

    try:
        directus_user_id = UUID(str(user_data.get("id")))
        school_id = await run_in_threadpool(
            resolve_support_prediction_school,
            settings.database_url,
            directus_user_id,
            student_id,
        )
    except (TypeError, ValueError, PermissionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene acceso a este alumno.",
        ) from exc

    try:
        return await run_in_threadpool(
            predict_and_store_student_support,
            settings.database_url,
            settings.support_model_path,
            student_id,
            school_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
