"""Pure contract helpers. No provider calls, prediction execution or database writes."""

from app.schemas.report_generation import (
    StudentReportDocument,
    StudentReportGenerationResult,
    StudentReportRecord,
)

SECTION_LABELS = {
    "en": ("Summary", "Strengths", "Areas for improvement", "Action plan", "Limitations"),
    "es": ("Resumen", "Fortalezas", "Áreas de mejora", "Plan de acción", "Limitaciones"),
    "it": ("Sintesi", "Punti di forza", "Aree di miglioramento", "Piano d'azione", "Limitazioni"),
}


def render_report_text(document: StudentReportDocument) -> str:
    """Deterministic plain-text compatibility column; never HTML or a PDF template."""
    labels = SECTION_LABELS[document.language]
    empty = {
        "en": "None recorded.",
        "es": "Sin elementos registrados.",
        "it": "Nessun elemento registrato.",
    }[document.language]
    resources_label = {"en": "Resources", "es": "Recursos", "it": "Risorse"}[
        document.language
    ]
    actions = [
        action.description
        + (
            f" ({resources_label}: {', '.join(str(value) for value in action.resource_ids)})"
            if action.resource_ids
            else ""
        )
        for action in document.action_plan
    ]
    sections = [document.title, f"{labels[0]}\n{document.summary}"]
    for label, items in zip(
        labels[1:],
        (
            [item.text for item in document.strengths],
            [item.text for item in document.areas_for_improvement],
            actions,
            document.limitations,
        ),
        strict=True,
    ):
        body = "\n".join(f"- {item}" for item in items) if items else empty
        sections.append(f"{label}\n{body}")
    return "\n\n".join(sections)


def generated_report_record(result: StudentReportGenerationResult) -> StudentReportRecord:
    """Build a new generated version for contract round-trips, without saving it."""
    # Revalidate even if a caller mutated an already constructed Pydantic object.
    result = StudentReportGenerationResult.model_validate(result.model_dump())
    evidence, document, metadata = result.evidence, result.document, result.metadata
    return StudentReportRecord.model_validate(
        {
            "school_id": evidence.school_id,
            "student_id": evidence.request.student_id,
            "class_id": evidence.request.class_id,
            "title": document.title,
            "language": document.language,
            "period_start": evidence.request.period.start,
            "period_end": evidence.request.period.end,
            "version": 1,
            "status": "generated",
            "structured_content": {
                "schema_version": "1.0",
                "report_type": "student",
                "evidence": evidence,
                "document": document,
            },
            "narrative": render_report_text(document),
            "generation_context": {
                "schema_version": "1.0",
                "metadata": metadata,
                "content_origin": "generated",
                "supersedes_report_id": None,
            },
            "model_name": metadata.model_name,
            "model_version": metadata.model_version,
            "generated_at": metadata.generated_at,
            "reviewed_at": None,
            "finalized_at": None,
        }
    )
