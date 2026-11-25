from typing import Any, Literal

from pydantic import BaseModel, Field


class ExerciseItem(BaseModel):
    id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    solution: str = Field(min_length=1)
    hints: list[str] = Field(default_factory=list)


class ExerciseStructured(BaseModel):
    format: Literal["guided_practice", "problem_set", "quiz"] = "guided_practice"
    instructions: str = Field(min_length=1)
    items: list[ExerciseItem] = Field(min_length=1)


class SearchResultItem(BaseModel):
    url: str = Field(pattern=r"^https?://\S+$")
    title: str = Field(min_length=1)
    publisher: str | None = None
    published_at: str | None = None
    accessed_at: str | None = None
    snippet: str | None = None
    language: Literal["en", "es", "it"] | None = None
    language_evidence: str | None = None
    resource_type: Literal["link", "video"] | None = None
    source_url: str | None = None


class SearchMetadata(BaseModel):
    query: str = Field(min_length=1)
    searched_at: str = Field(min_length=1)
    selected_url: str = Field(pattern=r"^https?://\S+$")
    results: list[SearchResultItem] = Field(min_length=1)
    provider: str | None = None
    web_search_queries: list[str] = Field(default_factory=list)
    search_entry_point: str | None = None


class GenerationMetadata(BaseModel):
    mode: Literal["generated", "web_search"]
    prompt: str | None = None
    model: str | None = None
    generated_at: str | None = None
    search: SearchMetadata | None = None


class GeneratedResourceItem(BaseModel):
    external_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    resource_type: Literal["document", "exercise", "link", "video"]
    status: Literal["draft"] = "draft"
    language: str = Field(min_length=2, max_length=10)
    course_id: str | None = None
    category_id: str | None = None
    domain_id: str | None = None
    cluster_id: str | None = None
    standard_id: str | None = None
    target_level: Literal["reinforcement", "practice", "enrichment"]
    url: str | None = None
    body: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    generation: GenerationMetadata
    exercise: ExerciseStructured | None = None


class ResourceGenerationRequest(BaseModel):
    course_id: str = Field(min_length=1)
    domain_id: str = Field(min_length=1)
    cluster_id: str | None = None
    standard_id: str | None = None
    resource_type: Literal["document", "exercise", "link", "video"] = "document"
    target_level: Literal["reinforcement", "practice", "enrichment"] = "reinforcement"
    language: Literal["es", "en", "it"] = "es"
    quantity: int = Field(default=1, ge=1, le=5)


class ResourceGenerationResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    resources: list[GeneratedResourceItem]
