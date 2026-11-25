import { createResource, createSignal, For, Show, type Component } from "solid-js";
import { ReportDocument } from "../../components/reports/ReportDocument";
import { useI18n } from "../../lib/i18n";
import type { ReportPresentation } from "../../services/report-document";

/** Available only in Vite development. Files are generated locally from fictional fixtures. */
export const ReportExamplesPage: Component = () => {
  const { t } = useI18n();
  const [example, setExample] = createSignal("short-es");
  const [report] = createResource(example, async (name) => {
    const response = await fetch(`/__report-examples/${name}.json`);
    if (!response.ok) throw new Error("Examples have not been generated");
    return response.json() as Promise<ReportPresentation>;
  });
  return (
    <main class="min-h-screen space-y-6 bg-canvas p-4 sm:p-8">
      <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-4">
        <h1 class="w-full text-xl font-bold">{t("report.document.examples")}</h1>
        <label class="flex flex-wrap items-center gap-3">
          {t("report.document.version")}
          <select class="rounded-xl border border-line bg-white p-3" value={example()} onChange={(event) => setExample(event.currentTarget.value)}>
            <For each={["short-es", "long-es", "empty-es", "short-en", "long-en", "empty-en", "short-it", "long-it", "empty-it"]}>
              {(name) => <option value={name}>{name}</option>}
            </For>
          </select>
        </label>
        <Show when={!report.loading && !report.error && report()}>
          <a class="font-semibold text-brand underline" href={`/__report-examples/${example()}.pdf`} download="">{t("report.document.download")}</a>
        </Show>
      </div>
      <Show when={report.error}><p role="alert">{t("report.document.error.failed")}</p></Show>
      <Show when={!report.loading && !report.error && report()}>
        {(value) => <ReportDocument report={value()} />}
      </Show>
    </main>
  );
};
