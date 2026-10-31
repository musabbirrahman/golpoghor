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
  "stories?select=id,slug,genre,cover_path,updated_at,author:profiles!stories_author_id_fkey(username)" +
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
// Curated shelves have no visibility column: every row is a public page
// (/shelves/:slug serves any row), so every row gets a URL.
const shelves = await get("shelves?select=slug&order=position.asc");

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
  // Cover image for the sitemap: the story's public cover-thumb CDN URL.
  // cover_path is "<author-id>/<file>"; the public thumb is the same path
  // with "thumb-" prefixed to the filename. Only for stories that have a
  // cover (coverless public stories simply get no image entry).
  let image;
  if (s.cover_path && s.cover_path.includes("/")) {
    const i = s.cover_path.lastIndexOf("/");
    const thumb = s.cover_path.slice(0, i + 1) + "thumb-" + s.cover_path.slice(i + 1);
    image = `${SUPABASE_URL}/storage/v1/object/public/cover-thumbs/${thumb}`;
  }
  urls.push({
    loc: `${BASE}/stories/${seg(s.author.username)}/${seg(s.slug)}`,
    lastmod: (s.updated_at ?? "").slice(0, 10) || undefined,
    priority: "0.7",
    image,
  });
}
for (const p of publicProfiles) {
  urls.push({
    loc: `${BASE}/authors/${seg(p.username)}`,
    lastmod: (p.updated_at ?? "").slice(0, 10) || undefined,
    priority: "0.6",
  });
}
for (const sh of shelves) {
  urls.push({
    loc: `${BASE}/shelves/${seg(sh.slug)}`,
    priority: "0.6",
  });
}
// Genre landing pages (/genres/<slug>): only genres with >= 1 public
// story, in taxonomy order. Slugs mirror src/lib/genres.ts (English label,
// hyphenated); old English spellings normalize onto the canonical value.
const GENRE_SLUGS = {
  general: "general",
  "ছোটগল্প": "short-story",
  "সমকালীন": "contemporary",
  "রোমান্স": "romance",
  "রহস্য": "mystery",
  "থ্রিলার": "thriller",
  "ফ্যান্টাসি": "fantasy",
  "হরর": "horror",
  "ইতিহাস": "history",
  "কবিতা": "poetry",
};
const GENRE_ALIASES = {
  "short story": "ছোটগল্প",
  "short-story": "ছোটগল্প",
  "short stories": "ছোটগল্প",
  contemporary: "সমকালীন",
  romance: "রোমান্স",
  mystery: "রহস্য",
  thriller: "থ্রিলার",
  fantasy: "ফ্যান্টাসি",
  horror: "হরর",
  history: "ইতিহাস",
  historical: "ইতিহাস",
  poetry: "কবিতা",
  poem: "কবিতা",
  poems: "কবিতা",
};
const normGenre = (g) =>
  GENRE_SLUGS[g] ? g : (GENRE_ALIASES[(g ?? "").toLowerCase()] ?? null);
const presentGenres = new Set(
  publicStories.map((s) => normGenre(s.genre)).filter(Boolean)
);
const genreSlugs = Object.keys(GENRE_SLUGS).filter((v) =>
  presentGenres.has(v)
);
for (const v of genreSlugs) {
  urls.push({
    loc: `${BASE}/genres/${GENRE_SLUGS[v]}`,
    priority: "0.6",
  });
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
  urls
    .map(
      (u) =>
        `  <url>\n    <loc>${esc(u.loc)}</loc>\n` +
        (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
        (u.image ? `    <image:image><image:loc>${esc(u.image)}</image:loc></image:image>\n` : "") +
        `    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n") +
  `\n</urlset>\n`;

writeFileSync(new URL("../public/sitemap.xml", import.meta.url), xml);
console.log(
  `sitemap.xml written: ${urls.length} URLs (${publicStories.length} stories, ${publicProfiles.length} authors, ${shelves.length} shelves, ${genreSlugs.length} genres, ${urls.filter((u) => u.image).length} cover images)`
);
