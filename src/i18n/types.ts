import type { Dictionary } from "./dictionaries/en";

export type Locale = "en" | "fr";

export type TranslationKey = Paths<Dictionary>;

type Primitive = string | number | boolean | null | undefined;

type Paths<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends Primitive
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${Paths<T[K]>}`
      : never
  : never;

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}
