"""Persistence, concurrency control, and revision management for student pedagogical reports."""

from __future__ import annotations

import datetime
import json
import logging
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from fastapi import HTTPException
import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings
from app.schemas.report_generation import (
    ReportGenerationContext,
    ReportGenerationMetadata,
    ReportStructuredContent,
    StudentReportDocument,
    StudentReportRecord,
    validate_document_evidence,
)
from app.services.report_evidence import _get_db
from app.services.report_generation import render_report_text

logger = logging.getLogger("ai_service.report_storage")


def get_current_report(report_id: UUID) -> Optional[Dict[str, Any]]:
    """Fetches existing report record for concurrency and status inspection."""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, school_id, student_id, class_id, version, status,
                       structured_content, narrative, generation_context,
                       model_name, model_version, generated_at, reviewed_at, finalized_at
                FROM pedagogical_reports
                WHERE id = %s;
                """,
                (report_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def save_student_report_record(
    student_id: UUID,
    school_id: UUID,
    class_id: Optional[UUID],
    teacher_user_id: UUID,
    document: StudentReportDocument,
    evidence_snapshot: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    content_origin: str = "generated",
    expected_version: Optional[int] = None,
    report_id: Optional[UUID] = None,
    supersedes_report_id: Optional[UUID] = None,
) -> Dict[str, Any]:
    """Saves confirmed report proposal in state 'generated' with concurrency check."""
    # Validate document against evidence snapshot
    from app.schemas.report_generation import ReportEvidenceSnapshot

    ev_snapshot_obj = ReportEvidenceSnapshot.model_validate(evidence_snapshot)
    validate_document_evidence(document, ev_snapshot_obj)

    now = datetime.datetime.now(datetime.timezone.utc)
    metadata_obj = ReportGenerationMetadata.model_validate(metadata) if metadata else None
    if metadata_obj and metadata_obj.evidence_snapshot_id != ev_snapshot_obj.evidence_snapshot_id:
        raise HTTPException(422, "report_metadata_evidence_mismatch")
    generated_at = (
        metadata_obj.generated_at.replace(
            microsecond=(metadata_obj.generated_at.microsecond // 1000) * 1000
        )
        if metadata_obj
        else now
    )
    metadata_payload = (
        metadata_obj.model_copy(update={"generated_at": generated_at}).model_dump(mode="json")
        if metadata_obj
        else None
    )
    narrative = render_report_text(document)

    with _get_db() as conn:
        with conn.cursor() as cur:
            # Check existing report if report_id given
            if report_id:
                cur.execute(
                    "SELECT id, version, status FROM pedagogical_reports WHERE id = %s;",
                    (report_id,),
                )
                existing = cur.fetchone()
                if not existing:
                    raise HTTPException(404, "report_not_found")

                # Concurrency check
                if expected_version is not None and existing["version"] != expected_version:
                    raise HTTPException(
                        409,
                        detail="report_concurrent_modification: report version has changed",
                    )

                # Protected statuses check: reviewed and finalized cannot be overwritten silently
                if existing["status"] in ("reviewed", "finalized"):
                    if not supersedes_report_id:
                        raise HTTPException(
                            409,
                            detail="report_status_locked: reviewed or finalized reports require superseding as a new version",
                        )

            # Determine version and supersedes
            if supersedes_report_id:
                cur.execute(
                    "SELECT version, status FROM pedagogical_reports WHERE id = %s;",
                    (supersedes_report_id,),
                )
                prior = cur.fetchone()
                if not prior:
                    raise HTTPException(404, "superseded_report_not_found")
                new_version = prior["version"] + 1
                save_id = report_id or uuid4()
                # Archive the superseded report
                cur.execute(
                    "UPDATE pedagogical_reports SET status = 'archived' WHERE id = %s;",
                    (supersedes_report_id,),
                )
            elif report_id:
                new_version = existing["version"]
                save_id = report_id
            else:
                new_version = 1
                save_id = uuid4()

            structured_content = {
                "schema_version": "1.0",
                "report_type": "student",
                "evidence": ev_snapshot_obj.model_dump(mode="json"),
                "document": document.model_dump(mode="json"),
            }

            gen_ctx = {
                "schema_version": "1.0",
                "metadata": metadata_payload,
                "content_origin": content_origin,
                "supersedes_report_id": str(supersedes_report_id) if supersedes_report_id else None,
            }

            # Directus user profile ID for teacher if exists
            cur.execute(
                "SELECT id FROM teacher_profiles WHERE directus_user_id = %s;",
                (teacher_user_id,),
            )
            tp_row = cur.fetchone()
            teacher_profile_id = tp_row["id"] if tp_row else None

            # Always saved with status = 'generated'
            cur.execute(
                """
                INSERT INTO pedagogical_reports (
                    id, school_id, student_id, class_id, created_by_teacher_id,
                    title, language, period_start, period_end, version, status,
                    structured_content, narrative, generation_context,
                    model_name, model_version, generated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s
                )
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    language = EXCLUDED.language,
                    period_start = EXCLUDED.period_start,
                    period_end = EXCLUDED.period_end,
                    version = EXCLUDED.version,
                    status = EXCLUDED.status,
                    structured_content = EXCLUDED.structured_content,
                    narrative = EXCLUDED.narrative,
                    generation_context = EXCLUDED.generation_context,
                    model_name = EXCLUDED.model_name,
                    model_version = EXCLUDED.model_version,
                    generated_at = EXCLUDED.generated_at
                RETURNING id, version, status, generated_at;
                """,
                (
                    save_id,
                    school_id,
                    student_id,
                    class_id,
                    teacher_profile_id,
                    document.title,
                    document.language,
                    ev_snapshot_obj.request.period.start,
                    ev_snapshot_obj.request.period.end,
                    new_version,
                    "generated",
                    json.dumps(structured_content),
                    narrative,
                    json.dumps(gen_ctx),
                    metadata_obj.model_name if metadata_obj else None,
                    metadata_obj.model_version if metadata_obj else None,
                    generated_at,
                ),
            )
            saved = cur.fetchone()
            conn.commit()

            return {
                "id": str(saved["id"]),
                "version": saved["version"],
                "status": saved["status"],
                "generated_at": saved["generated_at"].isoformat() if saved["generated_at"] else None,
                "title": document.title,
            }


def update_report_status(report_id: UUID, next_status: str) -> Dict[str, Any]:
    """Transitions report status (e.g. generated -> reviewed, reviewed -> finalized)."""
    allowed_transitions = {
        "generated": ["reviewed", "archived"],
        "reviewed": ["finalized", "archived"],
        "finalized": ["archived"],
    }

    now = datetime.datetime.now(datetime.timezone.utc)

    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, status, version FROM pedagogical_reports WHERE id = %s;", (report_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "report_not_found")

            current_status = row["status"]
            if next_status not in allowed_transitions.get(current_status, []):
                raise HTTPException(
                    400,
                    f"Invalid status transition from '{current_status}' to '{next_status}'",
                )

            reviewed_at = now if next_status == "reviewed" else None
            finalized_at = now if next_status == "finalized" else None

            cur.execute(
                """
                UPDATE pedagogical_reports
                SET status = %s,
                    reviewed_at = COALESCE(reviewed_at, %s),
                    finalized_at = COALESCE(finalized_at, %s)
                WHERE id = %s
                RETURNING id, version, status, reviewed_at, finalized_at;
                """,
                (next_status, reviewed_at, finalized_at, report_id),
            )
            updated = cur.fetchone()
            conn.commit()

            return dict(updated)

