/**
 * Dynamic sitemap — replaces the old static public/sitemap.xml.
 *
 * Why dynamic: the old sitemap was a generated file that only changed
 * when someone regenerated it and pushed. A story published by any other
 * user (Wave 2 writers, not just the owner) would stay out of the
 * sitemap until the next manual push. This function builds the sitemap
 * live from the public catalogue on every request, so any author's newly
 * published story appears automatically.
 *
 * Quota design (Supabase free plan): the response carries NO images or
 * media — only URLs (the cover entries are thumbnail URLs, not files).
 * Each generation is four tiny anonymous reads (stories, published
 * chapter ids, profiles, shelves — tens of KB total), and the result is
 * cached at the Vercel edge for one hour (s-maxage=3600), so origin
 * generations are at most ~24/day even if crawlers ask often. That is
 * orders of magnitude below the image egress that strained the quota;
 * it will not fill the quota.
 *
 * URL rules mirror scripts/gen-sitemap.mjs exactly (same gates, same
 * order, same priorities): public = status ongoing/complete AND >= 1
 * published chapter; authors only with >= 1 public story; genres and
 * sub-categories only with >= 1 public story; tag pages only for the
 * registered tags with >= 1 public story; cover images only for stories
 * with a cover_path (public cover-thumb CDN URL). One improvement over
 * the script: published chapters are paged, so the public-story gate
 * stays correct past PostgREST's 1,000-row cap.
 *
 * The XML carries a generation-timestamp comment so a live fetch can
 * prove the sitemap is being generated dynamically (fetch with a fresh
 * query string to bypass the edge cache and watch the timestamp move).
 *
 * Env: reuses the site's existing Vercel vars (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY); falls back to the project's public URL and
 * publishable key (public values already shipped in the site bundle),
 * so a missing var can never break it. Nothing new to configure.
 * Route: vercel.json rewrites /sitemap.xml to /api/sitemap.
 */

const BASE = "https://golponeer.com";
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://gwqngoywcupkytyxukfu.supabase.co";
const KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_zynfKNRZXjfZSFX6dVrdhg_mimIkF1h";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const seg = (s) => encodeURIComponent(s);

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

// Page through a select in 1,000-row PostgREST pages.
async function getAll(path) {
  const out = [];
  let offset = 0;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await get(`${path}${sep}limit=1000&offset=${offset}`);
    out.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const GENRE_SLUGS = {
  general: "general",
  "ছোটগল্প": "short-story",
  "সমকালীন": "contemporary",
  "রোমান্স": "romance",
  "রহস্য": "mystery",
  "থ্রিলার": "thriller",
  "অ্যাডভেঞ্চার": "adventure",
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
  adventure: "অ্যাডভেঞ্চার",
  fantasy: "ফ্যান্টাসি",
  horror: "হরর",
  history: "ইতিহাস",
  historical: "ইতিহাস",
  poetry: "কবিতা",
  poem: "কবিতা",
  poems: "কবিতা",
};
const SUBCATEGORY_ORDER = [
  "detective", "supernatural", "psychological", "gothic", "warm-romance",
  "tragic-romance", "war-conflict", "freedom-struggle", "coming-of-age",
  "village-life", "relationships", "childhood", "human-nature",
  "twist-irony", "everyday-life", "epic", "urban", "dark", "lyric",
  "narrative",
];

async function buildSitemapXml() {
  const stories = await get(
    "stories?select=id,slug,genre,subcategories,tags,cover_path,updated_at,author:profiles!stories_author_id_fkey(username)" +
      "&status=in.(ongoing,complete)&order=updated_at.desc"
  );
  const publishedRows = await getAll(
    "chapters?select=story_id&status=eq.published"
  );
  const publishedStoryIds = new Set(publishedRows.map((c) => c.story_id));
  const publicStories = stories.filter((s) => publishedStoryIds.has(s.id));

  const profiles = await get("profiles?select=username,updated_at&order=username");
  const authorNames = new Set(publicStories.map((s) => s.author.username));
  const publicProfiles = profiles.filter((p) => authorNames.has(p.username));

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
  const normGenre = (g) =>
    GENRE_SLUGS[g] ? g : (GENRE_ALIASES[(g ?? "").toLowerCase()] ?? null);
  const presentGenres = new Set(
    publicStories.map((s) => normGenre(s.genre)).filter(Boolean)
  );
  for (const v of Object.keys(GENRE_SLUGS).filter((g) => presentGenres.has(g))) {
    urls.push({ loc: `${BASE}/genres/${GENRE_SLUGS[v]}`, priority: "0.6" });
  }
  const presentSubs = new Set(
    publicStories.flatMap((s) => s.subcategories ?? [])
  );
  for (const id of SUBCATEGORY_ORDER.filter((x) => presentSubs.has(x))) {
    urls.push({ loc: `${BASE}/subcategories/${id}`, priority: "0.6" });
  }
  const hasClassics = publicStories.some((s) =>
    (s.tags ?? []).some((tag) => tag === "Classic" || tag === "ক্লাসিক")
  );
  if (hasClassics) urls.push({ loc: `${BASE}/tags/classics`, priority: "0.6" });
  const hasTagore = publicStories.some((s) =>
    (s.tags ?? []).includes("রবীন্দ্রনাথ ঠাকুর")
  );
  if (hasTagore) urls.push({ loc: `${BASE}/tags/tagore`, priority: "0.6" });

  const generatedAt = new Date().toISOString();
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Generated dynamically at ${generatedAt} -->\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${esc(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
          (u.image
            ? `    <image:image><image:loc>${esc(u.image)}</image:loc></image:image>\n`
            : "") +
          `    <priority>${u.priority}</priority>\n  </url>`
      )
      .join("\n") +
    `\n</urlset>\n`
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).setHeader("Allow", "GET").send("Method Not Allowed");
    return;
  }
  try {
    const xml = await buildSitemapXml();
    // Edge cache 1 hour (a newly published story appears within the
    // hour), stale-while-revalidate 1 day so crawlers never wait on a
    // slow origin read. Browsers/proxies must not cache it privately.
    res.setHeader("Content-Type", "application/xml");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    res.status(200).send(xml);
  } catch (err) {
    res.status(500).send(`Sitemap generation failed: ${err.message}`);
  }
}
