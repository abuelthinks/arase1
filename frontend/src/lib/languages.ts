export const LANGUAGE_OPTIONS = [
  "English",
  "Arabic",
  "Tagalog",
  "Urdu",
  "Hindi",
] as const;

export type LanguageOption = (typeof LANGUAGE_OPTIONS)[number];

export function normalizeLanguage(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const known = LANGUAGE_OPTIONS.find(language => language.toLowerCase() === trimmed.toLowerCase());
  return known || trimmed.replace(/\b\w/g, char => char.toUpperCase());
}

export function normalizeLanguages(values: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const language = normalizeLanguage(value);
    if (!language) continue;
    const key = language.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(language);
  }
  return normalized;
}
