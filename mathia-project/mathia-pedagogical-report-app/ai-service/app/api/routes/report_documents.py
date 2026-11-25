import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from starlette.concurrency import run_in_threadpool

from app.schemas.base import ApiModel
from app.schemas.report_generation import (
    ReportPeriod,
    StudentReportDocument,
    StudentReportGenerationResult,
)
from app.schemas.report_presentation import StudentReportPresentation
from app.services.report_evidence import (
    collect_report_evidence,
    resolve_report_authorization,
)
from app.services.report_generator import generate_student_report_proposal
from app.services.report_pdf import render_student_report_pdf
from app.services.report_reader import read_student_report
from app.services.report_storage import (
    get_current_report,
    save_student_report_record,
    update_report_status,
)

router = APIRouter(prefix="/ai/reports/student", tags=["report documents"])
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


def report_token(authorization: Annotated[str | None, Header()] = None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "report_authentication_required")
    return token.strip()


@router.get("/{report_id}", response_model=StudentReportPresentation)
async def get_student_report_document(
    report_id: UUID,
    response: Response,
    token: Annotated[str, Depends(report_token)],
) -> StudentReportPresentation:
    report = await read_student_report(report_id, token)
    response.headers.update(PRIVATE_HEADERS)
    return report


@router.get(
    "/{report_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
async def download_student_report_pdf(
    report_id: UUID,
    token: Annotated[str, Depends(report_token)],
    revision: Annotated[str, Query(pattern=r"^[a-f0-9]{64}$")],
) -> Response:
    report = await read_student_report(report_id, token)
    if revision != report.revision:
        raise HTTPException(409, "report_revision_changed")
    content = await run_in_threadpool(render_student_report_pdf, report)
    return Response(
        content,
        media_type="application/pdf",
        headers={
            **PRIVATE_HEADERS,
            "Content-Disposition": (
                f'attachment; filename="report-{report_id}-v{report.version}.pdf"'
            ),
        },
    )


class DraftReportRequestBody(ApiModel):
    student_id: UUID
    class_id: UUID | None = None
    period_start: datetime.date
    period_end: datetime.date
    language: Literal["en", "es", "it"] = "es"


class SaveReportRequestBody(ApiModel):
    student_id: UUID
    class_id: UUID | None = None
    document: StudentReportDocument
    evidence_snapshot: dict[str, Any]
    metadata: dict[str, Any] | None = None
    content_origin: Literal["generated", "human_edited"] = "generated"
    expected_version: int | None = None
    report_id: UUID | None = None
    supersedes_report_id: UUID | None = None


class UpdateReportStatusBody(ApiModel):
    status: Literal["reviewed", "finalized", "archived"]


@router.post("/draft", response_model=StudentReportGenerationResult)
async def draft_student_report_proposal(
    body: DraftReportRequestBody,
    token: Annotated[str, Depends(report_token)],
) -> StudentReportGenerationResult:
    """Prepares authorized evidence snapshot and generates a proposed document for teacher review."""
    auth_info = await resolve_report_authorization(body.student_id, body.class_id, token)
    school_id = UUID(str(auth_info["school"]["id"]))
    period = ReportPeriod(start=body.period_start, end=body.period_end)

    evidence = await run_in_threadpool(
        collect_report_evidence,
        body.student_id,
        body.class_id,
        period,
        body.language,
        school_id,
    )
    result = await generate_student_report_proposal(evidence)
    return result


@router.post("/save")
async def save_student_report_proposal(
    body: SaveReportRequestBody,
    token: Annotated[str, Depends(report_token)],
) -> dict[str, Any]:
    """Saves confirmed report proposal in state 'generated' with concurrency validation."""
    auth_info = await resolve_report_authorization(body.student_id, body.class_id, token)
    school_id = UUID(str(auth_info["school"]["id"]))
    user_id = UUID(str(auth_info["user"]["id"]))

    saved = await run_in_threadpool(
        save_student_report_record,
        student_id=body.student_id,
        school_id=school_id,
        class_id=body.class_id,
        teacher_user_id=user_id,
        document=body.document,
        evidence_snapshot=body.evidence_snapshot,
        metadata=body.metadata,
        content_origin=body.content_origin,
        expected_version=body.expected_version,
        report_id=body.report_id,
        supersedes_report_id=body.supersedes_report_id,
    )
    return saved


@router.post("/{report_id}/status")
async def transition_report_status(
    report_id: UUID,
    body: UpdateReportStatusBody,
    token: Annotated[str, Depends(report_token)],
) -> dict[str, Any]:
    """Teacher or director action to transition status (generated -> reviewed, reviewed -> finalized)."""
    # Verify authentication and access
    current = get_current_report(report_id)
    if not current:
        raise HTTPException(404, "report_not_found")

    await resolve_report_authorization(current["student_id"], current["class_id"], token)
    updated = await run_in_threadpool(update_report_status, report_id, body.status)
    return updated

