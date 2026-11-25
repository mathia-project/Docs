from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AnswerSubmission(BaseModel):
    attempt_question_id: UUID | None = None
    test_version_question_id: UUID | None = None
    answer_payload: dict[str, Any] = Field(default_factory=dict)
    answered_at: datetime | None = None
    active_duration_ms: int | None = None


class AttemptSubmitRequest(BaseModel):
    answers: list[AnswerSubmission] = Field(default_factory=list)


class DomainBreakdownItem(BaseModel):
    domain_id: str
    total_questions: int
    correct_questions: int
    score: float
    max_score: float
    accuracy_percent: float


class DifficultyBreakdownItem(BaseModel):
    total: int
    correct: int
    accuracy_percent: float


class AttemptSubmitResponse(BaseModel):
    attempt_id: UUID
    status: str
    total_score: float
    max_score: float
    score_percent: float
    total_active_duration_ms: int
    graded_at: datetime
    by_domain: dict[str, DomainBreakdownItem] = Field(default_factory=dict)
    by_difficulty: dict[str, DifficultyBreakdownItem] = Field(default_factory=dict)

