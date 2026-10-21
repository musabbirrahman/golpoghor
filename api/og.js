/**
 * V4-27c OG function (K7). Shared Keepsake links (/k/:slug) are SPA
 * routes, so social crawlers would only ever see the generic shell meta.
 * Vercel rewrites crawler user-agents on /k/:slug to this function, which
 * reads the SAME restricted projection as the public page — so after an
 * unpublish / restrict / source-hide, new scrapes get generic meta, not
 * the keepsake. There is deliberately no per-card og:image: Keepsake PNGs
 * are rendered client-side on demand and a public static image URL would
 * be unrevocable (see the V4 plan's revocation model).
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

export default async function handler(req, res) {
  const slug = req.query?.slug || new URL(req.url, "https://golponeer.com").searchParams.get("slug") || "";
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  let k = null;
  if (slug && base && key) {
    try {
      const r = await fetch(
        `${base}/rest/v1/rpc/keepsakes_public?slug=eq.${encodeURIComponent(slug)}`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
        }
      );
      if (r.ok) {
        const rows = await r.json();
        k = Array.isArray(rows) ? rows[0] ?? null : null;
      }
    } catch {
      k = null;
    }
  }

  const siteTitle = "GolpoNeer · গল্পনীড়";
  const siteDesc = "GolpoNeer — a nest for stories. Read and share Bangla and English stories.";
  const cover = "https://golponeer.com/og-cover.jpg";
  const canonical = `https://golponeer.com/k/${encodeURIComponent(slug)}`;

  const title = k
    ? `${k.source_title} — ${k.source_original_author || k.source_author_name} | ${siteTitle}`
    : siteTitle;
  const desc = k ? k.excerpt.slice(0, 200) : siteDesc;

  // Short cache: a revoked keepsake must stop unfurling promptly.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  res.status(k ? 200 : 404).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${cover}">
<meta property="og:site_name" content="GolpoNeer">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${cover}">
</head><body>
${k
  ? `<p><a href="${esc(canonical)}">View this Keepsake on GolpoNeer</a></p>`
  : `<p>This Keepsake is not public. <a href="https://golponeer.com/">Visit GolpoNeer</a></p>`}
</body></html>`);
}
