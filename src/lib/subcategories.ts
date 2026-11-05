import type { Locale } from "./types";

/**
 * Phase 1 (Discover taxonomy): the fixed sub-category vocabulary.
 *
 * One flat list, grouped under majors for DISPLAY only — grouping is
 * never a restriction: an author may tick sub-categories from ANY group,
 * regardless of the story's major. Stored values are the lowercase ids;
 * labels are the display terms (the reader panel shows the same terms).
 * The database CHECK constraint in migration 20261028230000 carries the
 * same id list — adding a term needs a migration, by design.
 */
export interface SubcategoryDef {
  id: string;
  label: string;
  /** Major genre value from lib/genres.ts — display home only. */
  group: string;
}

export const SUBCATEGORIES: SubcategoryDef[] = [
  { id: "detective", label: "Detective", group: "রহস্য" },
  { id: "supernatural", label: "Supernatural", group: "রহস্য" },
  { id: "psychological", label: "Psychological", group: "হরর" },
  { id: "gothic", label: "Gothic", group: "হরর" },
  { id: "warm-romance", label: "Warm romance", group: "রোমান্স" },
  { id: "tragic-romance", label: "Tragic romance", group: "রোমান্স" },
  { id: "war-conflict", label: "War & conflict", group: "ঐতিহাসিক" },
  { id: "freedom-struggle", label: "Freedom struggle", group: "ঐতিহাসিক" },
  { id: "coming-of-age", label: "Coming of age", group: "সমকালীন" },
  { id: "village-life", label: "Village life", group: "ছোটগল্প" },
  { id: "relationships", label: "Relationships", group: "ছোটগল্প" },
  { id: "childhood", label: "Childhood", group: "ছোটগল্প" },
  { id: "human-nature", label: "Human nature", group: "general" },
  { id: "twist-irony", label: "Twist & irony", group: "general" },
  { id: "everyday-life", label: "Everyday life", group: "general" },
  { id: "epic", label: "Epic", group: "ফ্যান্টাসি" },
  { id: "urban", label: "Urban", group: "ফ্যান্টাসি" },
  { id: "dark", label: "Dark", group: "ফ্যান্টাসি" },
  { id: "lyric", label: "Lyric", group: "কবিতা" },
  { id: "narrative", label: "Narrative", group: "কবিতা" },
];

const SUBCATEGORY_IDS = new Set(SUBCATEGORIES.map((s) => s.id));

/** Keep only vocabulary ids, lowercased, deduped, capped at 4: one major
    genre + 4 sub-categories = 5 labels per story, so tag rows stay compact
    on story pages and cards. */
export function normalizeSubcategories(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const id = String(v ?? "").trim().toLowerCase();
    if (SUBCATEGORY_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, 4);
}

/** Display term for a stored id in the given UI language (unknown ids
    pass through; Bangla falls back to the English label when a term is
    missing). Mirrors genreLabel() in lib/genres.ts. */
export function subLabel(id: string, locale: Locale): string {
  const label = SUBCATEGORIES.find((s) => s.id === id)?.label ?? id;
  return locale === "bn" ? (SUBCATEGORY_BN[id] ?? label) : label;
}

/** Bangla display terms for the fixed sub-category vocabulary. Single
 *  source of truth — the sub-category landing pages (src/pages/tag.tsx)
 *  and the bot previews (api/og-page.js) share these terms through this
 *  map or a hand-synced copy. Wording was corrected by the owner
 *  2026-11-05 to natural Bangla literary terms (e.g. অলৌকিক, মিষ্টি প্রেম,
 *  বিরহ, ডার্ক ফ্যান্টাসি, গীতিকবিতা, কাহিনীকাব্য) instead of literal
 *  translations; the owner can correct any term. */
export const SUBCATEGORY_BN: Record<string, string> = {
  detective: "গোয়েন্দা",
  supernatural: "অলৌকিক",
  psychological: "মনস্তাত্ত্বিক",
  gothic: "গথিক",
  "warm-romance": "মিষ্টি প্রেম",
  "tragic-romance": "বিরহ",
  "war-conflict": "যুদ্ধ ও সংঘাত",
  "freedom-struggle": "স্বাধীনতা সংগ্রাম",
  "coming-of-age": "তারুণ্য ও বেড়ে ওঠা",
  "village-life": "গ্রামীণ জীবন",
  relationships: "সম্পর্ক",
  childhood: "শৈশব",
  "human-nature": "মানবচরিত্র",
  "twist-irony": "অপ্রত্যাশিত মোড়",
  "everyday-life": "দৈনন্দিন জীবন",
  epic: "মহাকাব্যিক",
  urban: "শহুরে ফ্যান্টাসি",
  dark: "ডার্ক ফ্যান্টাসি",
  lyric: "গীতিকবিতা",
  narrative: "কাহিনীকাব্য",
};
