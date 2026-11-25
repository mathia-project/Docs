import { createEffect, createSignal, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { extractErrorMessage } from "../../lib/errors";
import { useI18n } from "../../lib/i18n";
import { directorService } from "../../services/director";
import type { TeacherProfile } from "../../services/schema";

interface TeacherFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (teacher: TeacherProfile) => void;
  initialData?: TeacherProfile | null;
}

export const TeacherForm: Component<TeacherFormProps> = (props) => {
  const { t } = useI18n();
  const [firstName, setFirstName] = createSignal("");
  const [lastName, setLastName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [employeeId, setEmployeeId] = createSignal("");
  const [language, setLanguage] = createSignal("en");
  const [active, setActive] = createSignal(true);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.isOpen) {
      if (props.initialData) {
        setFirstName(props.initialData.first_name || "");
        setLastName(props.initialData.last_name || "");
        setEmail(props.initialData.email || "");
        setEmployeeId(props.initialData.employee_id || "");
        setLanguage(props.initialData.preferred_language || "en");
        setActive(props.initialData.active !== false);
      } else {
        setFirstName("");
        setLastName("");
        setEmail("");
        setPassword("");
        setShowPassword(false);
        setEmployeeId("");
        setLanguage("en");
        setActive(true);
      }
      setErrorMessage(null);
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let result: TeacherProfile;
      if (props.initialData) {
        result = await directorService.updateTeacher(props.initialData.id, {
          first_name: firstName().trim(),
          last_name: lastName().trim(),
          email: email().trim() || null,
          employee_id: employeeId().trim() || null,
          preferred_language: language(),
          active: active(),
        });
      } else {
        if (password().length < 8) {
          setErrorMessage(t("director.teachers.passwordTooShort"));
          return;
        }
        result = await directorService.createTeacher({
          first_name: firstName().trim(),
          last_name: lastName().trim(),
          email: email().trim() || null,
          password: password(),
          employee_id: employeeId().trim() || null,
          preferred_language: language(),
          active: active(),
        });
      }
      props.onSuccess(result);
      props.onClose();
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.initialData ? t("common.edit") : t("director.teachers.new")}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} class="space-y-4">
        <Show when={errorMessage()}>
          <div class="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm font-semibold text-danger">
            {errorMessage()}
          </div>
        </Show>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.teachers.firstName")}
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
              {t("director.teachers.lastName")}
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

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.teachers.email")}
          </label>
          <input
            type="email"
            required={!props.initialData}
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <Show when={!props.initialData}>
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.teachers.password")}
            </label>
            <div class="mt-1 flex gap-2">
              <input
                type={showPassword() ? "text" : "password"}
                required
                minlength="8"
                autocomplete="new-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder={t("director.teachers.passwordPlaceholder")}
                class="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
              <Button
                variant="secondary"
                type="button"
                aria-pressed={showPassword()}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword()
                  ? t("director.teachers.passwordHide")
                  : t("director.teachers.passwordShow")}
              </Button>
            </div>
            <p class="mt-1 text-xs text-ink-muted">{t("director.teachers.passwordHelp")}</p>
          </div>
        </Show>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.teachers.employeeId")}
            </label>
            <input
              type="text"
              value={employeeId()}
              onInput={(e) => setEmployeeId(e.currentTarget.value)}
              class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.teachers.language")}
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
        </div>

        <div class="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="teacher-active"
            checked={active()}
            onChange={(e) => setActive(e.currentTarget.checked)}
            class="size-4 rounded accent-brand"
          />
          <label for="teacher-active" class="text-sm font-semibold text-ink">
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
    </Modal>
  );
};
