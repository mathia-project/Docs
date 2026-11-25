# Student report generation contract

The executable contracts are defined in [report_generation.py](../ai-service/app/schemas/report_generation.py). The six JSON schemas in [data/reports](../data/reports/) are exported from Pydantic and must not be edited independently.

From ai-service, run `python -m app.schemas.export_report_schemas --check` to verify the exports. The contract version is 1.0. Pydantic also enforces cross-field calculations, references, languages and report states; JSON Schema validation alone is insufficient.

| Model | Exported schema |
| --- | --- |
| StudentReportGenerationRequest | report-generation-request.schema.json |
| ReportEvidenceSnapshot | report-generation-evidence.schema.json |
| StudentReportDocument | report-generation-document.schema.json |
| ReportGenerationMetadata | report-generation-metadata.schema.json |
| StudentReportGenerationResult | report-generation-result.schema.json |
| StudentReportRecord | report-generation-record.schema.json |

The request specifies student_id, an optional class_id, an inclusive ordered date period, and a language. Authorized evidence is resolved by the server; browser-supplied scores and identities are not authoritative.

POST /ai/reports/student/draft prepares a proposal. POST /ai/reports/student/save persists a validated proposal. POST /ai/reports/student/{report_id}/status changes its review status. See the running OpenAPI documentation for current payloads and errors.

Evidence includes assessment scope, calculations, available resources, stored prediction information and limitations. Report generation and model inference are separate operations. Insufficient evidence must remain explicit; generation must not invent diagnoses, scores or resources.

Saved reports preserve structured content, narrative, generation metadata and review state. The narrative is rendered deterministically from the structured document. The local Compose deployment uses simulated generation.

Fictional fixtures under data/reports/examples cover valid results, missing evidence and rejected inputs. Presentation and authenticated PDF download are described in [report-presentation-pdf.md](report-presentation-pdf.md).
