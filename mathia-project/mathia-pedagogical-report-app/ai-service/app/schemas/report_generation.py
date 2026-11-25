"""Versioned student-report contract; independent of providers and legacy reports."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, Field, field_validator, model_validator

from app.schemas.base import ApiModel
from app.schemas.support_predictions import StoredSupportPrediction

Version = Literal["1.0"]
Language = Literal["en", "es", "it"]
Label = Annotated[str, Field(min_length=1, max_length=200, pattern=r"\S")]
Text = Annotated[str, Field(min_length=1, max_length=2000, pattern=r"\S")]
DomainId = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")]
EvidenceRef = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")]
Count = Annotated[int, Field(ge=0, le=1_000_000, strict=True)]
Score = Annotated[float, Field(ge=0, le=15, allow_inf_nan=False, strict=True)]
Percent = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False, strict=True)]
Points = Annotated[float, Field(ge=0, le=1_000_000, allow_inf_nan=False, strict=True)]
Refs = Annotated[list[EvidenceRef], Field(min_length=1, max_length=20)]


class ContractModel(ApiModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


def rounded(value: float | Decimal) -> float:
    """Match PostgreSQL numeric rounding, including exact half values."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def unique(values: list, name: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"{name} must be unique")


class ReportPeriod(ContractModel):
    start: date
    end: date

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.end < self.start:
            raise ValueError("period end must not precede start")
        return self


class StudentReportGenerationRequest(ContractModel):
    schema_version: Version
    student_id: UUID
    class_id: UUID | None = None
    period: ReportPeriod
    language: Language


class DomainEvidence(ContractModel):
    evidence_ref: EvidenceRef
    domain_id: DomainId
    domain_name: Label
    category_id: DomainId | None
    is_baseline: Annotated[bool, Field(strict=True)]
    evaluations_count: Count
    total_questions: Count
    correct_questions: Count
    total_score_awarded: Points
    total_max_score: Points
    score: Score | None
    accuracy_percent: Percent | None
    classification: Literal["insufficient_evidence", "consolidated_strength", "intervention"]

    @model_validator(mode="after")
    def consistent_metrics(self) -> Self:
        if self.correct_questions > self.total_questions:
            raise ValueError("correct_questions cannot exceed total_questions")
        if self.total_score_awarded > self.total_max_score:
            raise ValueError("awarded points cannot exceed maximum points")
        if self.is_baseline or self.evaluations_count == 0:
            if any(
                (
                    self.evaluations_count,
                    self.total_questions,
                    self.correct_questions,
                    self.total_score_awarded,
                    self.total_max_score,
                )
            ):
                raise ValueError("baseline or unevaluated domains cannot contain assessment totals")
        elif self.total_questions == 0 or self.total_max_score == 0:
            raise ValueError("evaluated domains require questions and a positive maximum score")
        expected_score = (
            rounded(
                Decimal(str(self.total_score_awarded)) * 15 / Decimal(str(self.total_max_score))
            )
            if self.total_max_score
            else None
        )
        expected_accuracy = (
            rounded(Decimal(self.correct_questions) * 100 / self.total_questions)
            if self.total_questions
            else None
        )
        if self.score != expected_score or self.accuracy_percent != expected_accuracy:
            raise ValueError("domain metrics must match assessment totals; absent evidence is null")
        expected_classification = (
            "insufficient_evidence"
            if self.score is None
            else "consolidated_strength"
            if self.score >= 10
            else "intervention"
        )
        if self.classification != expected_classification:
            raise ValueError("domain classification must match measured score")
        return self


class ReportMetrics(ContractModel):
    evidence_ref: EvidenceRef
    curriculum_average: Score | None
    curriculum_average_percent: Percent | None
    total_evaluated_domains: Count
    tests_completed: Count
    total_questions_answered: Count
    overall_accuracy_percent: Percent | None


class DiagnosticEvidence(ContractModel):
    evidence_ref: EvidenceRef
    has_recorded_diagnosis: Annotated[bool, Field(strict=True)]
    # Only the existence of a recorded diagnosis is needed for generation.
    # Names, clinical notes and diagnostic labels remain in the authorized record.


