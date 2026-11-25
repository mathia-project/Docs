# Report presentation and PDF

GET /ai/reports/student/{report_id} reads a saved report and returns the validated presentation used by the SPA. GET /ai/reports/student/{report_id}/pdf?revision={revision} renders its PDF using ReportLab.

Both endpoints forward the user token to Directus to enforce permissions. Reports include identity, period, version, evidence, recommendations, resources and limitations. The narrative comes from structured_content.document.

The revision identifies the content viewed. If it changes before download, the service returns 409 report_revision_changed; refresh the preview before retrying. Drafts are marked as awaiting review.

PDFs are authenticated downloads with no permanent public files. Only HTTP(S) resource links accessible to the current user are included. Downloads do not invoke AI generation.

See the [generation contract](report-generation-contract.md) for schemas and evidence.
