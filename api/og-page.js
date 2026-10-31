/**
 * List/author bot OG. Shared author, genre, and shelf links are SPA
 * routes, so social crawlers would only ever see the generic shell meta.
 * Vercel rewrites crawler user-agents on those URLs to this function,
 * which serves each page's own title/description to bots — the same
 * pattern as api/og-story.js, for pages that carry no single story.
 *
 * What each kind serves (mirroring the page's own meta exactly):
 * - author: "{display} · Author on GolpoNeer" for authors with >= 1
 *   public story (same gate as the sitemap: status ongoing/complete),
 *   plain "{display} | GolpoNeer" otherwise; bio wins as the
 *   description, else the generated author description when the author
 *   has stories, else the site description. Image: the public avatar
 *   when set, else the generic cover.
 * - genre: the bilingual genre title/description from the genre page.
 * - shelf: the shelf name + tagline.
 *
 * Privacy rule: everything served here is already shown on the public
 * page itself (names, bios, genre labels, shelf names/taglines). Unknown
 * slugs, unknown kinds, and missing rows get generic meta + 404, never
 * any page data. Author bios are public page content; nothing private
 * (emails, follower lists, drafts) is ever fetched or served.
 *
 * Images stay generic except author avatars: genre and shelf pages have
 * no page art of their own, and picking one story's cover to represent
 * a whole list would misdescribe the page. The generic og-cover.jpg is
 * used, matching the deliberate choice in api/og-story.js.
 *
 * Env: reuses the site's existing Vercel vars (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY) — nothing new to configure.
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encPath(seg) {
  return encodeURIComponent(seg);
}

// Genre taxonomy mirror of src/lib/genres.ts (values, Bangla + English
// labels, URL slugs, aliases). Kept in sync by hand; the taxonomy
// changes rarely, and a mismatch here only falls back to generic meta.
const GENRES = [
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

function genreSlug(def) {
  return def.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function genreFromSlug(slug) {
  const norm = String(slug ?? "").trim().toLowerCase();
  return (
    GENRES.find(
      (g) =>
        genreSlug(g) === norm ||
        g.value === norm ||
        g.aliases.some((a) => a.toLowerCase() === norm)
    ) ?? null
  );
}

function pluralEn(def) {
  return def.value === "ছোটগল্প" ? "Short stories" : `${def.en} stories`;
}

function genreDescription(def) {
  const plural = pluralEn(def);
  const bnPhrase =
    def.value === "ছোটগল্প" ? `বাংলা ${def.bn}` : `বাংলা ${def.bn} গল্প`;
  return `${bnPhrase} ও English ${plural} — Bangla ${plural} and English ${plural} on GolpoNeer, free, no account needed.`;
}

export default async function handler(req, res) {
  const params =
    req.query ?? Object.fromEntries(new URL(req.url, "https://golponeer.com").searchParams);
  const kind = params.kind || "";
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  async function get(path) {
    if (!base || !key) return null;
    try {
      const r = await fetch(`${base}/rest/v1/${path}`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) ? rows : null;
    } catch {
      return null;
    }
  }

  const siteTitle = "GolpoNeer";
  const siteDesc = "GolpoNeer — a nest for stories. Read and share Bangla and English stories.";
  const cover = "https://golponeer.com/og-cover.jpg";

  let found = false;
  let title = siteTitle;
  let desc = siteDesc;
  let canonical = "https://golponeer.com/";
  let image = cover;
  let ogType = "website";

  if (kind === "author" && params.username) {
    const profiles = await get(
      `profiles?username=eq.${encodeURIComponent(params.username)}&select=id,username,display_name,bio,avatar_path`
    );
    const profile = profiles?.[0] ?? null;
    if (profile) {
      const display = profile.display_name || profile.username;
      const stories = await get(
        `stories?author_id=eq.${encodeURIComponent(profile.id)}&status=in.(ongoing,complete)&select=genre&limit=50`
      );
      const genres = [...new Set((stories ?? []).map((r) => r.genre))].slice(0, 3);
      const isAuthor = (stories ?? []).length > 0;
      found = true;
      ogType = "profile";
      title = isAuthor ? `${display} · Author on GolpoNeer` : `${display} | GolpoNeer`;
      if (profile.bio) {
        desc = String(profile.bio).slice(0, 200);
      } else if (isAuthor && genres.length > 0) {
        const labels = genres.map(
          (g) => (GENRES.find((d) => d.value === g) ?? {}).en ?? g
        );
        desc = `${display} is an author on GolpoNeer writing ${labels.join(", ")} stories. Read them free, no account needed.`;
      }
      if (profile.avatar_path && !String(profile.avatar_path).startsWith("data:")) {
        image = String(profile.avatar_path).startsWith("http")
          ? profile.avatar_path
          : `${base}/storage/v1/object/public/avatars/${profile.avatar_path}`;
      }
      canonical = `https://golponeer.com/authors/${encPath(profile.username)}`;
    }
  } else if (kind === "genre" && params.slug) {
    const def = genreFromSlug(params.slug);
    if (def) {
      found = true;
      title = `${def.bn} · ${pluralEn(def)} | GolpoNeer`;
      desc = genreDescription(def);
      canonical = `https://golponeer.com/genres/${genreSlug(def)}`;
    }
  } else if (kind === "shelf" && params.slug) {
    const shelves = await get(
      `shelves?slug=eq.${encodeURIComponent(params.slug)}&select=slug,name,tagline`
    );
    const shelf = shelves?.[0] ?? null;
    if (shelf) {
      found = true;
      title = `${shelf.name} | GolpoNeer`;
      desc = shelf.tagline ? String(shelf.tagline).slice(0, 200) : siteDesc;
      canonical = `https://golponeer.com/shelves/${encPath(shelf.slug)}`;
    }
  }

  // Short cache: a renamed author or retagged shelf must stop unfurling
  // its old preview promptly.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  res.status(found ? 200 : 404).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:site_name" content="GolpoNeer">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body>
${found
  ? `<p><a href="${esc(canonical)}">Visit this page on GolpoNeer</a></p>`
  : `<p>This page is not public. <a href="https://golponeer.com/">Visit GolpoNeer</a></p>`}
</body></html>`);
}
