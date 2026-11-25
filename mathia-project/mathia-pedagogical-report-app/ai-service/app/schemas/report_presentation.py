"""Read-only representation shared by the SPA and the PDF renderer."""

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.report_generation import ContractModel, Label, Language


class ReportIdentity(ContractModel):
    student_name: Label
    school_name: Label
    class_name: Label | None = None


class ReportDetail(ContractModel):
    label: str
    value: str


class ReportLink(ContractModel):
    title: str
    url: str | None = None


class ReportBlock(ContractModel):
    text: str
    label: str | None = None
    links: list[ReportLink] = Field(default_factory=list)


class ReportSection(ContractModel):
    key: str
    title: str
    blocks: list[ReportBlock]


class StudentReportPresentation(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    report_id: UUID
    version: int
    revision: str
    language: Language
    title: str
    status: str
    status_label: str
    is_draft: bool
    page_label: str
    details: list[ReportDetail]
    sections: list[ReportSection]
