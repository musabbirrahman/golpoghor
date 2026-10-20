import type { TiptapDoc, TiptapNode } from "./types";

/** URL-safe slug from a title (works for Bangla too — transliterates nothing, keeps it readable). */
export function slugify(title: string): string {
  // Keep Bangla letters (U+0980–U+09FF) and latin alnum; spaces -> hyphens.
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\u0980-\u09FFa-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || `untitled-${Date.now().toString(36)}`;
}

/** True when a chapter slug is still the auto-generated placeholder left by
 *  autosave (the chapter row was created before the title was typed). */
export function isPlaceholderChapterSlug(slug: string): boolean {
  return slug.startsWith("untitled-") || slug === slugify("শিরোনামহীন অধ্যায়");
}

/** Word count that doesn't assume latin tokenisation. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Average comfortable silent-reading speeds — ASSUMPTIONS, not exact science:
 * English ~220 words/minute is the commonly cited adult average. Bangla text
 * counts words by whitespace (Bangla words are space-separated), but its
 * conjunct-heavy orthography reads slower, so ~180 words/minute is used.
 * Change the two constants to retune every estimate on the site at once.
 */
export const READING_WPM: Record<"bn" | "en", number> = { en: 220, bn: 180 };

/**
 * THE shared reading-time estimate, used by story cards, rows, the story
 * page, the library, and the reader so a story shows the same number
 * everywhere. Pass the TOTAL word count of the content being estimated
 * (a whole story = sum of its published chapters' word counts; a chapter =
 * that chapter's word count). Returns 0 for empty content so callers can
 * hide the estimate instead of showing a made-up minute.
 */
export function readingMinutes(wordCount: number, language: "bn" | "en"): number {
  if (!wordCount || wordCount <= 0) return 0;
  return Math.max(1, Math.round(wordCount / READING_WPM[language]));
}

export function emptyDoc(): TiptapDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function paragraphsToDoc(paragraphs: string[]): TiptapDoc {
  return {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  };
}

/** Plain text extraction from a Tiptap doc (for search + word count). */
export function docToText(doc: TiptapDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return "";
  const parts: string[] = [];
  const walk = (nodes: TiptapNode[] | undefined) => {
    for (const n of nodes ?? []) {
      if (n.text) parts.push(n.text);
      if (n.content) walk(n.content);
      if (n.type === "paragraph" || n.type === "heading") parts.push("\n\n");
      if (n.type === "hardBreak") parts.push("\n");
    }
  };
  walk(doc.content);
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isDocEmpty(doc: TiptapDoc | null | undefined): boolean {
  return docToText(doc).length === 0;
}

export function timeAgo(iso: string, locale: "bn" | "en" = "en"): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === "bn" ? "এইমাত্র" : "just now";
  if (mins < 60)
    return locale === "bn" ? `${toBnDigits(mins)} মিনিট আগে` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)
    return locale === "bn" ? `${toBnDigits(hours)} ঘণ্টা আগে` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)
    return locale === "bn" ? `${toBnDigits(days)} দিন আগে` : `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12)
    return locale === "bn" ? `${toBnDigits(months)} মাস আগে` : `${months}mo ago`;
  return locale === "bn"
    ? `${toBnDigits(Math.floor(months / 12))} বছর আগে`
    : `${Math.floor(months / 12)}y ago`;
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export function toBnDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Compact count: 950 -> "950", 1500 -> "1.5k", 2_300_000 -> "2.3M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}k`;
  }
  const v = n / 1_000_000;
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatDate(iso: string, locale: "bn" | "en" = "en"): string {
  const d = new Date(iso);
  const loc = locale === "bn" ? "bn-BD" : "en-GB";
  return d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
}

export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
