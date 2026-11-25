import { createMemo, createSignal, For, Show, type Component } from "solid-js";

import { extractErrorMessage } from "../../lib/errors";
import { useI18n, type Locale } from "../../lib/i18n";
import {
  parseQuestionImport,
  type ParsedQuestionRow,
  type QuestionImportFormat,
} from "../../services/question-import";
import { questionBankService, type CurriculumCatalog } from "../../services/question-bank";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface QuestionImportModalProps {
  isOpen: boolean;
  catalog: CurriculumCatalog | undefined;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

interface Preview {
  rows: ParsedQuestionRow[];
  parseError: string | null;
}

const exampleText: Record<Locale, { prompt: string; explanation: string }> = {
  en: { prompt: "What is 2 + 2?", explanation: "The result is 4." },
  es: { prompt: "¿Cuánto es 2 + 2?", explanation: "El resultado es 4." },
  it: { prompt: "Quanto fa 2 + 2?", explanation: "Il risultato è 4." },
};

function csvExample(locale: Locale): string {
  const example = exampleText[locale];
  return `external_id,question_type,prompt,option_a,option_b,option_c,option_d,correct_options,explanation,difficulty,language,domain_code,cluster_code,standard_code,substandard_code
Q-001,single_choice,"${example.prompt}",3,4,5,6,B,"${example.explanation}",easy,${locale},6.NS,6.NS.A,6.NS.A.1,`;
}

function jsonExample(locale: Locale): string {
  const example = exampleText[locale];
  return JSON.stringify({
    schema_version: "1.0",
    questions: [
      {
        external_id: "Q-001",
        question_type: "single_choice",
        prompt: example.prompt,
        options: [
          { key: "A", content: "3" },
          { key: "B", content: "4" },
        ],
        correct_options: ["B"],
        explanation: example.explanation,
        difficulty: "easy",
        language: locale,
        curriculum: {
          domain_code: "6.NS",
          cluster_code: "6.NS.A",
          standard_code: "6.NS.A.1",
          substandard_code: null,
        },
      },
    ],
  }, null, 2);
}

export const QuestionImportModal: Component<QuestionImportModalProps> = (props) => {
  const { t, locale } = useI18n();
  const [format, setFormat] = createSignal<QuestionImportFormat>("csv");
  const [content, setContent] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<string | null>(null);

  const preview = createMemo<Preview>(() => {
    if (!content().trim() || !props.catalog) return { rows: [], parseError: null };
    try {
      return {
        rows: parseQuestionImport(content(), format(), props.catalog),
        parseError: null,
      };
    } catch (error) {
      return {
        rows: [],
        parseError: extractErrorMessage(error, t("questions.import.parseError")),
      };
    }
  });
  const validRows = createMemo(() => preview().rows.filter((row) => row.input !== null));
  const invalidRows = createMemo(() => preview().rows.filter((row) => row.input === null));

  const changeFormat = (nextFormat: QuestionImportFormat): void => {
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

      const result = await questionBankService.importBatch({
        source: format() === "csv" ? "csv" : "ai",
        filename: format() === "csv" ? "import.csv" : "import.json",
        items,
      });

      props.onSuccess(result.imported);
      setContent("");
      props.onClose();
    } catch (error) {
      setSubmitError(extractErrorMessage(error, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} title={t("questions.import.title")}>
      <div class="space-y-5">
        <div class="flex rounded-xl bg-canvas-soft p-1">
          <button
            type="button"
            class={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${format() === "csv" ? "bg-white text-brand shadow-sm" : "text-ink-muted"}`}
            onClick={() => changeFormat("csv")}
          >
            CSV
          </button>
          <button
            type="button"
            class={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${format() === "ai_json" ? "bg-white text-brand shadow-sm" : "text-ink-muted"}`}
            onClick={() => changeFormat("ai_json")}
          >
            {t("questions.import.aiJson")}
          </button>
        </div>

        <div>
          <p class="text-sm leading-6 text-ink-muted">{t("questions.import.instructions")}</p>
          <textarea
            class="mt-3 min-h-72 w-full resize-y rounded-xl border border-line bg-white p-3 font-mono text-xs leading-5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
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
              {t("questions.import.preview", {
                valid: validRows().length,
                invalid: invalidRows().length,
              })}
            </p>
            <Show when={invalidRows().length > 0}>
              <ul class="mt-3 max-h-32 space-y-1 overflow-auto text-xs font-semibold text-danger">
                <For each={invalidRows()}>
                  {(row) => (
                    <li>{t("questions.import.rowError", { row: row.row, errors: row.errors.join(", ") })}</li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>

        <Show when={submitError()}>
          <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {submitError()}
          </p>
        </Show>

        <div class="flex justify-end gap-3 border-t border-line pt-4">
          <Button variant="ghost" onClick={props.onClose}>{t("common.cancel")}</Button>
          <Button
            disabled={isSubmitting() || !validRows().length || invalidRows().length > 0}
            onClick={() => void handleImport()}
          >
            {isSubmitting()
              ? t("questions.import.importing")
              : t("questions.import.submit", { count: validRows().length })}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
