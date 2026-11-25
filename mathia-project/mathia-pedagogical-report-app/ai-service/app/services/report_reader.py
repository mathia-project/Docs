"""Read saved reports through Directus with the caller's relational permissions."""

import json
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.report_generation import StudentReportRecord
from app.schemas.report_presentation import ReportIdentity, StudentReportPresentation
from app.services.report_presentation import present_student_report

REPORT_FIELDS = ",".join(StudentReportRecord.model_fields)


async def read_student_report(report_id: UUID, token: str) -> StudentReportPresentation:
    """No admin token, database bypass, writes, provider calls or model execution."""
    async with httpx.AsyncClient(
        base_url=get_settings().directus_url.rstrip("/") + "/",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
        follow_redirects=False,
    ) as client:

        async def get(path: str, params: dict, *, optional: bool = False):
            try:
                response = await client.get(path, params=params)
            except httpx.RequestError as exc:
                raise HTTPException(503, "report_service_unavailable") from exc
            if response.status_code == 401:
                raise HTTPException(401, "report_authentication_required")
            if response.status_code in {403, 404}:
                if optional:
                    return []
                # Do not distinguish a missing report from one outside the caller's scope.
                raise HTTPException(404, "report_unavailable")
            if response.status_code != 200:
                raise HTTPException(503, "report_service_unavailable")
            try:
                return response.json()["data"]
            except (ValueError, KeyError, TypeError) as exc:
                raise HTTPException(503, "report_service_unavailable") from exc

        raw = await get(f"items/pedagogical_reports/{report_id}", {"fields": REPORT_FIELDS})
        try:
            record = StudentReportRecord.model_validate(raw)
        except ValidationError as exc:
            # Legacy/browser drafts must never be relabeled as validated narrative reports.
            raise HTTPException(409, "report_document_unavailable") from exc
        if record.structured_content.document is None:
            raise HTTPException(409, "report_document_unavailable")
        student = await get(
            f"items/student_profiles/{record.student_id}",
            {
                "fields": "first_name,last_name,school_id",
            },
        )
        school = await get(f"items/schools/{record.school_id}", {"fields": "name"})
        classroom = None
        if record.class_id:
            classroom = await get(
                f"items/classes/{record.class_id}",
                {
                    "fields": "name,school_id",
                },
            )
        try:
            if UUID(student["school_id"]) != record.school_id or (
                classroom and UUID(classroom["school_id"]) != record.school_id
            ):
                raise ValueError("scope mismatch")
            identity = ReportIdentity(
                student_name=f"{student['first_name']} {student['last_name']}".strip(),
                school_name=school["name"],
                class_name=classroom["name"] if classroom else None,
            )
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(409, "report_document_unavailable") from exc

        resource_ids = {
            str(rid)
            for action in record.structured_content.document.action_plan
            for rid in action.resource_ids
        }
        urls = {}
        if resource_ids:
            # Resources can have changed permissions since generation. Keep snapshot titles,
            # but expose links only for resources Directus still allows this user to read.
            resources = await get(
                "items/resources",
                {
                    "fields": "id,url",
                    "limit": "100",
                    "filter": json.dumps({"id": {"_in": sorted(resource_ids)}}),
                },
                optional=True,
            )
            try:
                urls = {UUID(item["id"]): item.get("url") for item in resources}
            except (ValueError, KeyError, TypeError) as exc:
                raise HTTPException(503, "report_service_unavailable") from exc
        return present_student_report(report_id, record, identity, urls)
