"use client";

import { useI18n } from "@/i18n/use-i18n";
import type { Locale } from "@/i18n/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <Select
      value={locale}
      onValueChange={(value) => value && setLocale(value as Locale)}
    >
      <SelectTrigger className="w-36" aria-label={t("settings.language")}>
        <SelectValue placeholder={t("settings.language")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">{t("settings.english")}</SelectItem>
        <SelectItem value="fr">{t("settings.french")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
