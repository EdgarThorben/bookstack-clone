import type { Lang } from "./i18n";

const UNITS: { ms: number; en: string; de: string; deSingular: string }[] = [
  { ms: 1000 * 60 * 60 * 24 * 365, en: "year", de: "Jahre", deSingular: "Jahr" },
  { ms: 1000 * 60 * 60 * 24 * 30, en: "month", de: "Monate", deSingular: "Monat" },
  { ms: 1000 * 60 * 60 * 24 * 7, en: "week", de: "Wochen", deSingular: "Woche" },
  { ms: 1000 * 60 * 60 * 24, en: "day", de: "Tage", deSingular: "Tag" },
  { ms: 1000 * 60 * 60, en: "hour", de: "Stunden", deSingular: "Stunde" },
  { ms: 1000 * 60, en: "minute", de: "Minuten", deSingular: "Minute" },
];

export function formatRelativeTime(date: Date, lang: Lang = "en"): string {
  const diffMs = Date.now() - date.getTime();
  for (const unit of UNITS) {
    const value = Math.floor(diffMs / unit.ms);
    if (value >= 1) {
      if (lang === "de") {
        return `vor ${value} ${value === 1 ? unit.deSingular : unit.de}`;
      }
      return `${value} ${unit.en}${value === 1 ? "" : "s"} ago`;
    }
  }
  return lang === "de" ? "gerade eben" : "just now";
}
