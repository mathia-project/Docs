"""Pydantic schemas for AI-assisted question bank generation conforming to question-import-1.0."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

QuestionType = Literal["single_choice", "multiple_choice", "true_false", "numeric"]
QuestionDifficulty = Literal["easy", "medium", "hard"]
QuestionLanguage = Literal["es", "en", "it"]


class GeneratedOption(BaseModel):
    key: str = Field(..., pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    content: str = Field(..., min_length=1)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("option content cannot be blank")
        return v.strip()


class GeneratedAnswerConfig(BaseModel):
    correct_value: float | None = None
    tolerance: float | None = Field(default=0.0, ge=0.0)


class CurriculumRoute(BaseModel):
    domain_code: str = Field(..., min_length=1)
    cluster_code: str | None = None
    standard_code: str | None = None
    substandard_code: str | None = None

    @field_validator("domain_code")
    @classmethod
    def domain_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("domain_code cannot be blank")
        return v.strip()


class GeneratedQuestionItem(BaseModel):
    external_id: str | None = None
    question_type: QuestionType
    prompt: str = Field(..., min_length=1)
    options: list[GeneratedOption] | None = None
    correct_options: list[str] | None = None
    explanation: str | None = None
    difficulty: QuestionDifficulty
    language: QuestionLanguage
    curriculum: CurriculumRoute
    answer_config: GeneratedAnswerConfig | dict[str, Any] | None = None

    @field_validator("prompt")
    @classmethod
    def prompt_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("prompt cannot be blank")
        return v.strip()

    @model_validator(mode="after")
    def validate_type_coherence(self) -> GeneratedQuestionItem:
        q_type = self.question_type

        if q_type in ("single_choice", "multiple_choice", "true_false"):
            if not self.options or len(self.options) < 2:
                raise ValueError(f"Question type '{q_type}' must have at least 2 options")
            
            option_keys = {opt.key.upper() for opt in self.options}
            if len(option_keys) != len(self.options):
                raise ValueError("Option keys must be distinct")

            if not self.correct_options or len(self.correct_options) == 0:
                raise ValueError(f"Question type '{q_type}' must declare at least 1 correct option")

            normalized_correct = [c.upper() for c in self.correct_options]
            for c in normalized_correct:
                if c not in option_keys:
                    raise ValueError(f"Correct option '{c}' not found in declared options {list(option_keys)}")

            if q_type in ("single_choice", "true_false") and len(normalized_correct) != 1:
                raise ValueError(f"Question type '{q_type}' must have exactly 1 correct option")

            if q_type == "true_false" and len(self.options) != 2:
                raise ValueError("true_false question must have exactly 2 options")

            # answer_config should be empty for choice questions
            if self.answer_config is None or isinstance(self.answer_config, GeneratedAnswerConfig):
                self.answer_config = {}

        elif q_type == "numeric":
            self.options = []
            self.correct_options = []
            if self.answer_config is None:
                raise ValueError("Numeric question requires answer_config with correct_value")
            
            if isinstance(self.answer_config, dict):
                if "correct_value" not in self.answer_config or self.answer_config["correct_value"] is None:
                    raise ValueError("Numeric question requires answer_config.correct_value")
                val = self.answer_config["correct_value"]
                if not isinstance(val, (int, float)):
                    raise ValueError("answer_config.correct_value must be a finite number")
                tol = self.answer_config.get("tolerance", 0.0)
                if tol is not None and tol < 0:
                    raise ValueError("answer_config.tolerance must be >= 0")
            elif isinstance(self.answer_config, GeneratedAnswerConfig):
                if self.answer_config.correct_value is None:
                    raise ValueError("Numeric question requires answer_config.correct_value")

        return self


class QuestionBatchDocument(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    questions: list[GeneratedQuestionItem] = Field(..., min_length=1)


class QuestionGenerationRequest(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    course_id: str = Field(..., min_length=1)
    domain_id: str = Field(..., min_length=1)
    cluster_id: str = Field(..., min_length=1)
    standard_id: str = Field(..., min_length=1)  # Mandatory standard for generation
    substandard_id: str | None = None
    question_type: QuestionType
    difficulty: QuestionDifficulty
    language: QuestionLanguage = "es"
    quantity: int = Field(default=5, ge=1, le=25)
    request_id: str | None = None


class QuestionGenerationMetadata(BaseModel):
    provider: str
    model_name: str
    request_id: str
    generated_at: str
    total_generated: int
    curriculum_summary: dict[str, Any]


class QuestionGenerationResult(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    questions: list[GeneratedQuestionItem]
    metadata: QuestionGenerationMetadata