class ResourceEvidence(ContractModel):
    resource_id: UUID
    title: Label
    domain_id: DomainId | None
    target_level: Literal["reinforcement", "practice", "enrichment"]


class ReportStoredPrediction(StoredSupportPrediction):
    """Existing prediction semantics with bounded fields for the report snapshot."""

    suggests_educational_support: Annotated[bool, Field(strict=True)] | None
    model_name: Label
    model_version: Label
    model_route: Label
    total_responses: Count
    valid_response_times: Count
    volume_outside_fit_range: Annotated[bool, Field(strict=True)]
    warnings: Annotated[list[Text], Field(max_length=20)]
    reason: Text | None


class PredictionEvidence(ContractModel):
    evidence_ref: EvidenceRef
    prediction: ReportStoredPrediction


class ReportEvidenceSnapshot(ContractModel):
    schema_version: Version
    evidence_snapshot_id: UUID
    prepared_at: AwareDatetime
    school_id: UUID
    request: StudentReportGenerationRequest
    calculation_version: Literal["student-report-metrics/1.0"]
    source_scope: Literal["authorized_period_assessments"]
    source_complete: Literal[True]
    metrics: ReportMetrics
    domains: Annotated[list[DomainEvidence], Field(max_length=100)]
    diagnostic: DiagnosticEvidence
    stored_prediction: PredictionEvidence | None
    resources: Annotated[list[ResourceEvidence], Field(max_length=100)]
    limitations: Annotated[list[Text], Field(max_length=20)]

    @field_validator("source_complete", mode="before")
    @classmethod
    def complete_boolean(cls, value: object) -> object:
        if value is not True:
            raise ValueError("source_complete must be the boolean true")
        return value

    @model_validator(mode="after")
    def consistent_snapshot(self) -> Self:
        unique([d.domain_id for d in self.domains], "domain IDs")
        unique([r.resource_id for r in self.resources], "resource IDs")
        refs = [self.metrics.evidence_ref, self.diagnostic.evidence_ref]
        refs.extend(d.evidence_ref for d in self.domains)
        if self.stored_prediction:
            refs.append(self.stored_prediction.evidence_ref)
            prediction = self.stored_prediction.prediction
            if (
                prediction.student_id != self.request.student_id
                or prediction.school_id != self.school_id
            ):
                raise ValueError("prediction must belong to the authorized student and school")
            if prediction.generated_at > self.prepared_at:
                raise ValueError("prediction cannot postdate the snapshot")
            if (
                prediction.status == "diagnosis_recorded"
                and not self.diagnostic.has_recorded_diagnosis
            ):
                raise ValueError("recorded prediction diagnosis requires diagnostic evidence")
        unique(refs, "evidence references")
        domain_ids = {d.domain_id for d in self.domains}
        if any(r.domain_id is not None and r.domain_id not in domain_ids for r in self.resources):
            raise ValueError("resource domain must exist in the snapshot")
        measured = [d for d in self.domains if d.score is not None]
        average = (
            rounded(sum(Decimal(str(d.score)) for d in measured) / len(measured))
            if measured
            else None
        )
        questions = sum(d.total_questions for d in measured)
        correct = sum(d.correct_questions for d in measured)
        expected = (
            average,
            rounded(Decimal(str(average)) * 100 / 15) if average is not None else None,
            len(measured),
            questions,
            rounded(Decimal(correct) * 100 / questions) if questions else None,
        )
        actual = (
            self.metrics.curriculum_average,
            self.metrics.curriculum_average_percent,
            self.metrics.total_evaluated_domains,
            self.metrics.total_questions_answered,
            self.metrics.overall_accuracy_percent,
        )
        if actual != expected:
            raise ValueError("aggregate metrics must match measured domains")
        if not measured and self.metrics.tests_completed:
            raise ValueError("completed scored tests require measured domains")
        if measured and not self.metrics.tests_completed:
            raise ValueError("measured domains require completed scored tests")
        if measured and (
            max(d.evaluations_count for d in measured) > self.metrics.tests_completed
            or sum(d.evaluations_count for d in measured) < self.metrics.tests_completed
        ):
            raise ValueError("completed tests must be consistent with domain evaluation counts")
        insufficient = not measured or any(d.score is None for d in self.domains)
        if self.stored_prediction:
            insufficient |= self.stored_prediction.prediction.evidence_level != "standard"
        if insufficient and not self.limitations:
            raise ValueError("insufficient evidence requires explicit limitations")
        return self


