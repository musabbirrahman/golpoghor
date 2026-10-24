#!/usr/bin/env node
/**
 * V4-13: regenerate public/sitemap.xml from the live catalogue.
 * Run before a deploy when stories/authors have changed:
 *   node scripts/gen-sitemap.mjs
 * Uses the project's public (publishable) key — the same one shipped in
 * the site's JS bundle — and only reads public rows.
 */
import { writeFileSync } from "node:fs";

const BASE = "https://golponeer.com";
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://gwqngoywcupkytyxukfu.supabase.co";
const KEY =
  process.env.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_zynfKNRZXjfZSFX6dVrdhg_mimIkF1h";

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const seg = (s) => encodeURIComponent(s);

const stories = await get(
  "stories?select=id,slug,updated_at,author:profiles!stories_author_id_fkey(username)" +
    "&status=in.(ongoing,complete)&order=updated_at.desc"
);
// A story is public only with >= 1 published chapter (story_is_public):
// status alone would also list chapterless 'ongoing' stories.
// (Caveat: the chapters fetch hits PostgREST's 1,000-row cap, so this
// under-includes once published chapters pass 1,000 — paginate then.)
const publishedStoryIds = new Set(
  (await get("chapters?select=story_id&status=eq.published")).map((c) => c.story_id)
);
const publicStories = stories.filter((s) => publishedStoryIds.has(s.id));
const profiles = await get("profiles?select=username,updated_at&order=username");
// Only authors with public stories get an /authors/ URL — every reader
// profile used to be indexed, including empty ones.
const authorNames = new Set(publicStories.map((s) => s.author.username));
const publicProfiles = profiles.filter((p) => authorNames.has(p.username));

const urls = [
  { loc: `${BASE}/`, priority: "1.0" },
  { loc: `${BASE}/discover`, priority: "0.8" },
  { loc: `${BASE}/search`, priority: "0.5" },
  { loc: `${BASE}/keepsakes`, priority: "0.6" },
  { loc: `${BASE}/licence`, priority: "0.3" },
  { loc: `${BASE}/keepsakes-policy`, priority: "0.3" },
  { loc: `${BASE}/about`, priority: "0.4" },
  { loc: `${BASE}/guidelines`, priority: "0.3" },
  { loc: `${BASE}/terms`, priority: "0.3" },
  { loc: `${BASE}/privacy`, priority: "0.3" },
  { loc: `${BASE}/contact`, priority: "0.3" },
];
for (const s of publicStories) {
  urls.push({
    loc: `${BASE}/stories/${seg(s.author.username)}/${seg(s.slug)}`,
    lastmod: (s.updated_at ?? "").slice(0, 10) || undefined,
    priority: "0.7",
  });
}
for (const p of publicProfiles) {
  urls.push({
    loc: `${BASE}/authors/${seg(p.username)}`,
    lastmod: (p.updated_at ?? "").slice(0, 10) || undefined,
    priority: "0.6",
  });
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `  <url>\n    <loc>${esc(u.loc)}</loc>\n` +
        (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
        `    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n") +
  `\n</urlset>\n`;

writeFileSync(new URL("../public/sitemap.xml", import.meta.url), xml);
console.log(
  `sitemap.xml written: ${urls.length} URLs (${publicStories.length} stories, ${publicProfiles.length} authors)`
);
