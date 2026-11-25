from fastapi import APIRouter

from app.schemas.predictions import (
    ClassPredictionRequest,
    ClassPredictionResponse,
    StudentPredictionRequest,
    StudentPredictionResponse,
)
from app.services.prediction import predict_class, predict_student

router = APIRouter(prefix="/predict", tags=["predictions"])


@router.post(
    "/student",
    response_model=StudentPredictionResponse,
    summary="Calculate a deterministic student support indicator",
)
def create_student_prediction(payload: StudentPredictionRequest) -> StudentPredictionResponse:
    return predict_student(payload)


@router.post(
    "/class",
    response_model=ClassPredictionResponse,
    summary="Calculate deterministic indicators for a class",
)
def create_class_prediction(payload: ClassPredictionRequest) -> ClassPredictionResponse:
    return predict_class(payload)
