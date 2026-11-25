import { createMemo, createSignal, For, Show, type Component } from "solid-js";

import { extractErrorMessage } from "../../lib/errors";
import { useI18n, type Locale } from "../../lib/i18n";
import type { CurriculumCatalog } from "../../services/question-bank";
import {
  parseResourceImport,
  type ParsedResourceImportRow,
  type ResourceImportFormat,
} from "../../services/resource-import";
import { resourceService } from "../../services/resources";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface ResourceImportModalProps {
  isOpen: boolean;
  catalog: CurriculumCatalog | undefined;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

interface Preview {
  rows: ParsedResourceImportRow[];
  parseError: string | null;
}

const exampleText: Record<Locale, {
  guideTitle: string;
  description: string;
  videoTitle: string;
  videoDescription: string;
  body: string;
  prompt: string;
  tag: string;
}> = {
  en: {
    guideTitle: "Guide to algebraic expressions",
    description: "Introductory material",
    videoTitle: "Video about equations",
    videoDescription: "Step by step solution",
    body: "# Algebraic expressions",
    prompt: "Create a short guide to variables and coefficients for level 6.",
    tag: "algebra",
  },
  es: {
    guideTitle: "Guía de expresiones algebraicas",
    description: "Material introductorio",
    videoTitle: "Vídeo de ecuaciones",
    videoDescription: "Resolución paso a paso",
    body: "# Expresiones algebraicas",
    prompt: "Crea una guía breve para comprender variables y coeficientes en 6º.",
    tag: "álgebra",
  },
  it: {
    guideTitle: "Guida alle espressioni algebriche",
    description: "Materiale introduttivo",
    videoTitle: "Video sulle equazioni",
    videoDescription: "Soluzione passo passo",
    body: "# Espressioni algebriche",
    prompt: "Crea una breve guida sulle variabili e sui coefficienti per il livello 6.",
    tag: "algebra",
  },
};

function csvExample(locale: Locale): string {
  const example = exampleText[locale];
  return `title,description,resource_type,status,language,course_id,category_id,domain_id,cluster_id,standard_id,target_level,url,body,metadata
"${example.guideTitle}","${example.description}","document","draft","${locale}","grade-6","A","6.EE","","","reinforcement","","${example.body}","{""estimated_minutes"":20}"
"${example.videoTitle}","${example.videoDescription}","video","published","${locale}","grade-6","A","6.EE","","","practice","https://example.com/video","","{}"`;
}

function jsonExample(locale: Locale): string {
  const example = exampleText[locale];
  return JSON.stringify({
    schema_version: "1.0",
    resources: [
      {
        title: example.guideTitle,
        description: example.description,
        resource_type: "document",
        status: "draft",
        language: locale,
        course_id: "grade-6",
        category_id: "A",
        domain_id: "6.EE",
        cluster_id: null,
        standard_id: null,
        target_level: "reinforcement",
        url: null,
        body: example.body,
        generation: {
          mode: "generated",
          prompt: example.prompt,
          model: "internal-content-generator",
          generated_at: "2026-09-24T10:00:00Z",
        },
        metadata: {
          estimated_minutes: 20,
          tags: [example.tag],
        },
      },
    ],
  }, null, 2);
}

export const ResourceImportModal: Component<ResourceImportModalProps> = (props) => {
  const { t, locale } = useI18n();
  const [format, setFormat] = createSignal<ResourceImportFormat>("csv");
  const [content, setContent] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<string | null>(null);

  const preview = createMemo<Preview>(() => {
    const rawContent = content().trim();
    if (!rawContent || !props.catalog) return { rows: [], parseError: null };
    try {
      return {
        rows: parseResourceImport(rawContent, format(), props.catalog),
        parseError: null,
      };
    } catch (error) {
      return {
        rows: [],
        parseError: extractErrorMessage(error, t("resources.import.parseError")),
      };
    }
  });

  const validRows = createMemo(() => preview().rows.filter((row) => row.input !== null));
  const invalidRows = createMemo(() => preview().rows.filter((row) => row.input === null));

  const changeFormat = (nextFormat: ResourceImportFormat): void => {
    setFormat(nextFormat);
    setContent("");
    setSubmitError(null);
  };

  const handleImport = async (): Promise<void> => {
    if (invalidRows().length || !validRows().length) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const items = validRows()
        .map((row) => row.input)
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const result = await resourceService.importBatch({ items });

      props.onSuccess(result.imported);
      setContent("");
      props.onClose();
    } catch (error) {
      setSubmitError(extractErrorMessage(error, t("resources.import.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={props.isOpen} onClose={() => props.onClose()} title={t("resources.import.title")}>
      <div class="space-y-5">
        <div class="flex rounded-xl bg-canvas-soft p-1">
          <button
            type="button"
            class={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${
              format() === "csv" ? "bg-white text-brand shadow-sm" : "text-ink-muted"
            }`}
            onClick={() => changeFormat("csv")}
          >
            {t("resources.import.csvTab")}
          </button>
          <button
            type="button"
            class={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${
              format() === "ai_json" ? "bg-white text-brand shadow-sm" : "text-ink-muted"
            }`}
            onClick={() => changeFormat("ai_json")}
          >
            {t("resources.import.aiJson")}
          </button>
        </div>

        <div>
          <p class="text-sm leading-6 text-ink-muted">{t("resources.import.instructions")}</p>
          <textarea
            class="mt-3 min-h-64 w-full resize-y rounded-xl border border-line bg-white p-3 font-mono text-xs leading-5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
            value={content()}
            placeholder={format() === "csv" ? csvExample(locale()) : jsonExample(locale())}
            onInput={(event) => setContent(event.currentTarget.value)}
          />
        </div>

        <Show when={preview().parseError}>
          <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {preview().parseError}
          </p>
        </Show>

        <Show when={preview().rows.length > 0}>
          <div class="rounded-xl border border-line bg-canvas-soft p-4">
            <p class="text-sm font-bold text-ink">
              {t("resources.import.preview", {
                valid: validRows().length,
                invalid: invalidRows().length,
              })}
            </p>

            <Show when={invalidRows().length > 0}>
              <ul class="mt-3 max-h-32 space-y-1 overflow-auto text-xs font-semibold text-danger">
                <For each={invalidRows()}>
                  {(row) => (
                    <li>
                      {t("resources.import.rowError", {
                        row: row.row,
                        errors: row.errors.join(", "),
                      })}
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <Show when={validRows().length > 0 && invalidRows().length === 0}>
              <div class="mt-3 max-h-40 overflow-auto rounded-lg border border-line bg-white">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-line bg-canvas-soft text-ink-muted">
                    <tr>
                      <th class="p-2 font-medium">{t("resources.import.previewTable.title")}</th>
                      <th class="p-2 font-medium">{t("resources.import.previewTable.type")}</th>
                      <th class="p-2 font-medium">{t("resources.import.previewTable.level")}</th>
                      <th class="p-2 font-medium">{t("resources.import.previewTable.course")}</th>
                      <th class="p-2 font-medium">{t("resources.import.previewTable.domain")}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line">
                    <For each={validRows()}>
                      {(row) => (
                        <tr>
                          <td class="p-2 font-medium text-ink truncate max-w-[140px]">{row.input?.title}</td>
                          <td class="p-2 text-ink-muted">{row.input?.resource_type}</td>
                          <td class="p-2 text-ink-muted">{row.input?.target_level}</td>
                          <td class="p-2 text-ink-muted">{row.input?.course_id || "—"}</td>
                          <td class="p-2 text-ink-muted">{row.input?.domain_id || "—"}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={submitError()}>
          <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {submitError()}
          </p>
        </Show>

        <div class="flex justify-end gap-3 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => props.onClose()}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={isSubmitting() || !validRows().length || invalidRows().length > 0}
            onClick={() => void handleImport()}
          >
            {isSubmitting()
              ? t("resources.import.importing")
              : t("resources.import.submit", { count: validRows().length })}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

