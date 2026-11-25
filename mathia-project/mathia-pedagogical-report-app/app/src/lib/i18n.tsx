import {
  createContext,
  createEffect,
  createSignal,
  on,
  useContext,
  type Accessor,
  type ParentComponent,
} from "solid-js";

import { en, type TranslationKey } from "../locales/en";
import { es } from "../locales/es";
import { it } from "../locales/it";
import { formatMessage, type MessageVariables } from "./i18n-core";

export const SUPPORTED_LOCALES = ["en", "es", "it"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = "mathia.locale";
const messages: Record<Locale, Record<TranslationKey, string>> = { en, es, it };

interface I18nContextValue {
  locale: Accessor<Locale>;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, variables?: MessageVariables) => string;
}

const I18nContext = createContext<I18nContextValue>();

function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "es" || value === "it";
}

function initialLocale(): Locale {
  try {
    const storedLocale = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(storedLocale)) return storedLocale;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return isLocale(import.meta.env.VITE_DEFAULT_LOCALE)
    ? import.meta.env.VITE_DEFAULT_LOCALE
    : "en";
}

export const I18nProvider: ParentComponent = (props) => {
  const [locale, setLocale] = createSignal<Locale>(initialLocale());

  createEffect(
    on(locale, (nextLocale) => {
      document.documentElement.lang = nextLocale;

      try {
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
      } catch {
        // The selected locale still works for the current session.
      }
    }),
  );

  const value: I18nContextValue = {
    locale,
    setLocale,
    t: (key, variables) => formatMessage(messages[locale()][key], variables),
  };

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
