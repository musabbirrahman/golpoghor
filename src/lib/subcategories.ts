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
  { id: "war-conflict", label: "War & conflict", group: "ইতিহাস" },
  { id: "freedom-struggle", label: "Freedom struggle", group: "ইতিহাস" },
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

/** Keep only vocabulary ids, lowercased, deduped, capped like free tags. */
export function normalizeSubcategories(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const id = String(v ?? "").trim().toLowerCase();
    if (SUBCATEGORY_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, 10);
}

/** Display term for a stored id (unknown ids pass through). */
export function subLabel(id: string): string {
  return SUBCATEGORIES.find((s) => s.id === id)?.label ?? id;
}
