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

export type ReadingTimeBand = "under15" | "15to45" | "over45";

/**
 * Word-count bounds for a reading-time band, per language, consistent
 * with readingMinutes: a story displays m minutes when its word count
 * rounds to m, so band edges sit at the .5 points (14.5x and 45.5x wpm).
 * Returns [min, max) with null for an open end. Used by the Supabase
 * time filter; the demo provider filters on readingMinutes directly.
 */
export function readingTimeWordBounds(band: ReadingTimeBand, language: "bn" | "en"): [number | null, number | null] {
  const wpm = READING_WPM[language];
  if (band === "under15") return [null, 14.5 * wpm];
  if (band === "15to45") return [14.5 * wpm, 45.5 * wpm];
  return [45.5 * wpm, null];
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

/**
 * Phase 1A: derive a story cover's thumbnail path from its original path.
 * Convention: `uid/name.ext` -> `uid/thumb-name.ext` — same bucket, same
 * owner folder, so the existing covers policies and the account-deletion
 * cleanup (which lists the whole `${uid}/` prefix) apply unchanged.
 * Returns null for non-storage paths (data:/demo: URLs) and for paths
 * that already name a thumbnail.
 */
export function thumbPath(coverPath: string): string | null {
  // Non-storage cover values (data: uploads in demo, demo: generated
  // placeholders) contain a ":" before any "/" — they have no thumb.
  if (coverPath.startsWith("data:") || coverPath.startsWith("demo:")) return null;
  const slash = coverPath.indexOf("/");
  if (slash <= 0) return null;
  const file = coverPath.slice(slash + 1);
  if (!file || file.startsWith("thumb-")) return null;
  return `${coverPath.slice(0, slash)}/thumb-${file}`;
}

export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Shrink a user-picked photo to avatar size before upload (max 512×512,
 * JPEG). Phone photos are several MB — far over the avatars bucket limit —
 * and an avatar never displays larger than 512px, so resizing client-side
 * makes any ordinary photo uploadable. Throws AppError("invalidImage")
 * for files the browser cannot decode (e.g. HEIC in Chrome).
 */
export async function fileToAvatarFile(file: File): Promise<File> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError("invalidImage", "That image could not be read");
  }
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AppError("invalidImage", "That image could not be processed");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) throw new AppError("invalidImage", "That image could not be processed");
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}
