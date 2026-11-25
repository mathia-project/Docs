from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import ApiModel

RiskLevel = Literal["high", "moderate", "low", "minimal"]
SexType = Literal["male", "female", "other"]
Score = Annotated[float, Field(ge=0, le=100)]
Rate = Annotated[float, Field(ge=0, le=1)]


class StudentPredictionRequest(ApiModel):
    student_id: UUID
    scores: Annotated[list[Score], Field(min_length=1, max_length=50)]
    attendance_rate: Rate
    engagement_rate: Rate
    sex: SexType | None = None

    @property
    def sex_numeric(self) -> int | None:
        """Normalized Sexo(M=1): 1 for male, 0 for female, None for other/unspecified."""
        if self.sex == "male":
            return 1
        if self.sex == "female":
            return 0
        return None


class StudentSignals(ApiModel):
    academic_average: Score
    attendance_rate: Rate
    engagement_rate: Rate
    sex: SexType | None = None


class StudentPredictionResponse(ApiModel):
    student_id: UUID
    composite_score: Score
    risk_level: RiskLevel
    confidence: Rate
    signals: StudentSignals
    model_version: str


class ClassPredictionRequest(ApiModel):
    class_id: UUID
    students: Annotated[list[StudentPredictionRequest], Field(min_length=1, max_length=500)]

    @model_validator(mode="after")
    def student_ids_must_be_unique(self) -> "ClassPredictionRequest":
        student_ids = [student.student_id for student in self.students]
        if len(student_ids) != len(set(student_ids)):
            raise ValueError("student IDs must be unique within a class prediction")
        return self


class RiskDistribution(ApiModel):
    high: int = Field(ge=0)
    moderate: int = Field(ge=0)
    low: int = Field(ge=0)
    minimal: int = Field(ge=0)


class ClassPredictionResponse(ApiModel):
    class_id: UUID
    composite_score: Score
    risk_level: RiskLevel
    risk_distribution: RiskDistribution
    priority_student_ids: list[UUID]
    students: list[StudentPredictionResponse]
    model_version: str
