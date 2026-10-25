import { useEffect } from "react";

/**
 * Per-route page meta (SEO step 1: dynamic titles).
 *
 * The app is a client-side SPA, so every route otherwise serves the static
 * shell title/description. This hook sets document.title, the meta
 * description, and a canonical link while a page is mounted, and restores
 * the shell values on unmount — so pages without the hook (home, Discover,
 * app surfaces) keep showing the site title.
 *
 * Safety: title is assigned as plain text and description/canonical go
 * through setAttribute, so story/author text can never inject markup.
 * Googlebot renders JS, so it sees these values; social scrapers do not
 * run JS, which is why /k/ keeps its server-side og.js handling.
 */

const SITE = "https://golponeer.com";

export const SHELL_TITLE =
  "GolpoNeer — গল্পনীড় · A nest for stories, in two languages";
export const SHELL_DESCRIPTION =
  "GolpoNeer (গল্পনীড়) — read and publish stories in Bangla and English. বাংলা ও ইংরেজিতে গল্প পড়ুন ও প্রকাশ করুন।";

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Truncate a meta description to ~160 chars, preferring a word boundary. */
function metaDescription(text: string | null | undefined): string {
  const clean = oneLine(text ?? "");
  if (!clean) return SHELL_DESCRIPTION;
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 157);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/**
 * Per-page JSON-LD (SEO step 3: Book/author schema). Injects a single
 * <script type="application/ld+json"> element owned by the page (marked
 * data-page-jsonld) and removes it on unmount or when data becomes null.
 * The shell's static Organization/WebSite script has no marker and is
 * never touched. Callers pass a JSON.stringify'd string (or null); `<`
 * is escaped to \u003c so a title can never break out of the script
 * element, and the payload is set via textContent, never innerHTML.
 */
export function useJsonLd(json: string | null) {
  useEffect(() => {
    const prev = document.querySelector("script[data-page-jsonld]");
    if (prev) prev.remove();
    if (!json) return;
    const el = document.createElement("script");
    el.setAttribute("type", "application/ld+json");
    el.setAttribute("data-page-jsonld", "");
    el.textContent = json.replace(/</g, "\\u003c");
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [json]);
}

/** Percent-encode each path segment (Bangla slugs/usernames stay valid). */
function encodePath(path: string): string {
  return path
    .split("/")
    .map((seg) => (seg ? encodeURIComponent(seg) : seg))
    .join("/");
}

export function usePageMeta({
  title,
  description,
  path,
}: {
  /** Raw title; normalized to one line. Falls back to the shell title. */
  title: string | null | undefined;
  /** Raw description; truncated to ~160 chars, shell fallback when empty. */
  description?: string | null;
  /** Route path, e.g. `/stories/golponeer/kopalkundala`. */
  path: string;
}) {
  const finalTitle = oneLine(title ?? "") || SHELL_TITLE;
  const finalDesc = metaDescription(description);
  const finalCanon = SITE + encodePath(path);

  useEffect(() => {
    const prevTitle = document.title;
    const descEl = document.querySelector('meta[name="description"]');
    const prevDesc = descEl?.getAttribute("content") ?? null;
    let canonEl = document.querySelector(
      'link[rel="canonical"]'
    ) as HTMLLinkElement | null;
    const prevCanon = canonEl?.getAttribute("href") ?? null;
    const createdCanon = !canonEl;
    if (!canonEl) {
      canonEl = document.createElement("link");
      canonEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonEl);
    }
    document.title = finalTitle;
    descEl?.setAttribute("content", finalDesc);
    canonEl.setAttribute("href", finalCanon);
    return () => {
      document.title = prevTitle;
      if (descEl && prevDesc !== null)
        descEl.setAttribute("content", prevDesc);
      if (canonEl) {
        if (prevCanon !== null) canonEl.setAttribute("href", prevCanon);
        else if (createdCanon) canonEl.remove();
      }
    };
  }, [finalTitle, finalDesc, finalCanon]);
}