class DomainFinding(ContractModel):
    domain_id: DomainId
    text: Text
    evidence_refs: Refs


class PedagogicalAction(ContractModel):
    description: Text
    resource_ids: Annotated[list[UUID], Field(max_length=10)]
    evidence_refs: Refs


class StudentReportDocument(ContractModel):
    schema_version: Version
    report_type: Literal["student"]
    language: Language
    title: Label
    summary: Annotated[str, Field(min_length=1, max_length=4000, pattern=r"\S")]
    strengths: Annotated[list[DomainFinding], Field(max_length=20)]
    areas_for_improvement: Annotated[list[DomainFinding], Field(max_length=20)]
    action_plan: Annotated[list[PedagogicalAction], Field(max_length=20)]
    limitations: Annotated[list[Text], Field(max_length=20)]


class ReportGenerationMetadata(ContractModel):
    schema_version: Version
    request_id: UUID
    evidence_snapshot_id: UUID
    generated_at: AwareDatetime
    provider: Label
    model_name: Label
    model_version: Label | None
    prompt_version: Label
    request_schema_version: Version
    evidence_schema_version: Version
    document_schema_version: Version
    requires_professional_review: Literal[True]

    @field_validator("requires_professional_review", mode="before")
    @classmethod
    def review_is_mandatory(cls, value: object) -> object:
        if value is not True:
            raise ValueError("requires_professional_review must be the boolean true")
        return value


def validate_document_evidence(
    document: StudentReportDocument,
    evidence: ReportEvidenceSnapshot,
) -> None:
    if document.language != evidence.request.language:
        raise ValueError("document language must match the request")
    domains = {d.domain_id: d for d in evidence.domains}
    refs = {evidence.metrics.evidence_ref, evidence.diagnostic.evidence_ref}
    refs.update(d.evidence_ref for d in evidence.domains)
    if evidence.stored_prediction:
        refs.add(evidence.stored_prediction.evidence_ref)
    for items, classification in (
        (document.strengths, "consolidated_strength"),
        (document.areas_for_improvement, "intervention"),
    ):
        unique([item.domain_id for item in items], "finding domain IDs")
        for item in items:
            domain = domains.get(item.domain_id)
            if domain is None or domain.classification != classification:
                raise ValueError("finding must match an evidenced domain classification")
            if domain.evidence_ref not in item.evidence_refs:
                raise ValueError("domain findings must reference their own domain evidence")
    resources = {r.resource_id for r in evidence.resources}
    for action in document.action_plan:
        unique(action.resource_ids, "action resource IDs")
        if not set(action.resource_ids) <= resources:
            raise ValueError("action resource IDs must exist in the authorized snapshot")
    for item in [*document.strengths, *document.areas_for_improvement, *document.action_plan]:
        unique(item.evidence_refs, "item evidence references")
        if not set(item.evidence_refs) <= refs:
            raise ValueError("evidence references must exist in the snapshot")
    if evidence.limitations and not document.limitations:
        raise ValueError("document must explain the limitations of the evidence")


class StudentReportGenerationResult(ContractModel):
    schema_version: Version
    evidence: ReportEvidenceSnapshot
    document: StudentReportDocument
    metadata: ReportGenerationMetadata

    @model_validator(mode="after")
    def consistent_result(self) -> Self:
        validate_document_evidence(self.document, self.evidence)
        if self.metadata.evidence_snapshot_id != self.evidence.evidence_snapshot_id:
            raise ValueError("generation metadata must identify this evidence snapshot")
        if self.metadata.generated_at < self.evidence.prepared_at:
            raise ValueError("generation cannot predate the evidence snapshot")
        return self


