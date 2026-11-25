import { createResource, createSignal, For, Show, type Component } from "solid-js";
import { useI18n } from "../../lib/i18n";
import {
  getStudentReportDocument, getStudentReportPdf, listStudentReportDocuments,
  ReportDocumentError, saveReportPdf,
} from "../../services/report-document";
import { Button } from "../ui/Button";
import { ReportDocument } from "./ReportDocument";

export const SavedStudentReports: Component<{
  studentId: string;
  classId: string;
  refreshKey?: number;
}> = (props) => {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = createSignal("");
  const [downloading, setDownloading] = createSignal(false);
  const [downloadError, setDownloadError] = createSignal<unknown>(null);
  const [reports, { refetch: reloadList }] = createResource(
    () => ({
      studentId: props.studentId,
      classId: props.classId,
      refreshKey: props.refreshKey ?? 0,
    }),
    async (scope) => {
      setSelectedId("");
      setDownloadError(null);
      return listStudentReportDocuments(scope.studentId, scope.classId);
    },
  );
  const currentId = () => reports.error ? "" : selectedId() || reports()?.[0]?.id || "";
  const [document, { refetch: reloadDocument }] = createResource(currentId, getStudentReportDocument);
  const errorMessage = (error: unknown) => {
    const code = error instanceof ReportDocumentError ? error.code : "failed";
    return t(`report.document.error.${code}`);
  };
  const download = async () => {
    if (document.error || document.loading || downloading()) return;
    const report = document();
    if (!report) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      saveReportPdf(await getStudentReportPdf(report), report);
    } catch (error) {
      setDownloadError(error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section class="space-y-4 rounded-3xl border border-line bg-canvas-soft p-4 sm:p-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold text-ink">{t("report.document.saved")}</h2>
          <p class="mt-1 text-sm text-ink-muted">{t("report.document.savedHelp")}</p>
        </div>
        <Button variant="secondary" disabled={reports.loading || document.loading || downloading()} onClick={() => {
          setDownloadError(null);
          void reloadList();
          void reloadDocument();
        }}>{t("report.document.refresh")}</Button>
      </div>
      <Show when={reports.loading || document.loading}><p role="status">{t("common.loading")}</p></Show>
      <Show when={reports.error}><p role="alert" class="text-danger">{errorMessage(reports.error)}</p></Show>
      <Show when={!reports.loading && !reports.error && reports()?.length === 0}>
        <p class="text-sm text-ink-muted">{t("report.document.empty")}</p>
      </Show>
      <Show when={!reports.error && reports()?.length}>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label class="min-w-0 flex-1 text-sm font-semibold text-ink">
            {t("report.document.version")}
            <select class="mt-1 block w-full rounded-xl border border-line bg-white p-3" value={currentId()} disabled={reports.loading || downloading()} onChange={(event) => {
              setSelectedId(event.currentTarget.value);
              setDownloadError(null);
            }}>
              <For each={reports()}>{(report) => (
                <option value={report.id}>{report.title} · v{report.version} · {report.generated_at?.slice(0, 10)}</option>
              )}</For>
            </select>
          </label>
          <Button disabled={document.loading || Boolean(document.error) || !document() || downloading()} onClick={download}>
            {t(downloading() ? "report.document.downloading" : "report.document.download")}
          </Button>
        </div>
      </Show>
      <Show when={document.error}><p role="alert" class="text-danger">{errorMessage(document.error)}</p></Show>
      <Show when={downloadError()}><p role="alert" class="text-danger">{errorMessage(downloadError())}</p></Show>
      <Show when={!reports.loading && !reports.error && !document.loading && !document.error && document()}>
        {(report) => <ReportDocument report={report()} />}
      </Show>
    </section>
  );
};
