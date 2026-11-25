import { readItems } from "@directus/sdk";
import { appConfig } from "./config";
import { directus } from "./directus";
import type { PedagogicalReport } from "./schema";

export interface ReportPresentation {
  schema_version: "1.0";
  report_id: string;
  version: number;
  revision: string;
  language: "en" | "es" | "it";
  title: string;
  status: string;
  status_label: string;
  is_draft: boolean;
  page_label: string;
  details: Array<{ label: string; value: string }>;
  sections: Array<{
    key: string;
    title: string;
    blocks: Array<{
      text: string;
      label: string | null;
      links: Array<{ title: string; url: string | null }>;
    }>;
  }>;
}

export class ReportDocumentError extends Error {
  constructor(readonly code: "changed" | "unavailable" | "unsupported" | "authentication" | "failed") {
    super(code);
  }
}

async function requestReport(path: string): Promise<Response> {
  const token = await directus.getToken();
  if (!token) throw new ReportDocumentError("authentication");
  const response = await fetch(`${appConfig.aiServiceUrl}/ai/reports/student/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new ReportDocumentError(
      body?.detail === "report_revision_changed" ? "changed" :
        response.status === 401 ? "authentication" :
          response.status === 404 ? "unavailable" :
            response.status === 409 ? "unsupported" : "failed",
    );
  }
  return response;
}

export async function listStudentReportDocuments(studentId: string, classId?: string) {
  return await directus.request(readItems("pedagogical_reports", {
    fields: ["id", "title", "version", "status", "generated_at"],
    filter: {
      student_id: { _eq: studentId },
      ...(classId ? { class_id: { _eq: classId } } : {}),
      status: { _in: ["generated", "reviewed", "finalized", "archived"] },
    },
    sort: ["-generated_at", "-version"],
    limit: -1,
  })) as Pick<PedagogicalReport, "id" | "title" | "version" | "status" | "generated_at">[];
}

export async function getStudentReportDocument(id: string): Promise<ReportPresentation> {
  return (await requestReport(encodeURIComponent(id))).json() as Promise<ReportPresentation>;
}

export async function getStudentReportPdf(report: ReportPresentation): Promise<Blob> {
  const response = await requestReport(
    `${encodeURIComponent(report.report_id)}/pdf?revision=${encodeURIComponent(report.revision)}`,
  );
  if (!response.headers.get("Content-Type")?.startsWith("application/pdf")) {
    throw new ReportDocumentError("failed");
  }
  return response.blob();
}

export function saveReportPdf(blob: Blob, report: ReportPresentation): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `report-${report.report_id}-v${report.version}.pdf`;
  link.click();
  // Allow the browser to begin consuming the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface DomainFindingDraft {
  domain_id: string;
  text: string;
  evidence_refs: string[];
}

export interface PedagogicalActionDraft {
  description: string;
  resource_ids: string[];
  evidence_refs: string[];
}

export interface StudentReportDocumentDraft {
  schema_version: "1.0";
  report_type: "student";
  language: "en" | "es" | "it";
  title: string;
  summary: string;
  strengths: DomainFindingDraft[];
  areas_for_improvement: DomainFindingDraft[];
  action_plan: PedagogicalActionDraft[];
  limitations: string[];
}

export interface StudentReportGenerationProposal {
  schema_version: "1.0";
  evidence: Record<string, unknown>;
  document: StudentReportDocumentDraft;
  metadata: Record<string, unknown>;
}

export async function draftStudentReportProposal(params: {
  student_id: string;
  class_id?: string | null;
  period_start: string;
  period_end: string;
  language: "en" | "es" | "it";
}): Promise<StudentReportGenerationProposal> {
  const token = await directus.getToken();
  if (!token) throw new ReportDocumentError("authentication");
  const response = await fetch(`${appConfig.aiServiceUrl}/ai/reports/student/draft`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    if (response.status === 401) throw new ReportDocumentError("authentication");
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || `Report generation failed with status ${response.status}`);
  }
  return (await response.json()) as StudentReportGenerationProposal;
}

export async function saveStudentReportProposal(params: {
  student_id: string;
  class_id?: string | null;
  document: StudentReportDocumentDraft;
  evidence_snapshot: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  content_origin?: "generated" | "human_edited";
  expected_version?: number | null;
  report_id?: string | null;
  supersedes_report_id?: string | null;
}): Promise<{ id: string; version: number; status: string; generated_at: string; title: string }> {
  const token = await directus.getToken();
  if (!token) throw new ReportDocumentError("authentication");
  const response = await fetch(`${appConfig.aiServiceUrl}/ai/reports/student/save`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    if (response.status === 401) throw new ReportDocumentError("authentication");
    if (response.status === 409) throw new ReportDocumentError("changed");
    throw new ReportDocumentError("failed");
  }
  return (await response.json()) as { id: string; version: number; status: string; generated_at: string; title: string };
}

export async function updateStudentReportStatus(
  reportId: string,
  newStatus: "reviewed" | "finalized" | "archived",
): Promise<{ id: string; version: number; status: string }> {
  const token = await directus.getToken();
  if (!token) throw new ReportDocumentError("authentication");
  const response = await fetch(`${appConfig.aiServiceUrl}/ai/reports/student/${encodeURIComponent(reportId)}/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: newStatus }),
  });
  if (!response.ok) {
    if (response.status === 401) throw new ReportDocumentError("authentication");
    if (response.status === 409) throw new ReportDocumentError("changed");
    throw new ReportDocumentError("failed");
  }
  return (await response.json()) as { id: string; version: number; status: string };
}

