"use client";

import { createContext, useCallback, useMemo, useState } from "react";
import { en } from "./dictionaries/en";
import { fr } from "./dictionaries/fr";
import type { Dictionary } from "./dictionaries/en";
import type { I18nContextValue, Locale, TranslationKey } from "./types";

export const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "wacrm-locale";

const dictionaries = { en, fr } as const;

function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";

  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved === "en" || saved === "fr") return saved;

  const browser = navigator.language.toLowerCase().startsWith("fr")
    ? "fr"
    : "en";
  return browser;
}

function getTranslation(dictionary: Dictionary, key: TranslationKey): string {
  const parts = key.split(".");
  let current: unknown = dictionary;

  for (const part of parts) {
    if (current === null || typeof current !== "object") return key;
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : key;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const dictionary = dictionaries[locale];

  const t = useCallback(
    (key: TranslationKey) => getTranslation(dictionary, key),
    [dictionary],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
