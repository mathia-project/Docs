from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import ApiModel
from app.schemas.predictions import ClassPredictionResponse, StudentPredictionResponse

ReportLocale = Literal["en"]
ReportItem = Annotated[str, Field(min_length=1)]


class StudentReportRequest(ApiModel):
    student_name: Annotated[str, Field(min_length=1, max_length=120)]
    prediction: StudentPredictionResponse
    locale: ReportLocale = "en"


class StudentReportResponse(ApiModel):
    student_id: UUID
    title: str
    summary: str
    strengths: list[ReportItem]
    recommendations: list[ReportItem]
    generator_version: str
    requires_professional_review: Literal[True] = True


class ClassReportRequest(ApiModel):
    class_name: Annotated[str, Field(min_length=1, max_length=120)]
    prediction: ClassPredictionResponse
    locale: ReportLocale = "en"


class ClassReportResponse(ApiModel):
    class_id: UUID
    title: str
    summary: str
    highlights: list[ReportItem]
    priorities: list[ReportItem]
    generator_version: str
    requires_professional_review: Literal[True] = True