class ReportStructuredContent(ContractModel):
    schema_version: Version
    report_type: Literal["student"]
    evidence: ReportEvidenceSnapshot
    document: StudentReportDocument | None

    @model_validator(mode="after")
    def consistent_document(self) -> Self:
        if self.document:
            validate_document_evidence(self.document, self.evidence)
        return self


class ReportGenerationContext(ContractModel):
    schema_version: Version
    metadata: ReportGenerationMetadata | None
    content_origin: Literal["prepared", "generated", "human_edited"]
    supersedes_report_id: UUID | None


class StudentReportRecord(ContractModel):
    """Portable values for existing Directus columns, not an authorized write request."""

    school_id: UUID
    student_id: UUID
    class_id: UUID | None
    title: Label
    language: Language
    period_start: date
    period_end: date
    version: Annotated[int, Field(ge=1, strict=True)]
    status: Literal["draft", "generated", "reviewed", "finalized", "archived"]
    structured_content: ReportStructuredContent
    narrative: str | None
    generation_context: ReportGenerationContext
    model_name: Label | None
    model_version: Label | None
    generated_at: AwareDatetime | None
    reviewed_at: AwareDatetime | None
    finalized_at: AwareDatetime | None

    @model_validator(mode="after")
    def consistent_record(self) -> Self:
        # Local import keeps the renderer independent of persistence and providers.
        from app.services.report_generation import render_report_text

        evidence = self.structured_content.evidence
        request = evidence.request
        document = self.structured_content.document
        metadata = self.generation_context.metadata
        if (self.version == 1) != (self.generation_context.supersedes_report_id is None):
            raise ValueError("subsequent versions must identify the report they supersede")
        if (
            self.school_id,
            self.student_id,
            self.class_id,
            self.language,
            self.period_start,
            self.period_end,
        ) != (
            evidence.school_id,
            request.student_id,
            request.class_id,
            request.language,
            request.period.start,
            request.period.end,
        ):
            raise ValueError("record scope must match evidence scope")
        if document is None:
            if self.status not in {"draft", "archived"}:
                raise ValueError("a prepared report is only draft or archived")
            if any(
                v is not None
                for v in (
                    metadata,
                    self.narrative,
                    self.model_name,
                    self.model_version,
                    self.generated_at,
                    self.reviewed_at,
                    self.finalized_at,
                )
            ):
                raise ValueError("prepared reports cannot contain generation or review values")
            if self.generation_context.content_origin != "prepared":
                raise ValueError("prepared reports require prepared content origin")
        else:
            if metadata is None or self.status == "draft":
                raise ValueError("saved narrative requires generation metadata and generated state")
            StudentReportGenerationResult(
                schema_version="1.0",
                evidence=evidence,
                document=document,
                metadata=metadata,
            )
            if self.generation_context.content_origin == "prepared":
                raise ValueError("narrative content cannot be marked prepared")
            if self.narrative != render_report_text(document) or self.title != document.title:
                raise ValueError("title and narrative must be derived from the structured document")
            if (self.model_name, self.model_version, self.generated_at) != (
                metadata.model_name,
                metadata.model_version,
                metadata.generated_at,
            ):
                raise ValueError("generation columns must match server metadata")
            if self.status == "generated" and (self.reviewed_at or self.finalized_at):
                raise ValueError("generated reports are pending professional review")
            if self.status in {"reviewed", "finalized"} and self.reviewed_at is None:
                raise ValueError("reviewed reports require a review timestamp")
            if self.status == "reviewed" and self.finalized_at is not None:
                raise ValueError("review and finalization are separate actions")
            if self.status == "finalized" and self.finalized_at is None:
                raise ValueError("finalized reports require a finalization timestamp")
            if self.reviewed_at and self.reviewed_at < metadata.generated_at:
                raise ValueError("review cannot predate generation")
            if self.finalized_at and (
                self.reviewed_at is None or self.finalized_at < self.reviewed_at
            ):
                raise ValueError("finalization requires an earlier or simultaneous review")
        return self
