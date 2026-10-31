import type { Locale } from "./types";

/**
 * V4-14 (Decision D6): the frozen genre taxonomy. Stored values are the
 * canonical Bangla terms plus "general"; every surface displays them
 * through genreLabel() in the UI language. Older stories written before
 * the freeze may carry English duplicates — normalizeGenre() maps those
 * aliases onto the canonical value so filters and lists group correctly
 * even before the data migration runs.
 * 2026-10-29 (owner-approved extension of D6): Thriller added as a 10th
 * major — "thriller" moved out of Mystery's aliases into its own entry,
 * so thriller stories no longer file under Mystery.
 */
export interface GenreDef {
  value: string;
  bn: string;
  en: string;
  aliases: string[];
}

export const GENRES: GenreDef[] = [
  { value: "general", bn: "সাধারণ", en: "General", aliases: [] },
  { value: "ছোটগল্প", bn: "ছোটগল্প", en: "Short story", aliases: ["short story", "short-story", "short stories"] },
  { value: "সমকালীন", bn: "সমকালীন", en: "Contemporary", aliases: ["contemporary"] },
  { value: "রোমান্স", bn: "রোমান্স", en: "Romance", aliases: ["romance"] },
  { value: "রহস্য", bn: "রহস্য", en: "Mystery", aliases: ["mystery"] },
  { value: "থ্রিলার", bn: "থ্রিলার", en: "Thriller", aliases: ["thriller"] },
  { value: "ফ্যান্টাসি", bn: "ফ্যান্টাসি", en: "Fantasy", aliases: ["fantasy"] },
  { value: "হরর", bn: "হরর", en: "Horror", aliases: ["horror"] },
  { value: "ইতিহাস", bn: "ইতিহাস", en: "History", aliases: ["history", "historical"] },
  { value: "কবিতা", bn: "কবিতা", en: "Poetry", aliases: ["poetry", "poem", "poems"] },
];

const BY_VALUE = new Map(GENRES.map((g) => [g.value, g]));
const ALIAS_TO_VALUE = new Map<string, string>();
for (const g of GENRES) {
  for (const a of g.aliases) ALIAS_TO_VALUE.set(a.toLowerCase(), g.value);
}

/** Map any stored genre string onto its canonical value (unknown values pass through). */
export function normalizeGenre(raw: string): string {
  const v = (raw ?? "").trim();
  if (BY_VALUE.has(v)) return v;
  return ALIAS_TO_VALUE.get(v.toLowerCase()) ?? v;
}

/** Display label for a stored genre value in the given UI language. */
export function genreLabel(raw: string, locale: Locale): string {
  const def = BY_VALUE.get(normalizeGenre(raw));
  return def ? def[locale] : raw;
}

/** All stored spellings that belong to a canonical value (for SQL IN filters). */
export function genreAliases(canonical: string): string[] {
  const def = BY_VALUE.get(canonical);
  if (!def) return [canonical];
  return [def.value, ...def.aliases];
}

/** Order a set of canonical genre values by the taxonomy order. */
export function sortGenres(values: Iterable<string>): string[] {
  const set = new Set([...values].map(normalizeGenre));
  const ordered = GENRES.map((g) => g.value).filter((v) => set.has(v));
  const rest = [...set].filter((v) => !BY_VALUE.has(v)).sort();
  return [...ordered, ...rest];
}

/** URL slug for a genre def, from its English label ("Short story" -> "short-story"). */
export function genreSlug(def: GenreDef): string {
  return def.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Resolve any stored spelling, alias, or URL slug to its genre def (null when unknown). */
export function genreFromSlug(slug: string): GenreDef | null {
  const norm = slug.trim().toLowerCase();
  return (
    GENRES.find(
      (g) =>
        genreSlug(g) === norm ||
        g.value === norm ||
        g.aliases.some((a) => a.toLowerCase() === norm)
    ) ?? null
  );
}

/** English URL slug for any stored genre spelling (null when not in the taxonomy). */
export function genreSlugFor(value: string): string | null {
  const def = BY_VALUE.get(normalizeGenre(value));
  return def ? genreSlug(def) : null;
}
