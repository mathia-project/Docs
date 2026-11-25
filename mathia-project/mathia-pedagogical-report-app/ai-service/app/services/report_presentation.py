"""Deterministic presentation of a validated, saved report, without generation."""

import hashlib
import json
from datetime import UTC
from urllib.parse import urlsplit
from uuid import UUID

from app.schemas.report_generation import StudentReportRecord
from app.schemas.report_presentation import (
    ReportBlock,
    ReportDetail,
    ReportIdentity,
    ReportLink,
    ReportSection,
    StudentReportPresentation,
)
from app.services.report_generation import SECTION_LABELS

LABELS = {
    "en": {
        "student": "Student",
        "school": "School",
        "class": "Class",
        "period": "Period",
        "version": "Version",
        "generated": "Generated (UTC)",
        "reviewed": "Reviewed (UTC)",
        "finalized": "Finalized (UTC)",
        "empty": "None recorded.",
        "page": "Page",
        "resources": "Resources",
        "generated_status": "DRAFT - pending professional review",
        "reviewed_status": "Reviewed",
        "finalized_status": "Finalized",
        "archived_status": "Archived",
        "unreviewed_archive": "Archived - pending professional review",
    },
    "es": {
        "student": "Estudiante",
        "school": "Centro",
        "class": "Clase",
        "period": "Periodo",
        "version": "Versión",
        "generated": "Generado (UTC)",
        "reviewed": "Revisado (UTC)",
        "finalized": "Finalizado (UTC)",
        "empty": "Sin elementos registrados.",
        "page": "Página",
        "resources": "Recursos",
        "generated_status": "BORRADOR - pendiente de revisión docente",
        "reviewed_status": "Revisado",
        "finalized_status": "Finalizado",
        "archived_status": "Archivado",
        "unreviewed_archive": "Archivado - pendiente de revisión docente",
    },
    "it": {
        "student": "Studente",
        "school": "Scuola",
        "class": "Classe",
        "period": "Periodo",
        "version": "Versione",
        "generated": "Generato (UTC)",
        "reviewed": "Revisionato (UTC)",
        "finalized": "Finalizzato (UTC)",
        "empty": "Nessun elemento registrato.",
        "page": "Pagina",
        "resources": "Risorse",
        "generated_status": "BOZZA - in attesa di revisione del docente",
        "reviewed_status": "Revisionato",
        "finalized_status": "Finalizzato",
        "archived_status": "Archiviato",
        "unreviewed_archive": "Archiviato - in attesa di revisione del docente",
    },
}


def safe_resource_url(value: object) -> str | None:
    """Only external HTTP(S) links; the renderer never fetches them."""
    if not isinstance(value, str) or len(value) > 4096:
        return None
    if any(character.isspace() or ord(character) < 32 for character in value):
        return None
    try:
        parts = urlsplit(value)
        if parts.scheme in {"http", "https"} and parts.hostname and not parts.username:
            return value
    except ValueError:
        pass
    return None


def present_student_report(
    report_id: UUID,
    record: StudentReportRecord,
    identity: ReportIdentity,
    resource_urls: dict[UUID, str | None] | None = None,
) -> StudentReportPresentation:
    record = StudentReportRecord.model_validate(record.model_dump())
    document = record.structured_content.document
    if document is None:
        raise ValueError("report_document_unavailable")
    labels = LABELS[record.language]
    headings = SECTION_LABELS[record.language]
    evidence = record.structured_content.evidence
    domains = {domain.domain_id: domain.domain_name for domain in evidence.domains}
    resources = {resource.resource_id: resource for resource in evidence.resources}
    resource_urls = resource_urls or {}

    def section(key: str, title: str, blocks: list[ReportBlock]) -> ReportSection:
        return ReportSection(
            key=key, title=title, blocks=blocks or [ReportBlock(text=labels["empty"])]
        )

    sections = [section("summary", headings[0], [ReportBlock(text=document.summary)])]
    for key, heading, findings in (
        ("strengths", headings[1], document.strengths),
        ("areas_for_improvement", headings[2], document.areas_for_improvement),
    ):
        sections.append(
            section(
                key,
                heading,
                [
                    ReportBlock(label=domains[finding.domain_id], text=finding.text)
                    for finding in findings
                ],
            )
        )
    sections.append(
        section(
            "action_plan",
            headings[3],
            [
                ReportBlock(
                    label=str(index),
                    text=action.description,
                    links=[ReportLink(title=resources[rid].title) for rid in action.resource_ids],
                )
                for index, action in enumerate(document.action_plan, 1)
            ],
        )
    )
    used_resources = dict.fromkeys(
        rid for action in document.action_plan for rid in action.resource_ids
    )
    sections.append(
        section(
            "resources",
            labels["resources"],
            [
                ReportBlock(
                    text=resources[rid].title,
                    links=[
                        ReportLink(
                            title=labels["resources"], url=safe_resource_url(resource_urls.get(rid))
                        )
                    ]
                    if safe_resource_url(resource_urls.get(rid))
                    else [],
                )
                for rid in used_resources
            ],
        )
    )
    sections.append(
        section(
            "limitations",
            headings[4],
            [ReportBlock(text=limitation) for limitation in document.limitations],
        )
    )

    details = [
        ReportDetail(label=labels["student"], value=identity.student_name),
        ReportDetail(label=labels["school"], value=identity.school_name),
    ]
    if identity.class_name:
        details.append(ReportDetail(label=labels["class"], value=identity.class_name))
    details.extend(
        [
            ReportDetail(
                label=labels["period"], value=f"{record.period_start} / {record.period_end}"
            ),
            ReportDetail(label=labels["version"], value=str(record.version)),
        ]
    )
    for key, timestamp in (
        ("generated", record.generated_at),
        ("reviewed", record.reviewed_at),
        ("finalized", record.finalized_at),
    ):
        if timestamp:
            details.append(
                ReportDetail(
                    label=labels[key], value=timestamp.astimezone(UTC).strftime("%Y-%m-%d %H:%M")
                )
            )
    status_label = labels[f"{record.status}_status"]
    if record.status == "archived" and record.reviewed_at is None:
        status_label = labels["unreviewed_archive"]
    presentation = StudentReportPresentation(
        report_id=report_id,
        version=record.version,
        revision="",
        language=record.language,
        title=document.title,
        status=record.status,
        status_label=status_label,
        is_draft=record.reviewed_at is None,
        page_label=labels["page"],
        details=details,
        sections=sections,
    )
    # Include the full saved record: concurrent edits to evidence or review metadata
    # also invalidate a previously opened preview, even when narrative is unchanged.
    canonical = json.dumps(
        [record.model_dump(mode="json"), presentation.model_dump(mode="json")],
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    presentation.revision = hashlib.sha256(canonical.encode()).hexdigest()
    return presentation
