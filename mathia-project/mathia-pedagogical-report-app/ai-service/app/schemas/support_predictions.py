from typing import Annotated, Literal, TypeAlias
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from app.schemas.base import ApiModel

SupportPredictionStatus: TypeAlias = Literal[
    "support_suggested",
    "no_support_signal",
    "insufficient_information",
    "diagnosis_recorded",
]
EvidenceLevel: TypeAlias = Literal["insufficient", "limited", "standard"]
UnitInterval = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class SupportPredictionToStore(ApiModel):
    """Auditable result of one educational-support model execution."""

    school_id: UUID
    student_id: UUID
    suggests_educational_support: bool | None
    status: SupportPredictionStatus
    attention_index: UnitInterval | None = None
    applied_threshold: UnitInterval | None = None
    model_name: Annotated[str, Field(min_length=1)]
    model_version: Annotated[str, Field(min_length=1)]
    model_route: Annotated[str, Field(min_length=1)]
    evidence_level: EvidenceLevel
    total_responses: Annotated[int, Field(ge=0)]
    valid_response_times: Annotated[int, Field(ge=0)] = 0
    volume_outside_fit_range: bool = False
    warnings: list[Annotated[str, Field(min_length=1)]] = Field(default_factory=list)
    reason: str | None = None
    generated_at: AwareDatetime

    @model_validator(mode="after")
    def result_fields_must_be_consistent(self) -> "SupportPredictionToStore":
        expected_statuses = {
            True: {"support_suggested"},
            False: {"no_support_signal"},
            None: {"insufficient_information", "diagnosis_recorded"},
        }[self.suggests_educational_support]
        if self.status not in expected_statuses:
            raise ValueError("status must match suggests_educational_support")

        has_index = self.attention_index is not None
        has_threshold = self.applied_threshold is not None
        if has_index != has_threshold:
            raise ValueError("attention_index and applied_threshold must be provided together")
        if (self.suggests_educational_support is None) == has_index:
            raise ValueError("scores are required only when the model produced a decision")
        if self.valid_response_times > self.total_responses:
            raise ValueError("valid_response_times cannot exceed total_responses")
        if self.evidence_level == "insufficient" and self.suggests_educational_support is not None:
            raise ValueError("insufficient evidence cannot produce a decision")
        return self


class StoredSupportPrediction(SupportPredictionToStore):
    id: UUID
    created_at: AwareDatetime
