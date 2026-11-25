import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { extractErrorMessage } from "../../lib/errors";
import { useI18n } from "../../lib/i18n";
import {
  directorService,
  parseStudentCsv,
  type ParsedCsvStudent,
  type StudentAccessMode,
} from "../../services/director";
import type { StudentProfile, StudentSex } from "../../services/schema";

interface StudentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: StudentProfile | null;
  mode?: "form" | "import";
}

export const StudentForm: Component<StudentFormProps> = (props) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = createSignal<"form" | "import">("form");

  // Single form state
  const [firstName, setFirstName] = createSignal("");
  const [lastName, setLastName] = createSignal("");
  const [preferredName, setPreferredName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [externalId, setExternalId] = createSignal("");
  const [dob, setDob] = createSignal("");
  const [language, setLanguage] = createSignal("en");
  const [sex, setSex] = createSignal<StudentSex | "">("");
  const [active, setActive] = createSignal(true);
  const [hasDiagnosis, setHasDiagnosis] = createSignal(false);
  const [diagnosisNotes, setDiagnosisNotes] = createSignal("");
  const [needsEvaluation, setNeedsEvaluation] = createSignal(false);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  // Access account state
  const [accessMode, setAccessMode] = createSignal<StudentAccessMode>("pin");
  const [pin, setPin] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPin, setShowPin] = createSignal(false);
  const [showPassword, setShowPassword] = createSignal(false);

  // Edit-mode access state
  const hasAccount = createMemo(() => Boolean(props.initialData?.directus_user_id));
  const [assignAccount, setAssignAccount] = createSignal(false);
  const [resetSecret, setResetSecret] = createSignal(false);
  const [resetType, setResetType] = createSignal<"pin" | "password">("pin");
  const [newPin, setNewPin] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [showNewPin, setShowNewPin] = createSignal(false);
  const [showNewPassword, setShowNewPassword] = createSignal(false);

  // CSV Import state
  const [csvText, setCsvText] = createSignal("");
  const [parsedStudents, setParsedStudents] = createSignal<ParsedCsvStudent[]>([]);
  const [importResult, setImportResult] = createSignal<{ imported: number; failed: number } | null>(
    null,
  );

  createEffect(() => {
    if (props.isOpen) {
      setActiveTab(props.mode || "form");
      if (props.initialData) {
        setFirstName(props.initialData.first_name || "");
        setLastName(props.initialData.last_name || "");
        setPreferredName(props.initialData.preferred_name || "");
        setEmail(props.initialData.email || "");
        setExternalId(props.initialData.external_id || "");
        setDob(props.initialData.date_of_birth || "");
        setLanguage(props.initialData.preferred_language || "en");
        setSex(props.initialData.sex || "");
        setActive(props.initialData.active !== false);
        setHasDiagnosis(Boolean(props.initialData.has_diagnosis));
        setDiagnosisNotes(props.initialData.diagnosis_notes || "");
        setNeedsEvaluation(Boolean(props.initialData.needs_evaluation));

        setAssignAccount(false);
        setResetSecret(false);
        setAccessMode("pin");
        setPin("");
        setPassword("");
        setNewPin("");
        setNewPassword("");
        setResetType(props.initialData.email ? "password" : "pin");
      } else {
        setFirstName("");
        setLastName("");
        setPreferredName("");
        setEmail("");
        setExternalId("");
        setDob("");
        setLanguage("en");
        setSex("");
        setActive(true);
        setHasDiagnosis(false);
        setDiagnosisNotes("");
        setNeedsEvaluation(false);

        setAccessMode("pin");
        setPin("");
        setPassword("");
        setAssignAccount(false);
        setResetSecret(false);
        setNewPin("");
        setNewPassword("");
      }
      setShowPin(false);
      setShowPassword(false);
      setShowNewPin(false);
      setShowNewPassword(false);
      setCsvText("");
      setParsedStudents([]);
      setImportResult(null);
      setErrorMessage(null);
    }
  });

  const handleCsvChange = (text: string) => {
    setCsvText(text);
    const parsed = parseStudentCsv(text);
    setParsedStudents(parsed);
  };

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || "");
      handleCsvChange(content);
    };
    reader.readAsText(file);
  };

  const handleSingleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (props.initialData) {
        // Updating existing student
        const patch: Record<string, any> = {
          first_name: firstName().trim(),
          last_name: lastName().trim(),
          preferred_name: preferredName().trim() || null,
          email: email().trim() || null,
          external_id: externalId().trim() || null,
          date_of_birth: dob() || null,
          preferred_language: language(),
          sex: sex() || null,
          active: active(),
          has_diagnosis: hasDiagnosis(),
          diagnosis_notes: hasDiagnosis() ? (diagnosisNotes().trim() || null) : null,
          needs_evaluation: hasDiagnosis() ? false : needsEvaluation(),
        };

        if (!hasAccount() && assignAccount()) {
          patch.access_mode = accessMode();
          if (accessMode() === "pin") {
            if (!externalId().trim()) {
              throw new Error(t("director.students.externalIdRequiredForPin"));
            }
            if (pin().trim().length < 4) {
              throw new Error(t("director.students.pinPlaceholder"));
            }
            patch.pin = pin().trim();
          } else if (accessMode() === "email") {
            if (!email().trim()) {
              throw new Error(t("director.students.emailRequiredForEmailAccess"));
            }
            if (password().length < 6) {
              throw new Error(t("director.students.passwordPlaceholder"));
            }
            patch.password = password();
          }
        } else if (hasAccount() && resetSecret()) {
          if (resetType() === "pin") {
            if (newPin().trim().length < 4) {
              throw new Error(t("director.students.pinPlaceholder"));
            }
            patch.reset_pin = newPin().trim();
          } else {
            if (newPassword().length < 6) {
              throw new Error(t("director.students.passwordPlaceholder"));
            }
            patch.reset_password = newPassword();
          }
        }

        await directorService.updateStudent(props.initialData.id, patch);
      } else {
        // Creating new student
        if (accessMode() === "pin") {
          if (!externalId().trim()) {
            throw new Error(t("director.students.externalIdRequiredForPin"));
          }
          if (pin().trim().length < 4) {
            throw new Error(t("director.students.pinPlaceholder"));
          }
        } else if (accessMode() === "email") {
          if (!email().trim()) {
            throw new Error(t("director.students.emailRequiredForEmailAccess"));
          }
          if (password().length < 6) {
            throw new Error(t("director.students.passwordPlaceholder"));
          }
        }

        await directorService.createStudent({
          first_name: firstName().trim(),
          last_name: lastName().trim(),
          preferred_name: preferredName().trim() || null,
          email: email().trim() || null,
          external_id: externalId().trim() || null,
          date_of_birth: dob() || null,
          preferred_language: language(),
          sex: sex() || null,
          active: active(),
          has_diagnosis: hasDiagnosis(),
          diagnosis_notes: hasDiagnosis() ? (diagnosisNotes().trim() || null) : null,
          needs_evaluation: hasDiagnosis() ? false : needsEvaluation(),
          access_mode: accessMode(),
          pin: accessMode() === "pin" ? pin().trim() : undefined,
          password: accessMode() === "email" ? password() : undefined,
        });
      }
      props.onSuccess();
      props.onClose();
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportSubmit = async () => {
    const valid = parsedStudents().filter((s) => s.isValid);
    if (valid.length === 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await directorService.importStudents(valid);
      setImportResult(result);
      if (result.imported > 0) {
        props.onSuccess();
      }
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, t("director.students.importError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={
        props.initialData
          ? t("common.edit")
          : activeTab() === "import"
          ? t("director.students.importTitle")
          : t("director.students.new")
      }
      maxWidth={activeTab() === "import" ? "2xl" : "lg"}
    >
      <Show when={!props.initialData}>
        <div class="mb-5 flex border-b border-line">
          <button
            type="button"
            class={`pb-2.5 px-4 text-sm font-bold transition ${
              activeTab() === "form"
                ? "border-b-2 border-brand text-brand"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setActiveTab("form")}
          >
            {t("director.students.new")}
          </button>
          <button
            type="button"
            class={`pb-2.5 px-4 text-sm font-bold transition ${
              activeTab() === "import"
                ? "border-b-2 border-brand text-brand"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setActiveTab("import")}
          >
            {t("director.students.import")}
          </button>
        </div>
      </Show>

      <Show
        when={activeTab() === "form"}
        fallback={
          <div class="space-y-4">
            <Show when={importResult()}>
              <div class="rounded-2xl border border-brand/20 bg-brand-soft p-4 text-sm font-semibold text-brand-strong">
                {t("director.students.importSuccess", { count: importResult()!.imported })}
                <Show when={importResult()!.failed > 0}>
                  <span class="block text-xs text-danger">({t("director.students.importFailed", { count: importResult()!.failed })})</span>
                </Show>
              </div>
            </Show>

            <Show when={errorMessage()}>
              <div class="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm font-semibold text-danger">
                {errorMessage()}
              </div>
            </Show>

            <p class="text-xs text-ink-muted">{t("director.students.importInstructions")}</p>

            <div class="flex items-center gap-3">
              <label class="cursor-pointer rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-bold text-ink hover:bg-white">
                {t("director.students.uploadCsv")}
                <input type="file" accept=".csv,.txt" class="hidden" onChange={handleFileSelect} />
              </label>
            </div>

            <textarea
              rows={5}
              placeholder={t("director.students.importPlaceholder")}
              value={csvText()}
              onInput={(e) => handleCsvChange(e.currentTarget.value)}
              class="w-full rounded-2xl border border-line bg-white p-3 font-mono text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
            />

            <Show when={parsedStudents().length > 0}>
              <div>
                <p class="text-xs font-bold text-ink">
                  {t("director.students.importPreview", { count: parsedStudents().length })}
                </p>
                <div class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line bg-canvas-soft p-2">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-line text-ink-muted">
                        <th class="p-1.5">{t("director.students.importColumnName")}</th>
                        <th class="p-1.5">{t("director.students.importColumnEmail")}</th>
                        <th class="p-1.5">ID</th>
                        <th class="p-1.5">{t("director.students.sex")}</th>
                        <th class="p-1.5">{t("director.students.importColumnStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={parsedStudents()}>
                        {(s) => (
                          <tr class="border-b border-line/40">
                            <td class="p-1.5 font-semibold">
                              {s.first_name} {s.last_name}
                            </td>
                            <td class="p-1.5 text-ink-muted">{s.email || "-"}</td>
                            <td class="p-1.5 text-ink-muted">{s.external_id || "-"}</td>
                            <td class="p-1.5 text-ink-muted capitalize">
                              {s.sex
                                ? s.sex === "male"
                                  ? t("director.students.sexMale")
                                  : s.sex === "female"
                                    ? t("director.students.sexFemale")
                                    : t("director.students.sexOther")
                                : "-"}
                            </td>
                            <td class="p-1.5">
                              <span
                                class={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold ${
                                  s.isValid
                                    ? "bg-brand-soft text-brand-strong"
                                    : "bg-danger-soft text-danger"
                                }`}
                              >
                                {s.isValid ? "Valid" : s.error}
                              </span>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>

            <div class="flex justify-end gap-2.5 pt-4">
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={isSubmitting() || parsedStudents().filter((s) => s.isValid).length === 0}
                onClick={handleImportSubmit}
              >
                {isSubmitting()
                  ? t("common.saving")
                  : t("director.students.importSubmit", {
                      count: parsedStudents().filter((s) => s.isValid).length,
                    })}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSingleSubmit} class="space-y-4">
          <Show when={errorMessage()}>
            <div class="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm font-semibold text-danger">
              {errorMessage()}
            </div>
          </Show>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("director.students.firstName")} *
              </label>
              <input
                type="text"
                required
                value={firstName()}
                onInput={(e) => setFirstName(e.currentTarget.value)}
                class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("director.students.lastName")} *
              </label>
              <input
                type="text"
                required
                value={lastName()}
                onInput={(e) => setLastName(e.currentTarget.value)}
                class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("director.students.preferredName")}
              </label>
              <input
                type="text"
                value={preferredName()}
                onInput={(e) => setPreferredName(e.currentTarget.value)}
                class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("director.students.externalId")}
                <Show
                  when={
                    (!props.initialData && accessMode() === "pin") ||
                    (props.initialData && !hasAccount() && assignAccount() && accessMode() === "pin")
                  }
                >
                  <span class="text-brand"> *</span>
                </Show>
              </label>
              <input
                type="text"
                value={externalId()}
                onInput={(e) => setExternalId(e.currentTarget.value)}
                placeholder={t("auth.studentCodePlaceholder")}
                class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.students.email")}
              <Show
                when={
                  (!props.initialData && accessMode() === "email") ||
                  (props.initialData && !hasAccount() && assignAccount() && accessMode() === "email")
                }
              >
                <span class="text-brand"> *</span>
              </Show>
            </label>
            <input
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              placeholder={t("auth.emailPlaceholder")}
              class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </div>

          {/* Access Account Configuration for NEW Student */}
          <Show when={!props.initialData}>
            <div class="rounded-2xl border border-line bg-canvas-soft p-4">
              <label class="block text-xs font-bold uppercase tracking-wider text-ink">
                {t("director.students.accessSection")}
              </label>
              <p class="mt-0.5 text-xs text-ink-muted">
                {t("director.students.accessMode")}
              </p>

              <div class="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  class={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    accessMode() === "pin"
                      ? "bg-brand text-white shadow-sm"
                      : "border border-line bg-white text-ink hover:bg-canvas"
                  }`}
                  onClick={() => setAccessMode("pin")}
                >
                  {t("director.students.accessModePin")}
                </button>
                <button
                  type="button"
                  class={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    accessMode() === "email"
                      ? "bg-brand text-white shadow-sm"
                      : "border border-line bg-white text-ink hover:bg-canvas"
                  }`}
                  onClick={() => setAccessMode("email")}
                >
                  {t("director.students.accessModeEmail")}
                </button>
                <button
                  type="button"
                  class={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    accessMode() === "none"
                      ? "bg-brand text-white shadow-sm"
                      : "border border-line bg-white text-ink hover:bg-canvas"
                  }`}
                  onClick={() => setAccessMode("none")}
                >
                  {t("director.students.accessModeNone")}
                </button>
              </div>

              {/* PIN configuration input */}
              <Show when={accessMode() === "pin"}>
                <div class="mt-3">
                  <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {t("director.students.pin")} *
                  </label>
                  <div class="relative mt-1">
                    <input
                      type={showPin() ? "text" : "password"}
                      value={pin()}
                      onInput={(e) => setPin(e.currentTarget.value)}
                      placeholder={t("director.students.pinPlaceholder")}
                      maxlength={6}
                      class="min-h-10 w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 font-mono tracking-widest"
                    />
                    <button
                      type="button"
                      class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
                      onClick={() => setShowPin(!showPin())}
                    >
                      {showPin() ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                  <p class="mt-1 text-xs text-ink-muted">
                    {t("director.students.pinHelp")}
                  </p>
                </div>
              </Show>

              {/* Email/password configuration input */}
              <Show when={accessMode() === "email"}>
                <div class="mt-3">
                  <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {t("director.students.password")} *
                  </label>
                  <div class="relative mt-1">
                    <input
                      type={showPassword() ? "text" : "password"}
                      value={password()}
                      onInput={(e) => setPassword(e.currentTarget.value)}
                      placeholder={t("director.students.passwordPlaceholder")}
                      class="min-h-10 w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
                    />
                    <button
                      type="button"
                      class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
                      onClick={() => setShowPassword(!showPassword())}
                    >
                      {showPassword() ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* Access Account Configuration for EXISTING Student */}
          <Show when={props.initialData}>
            <div class="rounded-2xl border border-line bg-canvas-soft p-4">
              <div class="flex items-center justify-between">
                <div>
                  <label class="block text-xs font-bold uppercase tracking-wider text-ink">
                    {t("director.students.accessStatus")}
                  </label>
                  <p class="mt-0.5 text-xs">
                    <Show
                      when={hasAccount()}
                      fallback={
                        <span class="inline-flex items-center gap-1.5 font-medium text-amber-600">
                          <span class="size-2 rounded-full bg-amber-500" />
                          {t("director.students.noAccount")}
                        </span>
                      }
                    >
                      <span class="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                        <span class="size-2 rounded-full bg-emerald-500" />
                        {t("director.students.hasAccount")}
                      </span>
                    </Show>
                  </p>
                </div>

                {/* Action button: Assign account if none, or Reset secret if exists */}
                <Show
                  when={hasAccount()}
                  fallback={
                    <button
                      type="button"
                      class={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        assignAccount()
                          ? "bg-brand text-white shadow-sm"
                          : "border border-line bg-white text-ink hover:bg-canvas"
                      }`}
                      onClick={() => setAssignAccount(!assignAccount())}
                    >
                      {assignAccount() ? t("common.cancel") : `+ ${t("director.students.assignAccount")}`}
                    </button>
                  }
                >
                  <button
                    type="button"
                    class={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      resetSecret()
                        ? "bg-brand text-white shadow-sm"
                        : "border border-line bg-white text-ink hover:bg-canvas"
                    }`}
                    onClick={() => setResetSecret(!resetSecret())}
                  >
                    {resetSecret() ? t("common.cancel") : t("director.students.resetSecret")}
                  </button>
                </Show>
              </div>

              {/* Form to ASSIGN account to student without account */}
              <Show when={!hasAccount() && assignAccount()}>
                <div class="mt-3 border-t border-line pt-3">
                  <p class="text-xs font-bold text-ink mb-2">
                    {t("director.students.accessMode")}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        accessMode() === "pin"
                          ? "bg-brand text-white shadow-sm"
                          : "border border-line bg-white text-ink hover:bg-canvas"
                      }`}
                      onClick={() => setAccessMode("pin")}
                    >
                      {t("director.students.accessModePin")}
                    </button>
                    <button
                      type="button"
                      class={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        accessMode() === "email"
                          ? "bg-brand text-white shadow-sm"
                          : "border border-line bg-white text-ink hover:bg-canvas"
                      }`}
                      onClick={() => setAccessMode("email")}
                    >
                      {t("director.students.accessModeEmail")}
                    </button>
                  </div>

                  <Show when={accessMode() === "pin"}>
                    <div class="mt-3">
                      <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                        {t("director.students.pin")} *
                      </label>
                      <div class="relative mt-1">
                        <input
                          type={showPin() ? "text" : "password"}
                          value={pin()}
                          onInput={(e) => setPin(e.currentTarget.value)}
                          placeholder={t("director.students.pinPlaceholder")}
                          maxlength={6}
                          class="min-h-10 w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 font-mono tracking-widest"
                        />
                        <button
                          type="button"
                          class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
                          onClick={() => setShowPin(!showPin())}
                        >
                          {showPin() ? "Ocultar" : "Ver"}
                        </button>
                      </div>
                      <p class="mt-1 text-xs text-ink-muted">
                        {t("director.students.pinHelp")}
                      </p>
                    </div>
                  </Show>

                  <Show when={accessMode() === "email"}>
                    <div class="mt-3">
                      <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                        {t("director.students.password")} *
                      </label>
                      <div class="relative mt-1">
                        <input
                          type={showPassword() ? "text" : "password"}
                          value={password()}
                          onInput={(e) => setPassword(e.currentTarget.value)}
                          placeholder={t("director.students.passwordPlaceholder")}
                          class="min-h-10 w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
                        />
                        <button
                          type="button"
                          class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
                          onClick={() => setShowPassword(!showPassword())}
                        >
                          {showPassword() ? "Ocultar" : "Ver"}
                        </button>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Form to RESET secret for student WITH account */}
              <Show when={hasAccount() && resetSecret()}>
                <div class="mt-3 border-t border-line pt-3">
                  <div class="flex gap-2 mb-2">
                    <button
                      type="button"
                      class={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                        resetType() === "pin"
                          ? "bg-brand text-white shadow-sm"
                          : "border border-line bg-white text-ink hover:bg-canvas"
                      }`}
                      onClick={() => setResetType("pin")}
                    >
                      {t("director.students.resetPin")}
                    </button>
                    <button
                      type="button"
                      class={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                        resetType() === "password"
                          ? "bg-brand text-white shadow-sm"
                          : "border border-line bg-white text-ink hover:bg-canvas"
                      }`}
                      onClick={() => setResetType("password")}
                    >
                      {t("director.students.resetPassword")}
                    </button>
                  </div>

                  <Show when={resetType() === "pin"}>
                    <div>
                      <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                        {t("director.students.resetPin")} *
                      </label>
                      <div class="relative mt-1">
                        <input
                          type={showNewPin() ? "text" : "password"}
                          value={newPin()}
                          onInput={(e) => setNewPin(e.currentTarget.value)}
                          placeholder={t("director.students.pinPlaceholder")}
                          maxlength={6}
                          class="min-h-10 w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 font-mono tracking-widest"
                        />
                        <button
                          type="button"
                          class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
                          onClick={() => setShowNewPin(!showNewPin())}
                        >
                          {showNewPin() ? "Ocultar" : "Ver"}
                        </button>
                      </div>
                    </div>
                  </Show>

                  <Show when={resetType() === "password"}>
                    <div>
                      <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                        {t("director.students.resetPassword")} *
                      </label>
                      <div class="relative mt-1">
                        <input
                          type={showNewPassword() ? "text" : "password"}
                          value={newPassword()}
                          onInput={(e) => setNewPassword(e.currentTarget.value)}
                          placeholder={t("director.students.passwordPlaceholder")}
                          class="min-h-10 w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
                        />
                        <button
                          type="button"
                          class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
                          onClick={() => setShowNewPassword(!showNewPassword())}
                        >
                          {showNewPassword() ? "Ocultar" : "Ver"}
                        </button>
                      </div>
                    </div>
                  </Show>

                  <p class="mt-1 text-xs text-ink-muted">
                    {t("director.students.resetHelp")}
                  </p>
                </div>
              </Show>
            </div>
          </Show>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("director.students.dob")}
              </label>
              <input
                type="date"
                value={dob()}
                onInput={(e) => setDob(e.currentTarget.value)}
                class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("director.students.language")}
              </label>
              <select
                value={language()}
                onChange={(e) => setLanguage(e.currentTarget.value)}
                class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              >
                <option value="en">{t("language.en")}</option>
                <option value="es">{t("language.es")}</option>
                <option value="it">{t("language.it")}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("director.students.sex")}
              </label>
              <select
                value={sex()}
                onChange={(e) => setSex(e.currentTarget.value as StudentSex | "")}
                class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              >
                <option value="">{t("director.students.sexSelect")}</option>
                <option value="female">{t("director.students.sexFemale")}</option>
                <option value="male">{t("director.students.sexMale")}</option>
                <option value="other">{t("director.students.sexOther")}</option>
              </select>
            </div>
          </div>

          {/* Pedagogical Diagnosis & AI Evaluation Section */}
          <div class="rounded-2xl border border-line bg-canvas-soft p-4 space-y-3">
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-ink">
                {t("director.students.diagnosisSection")}
              </h4>
              <p class="mt-0.5 text-xs text-ink-muted">
                {t("director.students.hasDiagnosisHelp")}
              </p>
            </div>

            <div class="pt-1">
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDiagnosis()}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    setHasDiagnosis(checked);
                    if (checked) {
                      setNeedsEvaluation(false);
                    }
                  }}
                  class="size-4 rounded accent-brand"
                />
                <span class="text-xs font-semibold text-ink">
                  {t("director.students.hasDiagnosis")}
                </span>
              </label>
            </div>

            <Show when={hasDiagnosis()}>
              <div class="pt-1">
                <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {t("director.students.diagnosisNotes")}
                </label>
                <textarea
                  rows="2"
                  value={diagnosisNotes()}
                  onInput={(e) => setDiagnosisNotes(e.currentTarget.value)}
                  placeholder={t("director.students.diagnosisNotesPlaceholder")}
                  class="mt-1 w-full rounded-xl border border-line bg-white p-2.5 text-xs text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
                />
              </div>
            </Show>

            {/* AI Evaluation Suggestion control - only displayed and relevant if NOT diagnosed */}
            <Show when={!hasDiagnosis()}>
              <div class="rounded-xl border border-dashed border-amber-200 bg-amber-50/70 p-3">
                <div class="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="student-needs-eval"
                    checked={needsEvaluation()}
                    onChange={(e) => setNeedsEvaluation(e.currentTarget.checked)}
                    class="mt-0.5 size-4 rounded accent-amber-600"
                  />
                  <label for="student-needs-eval" class="cursor-pointer">
                    <span class="block text-xs font-bold text-amber-900">
                      {t("director.students.needsEvaluation")}
                    </span>
                    <span class="mt-0.5 block text-xs text-amber-700">
                      {t("director.students.needsEvaluationHelp")}
                    </span>
                  </label>
                </div>
              </div>
            </Show>
          </div>

          <div class="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="student-active"
              checked={active()}
              onChange={(e) => setActive(e.currentTarget.checked)}
              class="size-4 rounded accent-brand"
            />
            <label for="student-active" class="text-sm font-semibold text-ink">
              {t("common.active")}
            </label>
          </div>

          <div class="flex justify-end gap-2.5 pt-4">
            <Button variant="secondary" type="button" onClick={props.onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting()}>
              {isSubmitting() ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </Show>
    </Modal>
  );
};
