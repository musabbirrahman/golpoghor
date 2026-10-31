/**
 * Story bot OG (SEO item 4). Shared story links (/stories/:username/:slug)
 * are SPA routes, so social crawlers would only ever see the generic shell
 * meta. Vercel rewrites crawler user-agents on story URLs to this function,
 * which serves the story's own title/summary to bots.
 *
 * Privacy rule (the whole point of the gating below): ONLY public stories
 * unfurl. A story counts as public iff status is ongoing/complete AND it
 * has at least one published chapter — the same rule as story_is_public.
 * Drafts, hidden stories, and missing stories get generic meta + 404,
 * never their title or summary. The anon key can only read what RLS
 * allows, and the JS check is applied regardless of what RLS returns.
 *
 * Old URLs keep unfurling: on a story miss, the slug-redirect table is
 * consulted (its read policy already hides redirects to non-public
 * stories from anonymous callers) and the OG is served with the CURRENT
 * canonical URL. Username renames are followed the same way as the
 * client's resolveUsername (3 hops max, expiry-aware, loop-guarded).
 *
 * Per-story og:image: public stories use their own cover thumbnail from
 * the public cover-thumbs bucket (permanent CDN URL, no expiry problem).
 * This became possible with the Scale Phase 2 public bucket; before that
 * covers lived only in the private bucket, so the generic image was used
 * for every story. Drafts, hidden stories, and stories without a usable
 * cover path still get the generic og-cover.jpg (and a 404, as before).
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

export default async function handler(req, res) {
  const params =
    req.query ?? Object.fromEntries(new URL(req.url, "https://golponeer.com").searchParams);
  const username = params.username || "";
  const slug = params.slug || "";
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

  // Follow username renames (mirror of resolveUsername in the client).
  async function resolveUsername(start) {
    let current = String(start).toLowerCase();
    const seen = new Set([current]);
    for (let hop = 0; hop < 3; hop++) {
      const rows = await get(
        `username_redirects?old_username=eq.${encodeURIComponent(current)}&select=new_username,expires_at`
      );
      const row = rows?.[0];
      if (!row || new Date(row.expires_at).getTime() <= Date.now()) break;
      const next = String(row.new_username).toLowerCase();
      if (seen.has(next)) break;
      seen.add(next);
      current = next;
    }
    return current;
  }

  async function isPublicStory(story) {
    if (!story) return false;
    if (story.status !== "ongoing" && story.status !== "complete") return false;
    const chapters = await get(
      `chapters?story_id=eq.${encodeURIComponent(story.id)}&status=eq.published&select=id&limit=1`
    );
    return (chapters?.length ?? 0) > 0;
  }

  let story = null;
  let authorName = "";
  let canonicalUser = "";
  if (username && slug) {
    const currentUsername = await resolveUsername(username);
    const profiles = await get(
      `profiles?username=eq.${encodeURIComponent(currentUsername)}&select=id,username,display_name`
    );
    const profile = profiles?.[0] ?? null;
    if (profile) {
      canonicalUser = profile.username;
      authorName = profile.display_name || profile.username;
      const stories = await get(
        `stories?author_id=eq.${encodeURIComponent(profile.id)}&slug=eq.${encodeURIComponent(slug)}&select=id,title,summary,status,slug,cover_path`
      );
      story = stories?.[0] ?? null;
      if (!story) {
        // Old slug: follow the redirect table, then re-check publicity.
        const redirects = await get(
          `story_slug_redirects?author_id=eq.${encodeURIComponent(profile.id)}&old_slug=eq.${encodeURIComponent(slug)}&select=story_id`
        );
        const targetId = redirects?.[0]?.story_id;
        if (targetId) {
          const targets = await get(
            `stories?id=eq.${encodeURIComponent(targetId)}&select=id,title,summary,status,slug,cover_path`
          );
          story = targets?.[0] ?? null;
        }
      }
    }
  }

  const isPublic = await isPublicStory(story);

  // Public cover thumbnail, mirrored from the app's coverThumbPublicUrl:
  // only a well-formed <author-uuid>/<file> path is trusted, so a stray
  // cover_path value can never inject a foreign host or path. Anything
  // else (no cover, malformed path, non-public story) falls back to the
  // generic site cover below.
  const COVER_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;
  function publicThumbUrl(s) {
    const p = s?.cover_path;
    if (!p || !COVER_PATH_RE.test(p)) return null;
    const [uid, file] = p.split("/");
    return `${base}/storage/v1/object/public/cover-thumbs/${encodeURIComponent(uid)}/thumb-${encodeURIComponent(file)}`;
  }

  const siteTitle = "GolpoNeer";
  const siteDesc = "GolpoNeer — a nest for stories. Read and share Bangla and English stories.";
  const cover = (isPublic && publicThumbUrl(story)) || "https://golponeer.com/og-cover.jpg";
  const canonical = isPublic
    ? `https://golponeer.com/stories/${encPath(canonicalUser)}/${encPath(story.slug)}`
    : "https://golponeer.com/";

  const title = isPublic ? `${story.title} — ${authorName} | ${siteTitle}` : siteTitle;
  const desc = isPublic
    ? String(story.summary || "").slice(0, 200) || siteDesc
    : siteDesc;

  // Short cache: an unpublished / restricted story must stop unfurling promptly.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  res.status(isPublic ? 200 : 404).send(`<!doctype html>
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
${isPublic
  ? `<p><a href="${esc(canonical)}">Read this story on GolpoNeer</a></p>`
  : `<p>This story is not public. <a href="https://golponeer.com/">Visit GolpoNeer</a></p>`}
</body></html>`);
}
