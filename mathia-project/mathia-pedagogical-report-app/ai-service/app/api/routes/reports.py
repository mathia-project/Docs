from fastapi import APIRouter

from app.schemas.reports import (
    ClassReportRequest,
    ClassReportResponse,
    StudentReportRequest,
    StudentReportResponse,
)
from app.services.reporting import generate_class_report, generate_student_report

router = APIRouter(prefix="/report", tags=["reports"])


@router.post(
    "/student",
    response_model=StudentReportResponse,
    summary="Generate a deterministic student report draft",
)
def create_student_report(payload: StudentReportRequest) -> StudentReportResponse:
    return generate_student_report(payload)


@router.post(
    "/class",
    response_model=ClassReportResponse,
    summary="Generate a deterministic class report draft",
)
def create_class_report(payload: ClassReportRequest) -> ClassReportResponse:
    return generate_class_report(payload)
