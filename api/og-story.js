/**
 * Story bot OG (SEO item 4) + Phase 3 prerender. Shared story links
 * (/stories/:username/:slug) are SPA routes, so social and search crawlers
 * would only ever see the generic shell meta. Vercel rewrites crawler
 * user-agents on story URLs to this function, which serves the story's own
 * title/summary to bots, plus the same Book + breadcrumb JSON-LD the
 * rendered story page emits.
 *
 * Phase 3: search indexers (googlebot, bingbot, google-inspectiontool)
 * get the full prerendered story page — title, author, full summary,
 * genre/tags, the complete chapter list, and only a ~300-character excerpt
 * of the first chapter (the SPA's "Look Inside" excerpt, computed the same
 * way). Social bots keep the lightweight OG head-only response (they only
 * parse <head> meta and have strict time/size caps). The body is rendered
 * from the SPA shell (dist/index.html, bundled via vercel.json
 * includeFiles) with the homepage bake tags stripped; a standalone HTML
 * fallback serves the content when the shell is unavailable.
 *
 * Privacy rule (the whole point of the gating below): ONLY public stories
 * unfurl/prerender. A story counts as public iff status is ongoing/complete
 * AND it has at least one published chapter — the same rule as
 * story_is_public. Drafts, hidden stories, and missing stories get generic
 * meta + 404, never their title or summary. The anon key can only read what
 * RLS allows, and the JS check is applied regardless of what RLS returns.
 *
 * Full chapter text lives only on the reader page — out of scope for
 * prerendering and out of the sitemap. Only the ~300-char excerpt of the
 * first chapter is served here, never a full chapter body.
 *
 * Old URLs keep unfurling: on a story miss, the slug-redirect table is
 * consulted (its read policy already hides redirects to non-public
 * stories from anonymous callers) and the OG is served with the CURRENT
 * canonical URL. Username renames are followed the same way as the
 * client's resolveUsername (3 hops max, expiry-aware, loop-guarded).
 *
 * Query params: a request carrying non-routing query params (utm_*, fbclid,
 * …) is 301-redirected to the canonical story URL before any Supabase
 * fetch, so crawlers cannot bust the edge cache with arbitrary params.
 * The rewrite passes username/slug as query params; anything else is
 * non-routing.
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

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Search indexers only — full prerendered body HTML goes to these UAs.
// Social bots keep the lightweight OG head-only response (they only parse
// <head> meta and have strict time/size caps).
const INDEXER_UA = /googlebot|bingbot|google-inspectiontool/i;

// The SPA shell template (dist/index.html), bundled via vercel.json
// `includeFiles`, read once and cached. Returns null when it cannot be
// found (the standalone fallback then serves the content without the
// shell). Same pattern as api/prerender.js (Phase 1) and api/og-page.js
// (Phase 2).
let shellCache = null;
let shellTried = false;
function readShell() {
  if (shellTried) return shellCache;
  shellTried = true;
  const candidates = [
    path.join(process.cwd(), "dist", "index.html"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.html"),
  ];
  for (const candidate of candidates) {
    try {
      shellCache = readFileSync(candidate, "utf8");
      return shellCache;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

// Strip the homepage-only bake tags from the shell template, so the
// featured-cover preload and the baked featured data never leak onto
// another page. Same pattern as api/prerender.js (Phase 1).
function stripBakeTags(shell) {
  return shell
    .replace(/<link rel="preload"[^>]*>/g, "")
    .replace(/<script>window\.__BAKED_FEATURED__=[\s\S]*?<\/script>/g, "");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encPath(seg) {
  return encodeURIComponent(seg);
}

// JSON-LD helpers: the bot HTML carries the same Book + breadcrumb data
// the rendered story page emits, so search crawlers get the associations
// without running JavaScript. Script content is escaped so a stray "<"
// in a title can never break out.
function ldJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

// Genre taxonomy mirror of src/lib/genres.ts (values + labels only;
// og-page.js carries the same table with slugs and aliases).
const GENRES = [
  { value: "general", bn: "সাধারণ", en: "General" },
  { value: "ছোটগল্প", bn: "ছোটগল্প", en: "Short story" },
  { value: "সমকালীন", bn: "সমকালীন", en: "Contemporary" },
  { value: "রোমান্স", bn: "রোমান্স", en: "Romance" },
  { value: "রহস্য", bn: "রহস্য", en: "Mystery" },
  { value: "থ্রিলার", bn: "থ্রিলার", en: "Thriller" },
  { value: "অ্যাডভেঞ্চার", bn: "অ্যাডভেঞ্চার", en: "Adventure" },
  { value: "ফ্যান্টাসি", bn: "ফ্যান্টাসি", en: "Fantasy" },
  { value: "বিজ্ঞান কল্পকাহিনী", bn: "বিজ্ঞান কল্পকাহিনী", en: "Science Fiction" },
  { value: "হরর", bn: "হরর", en: "Horror" },
  { value: "ঐতিহাসিক", bn: "ঐতিহাসিক", en: "History" },
  { value: "কবিতা", bn: "কবিতা", en: "Poetry" },
];

function genreSlug(def) {
  return def.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Reading speed (mirror of src/lib/utils.ts READING_WPM): Bangla reads
// slower than English. The story page shows "~N min read" from the
// total published word count.
const READING_WPM = { en: 220, bn: 180 };
function readingMinutes(wordCount, language) {
  if (!wordCount || wordCount <= 0) return 0;
  return Math.max(1, Math.round(wordCount / (READING_WPM[language] ?? READING_WPM.en)));
}

const STATUS_BN = { ongoing: "চলমান", complete: "সমাপ্ত" };

// The SPA's "Look Inside" excerpt (src/pages/story.tsx), replicated
// exactly: walk the first chapter's Tiptap doc, skip header lines
// (empty lines, the chapter/story title, "Story:" / "Original author:" /
// "Translator:" / … labels, rule lines, "Chapter N" lines), then collect
// paragraph text until it reaches 300 chars. Short lines are joined (so
// a poem shows its opening lines); the result is capped at 300 chars
// with an ellipsis. Only this excerpt is served — never a full chapter.
function plainText(node) {
  return node.text ?? (node.content ?? []).map(plainText).join("");
}

function excerptFromDoc(bodyJson, chapterTitle, storyTitle) {
  const chapterTitleNorm = String(chapterTitle ?? "").trim();
  const storyTitleNorm = String(storyTitle ?? "").trim();
  function isHeaderLine(text) {
    const t = text.trim();
    if (!t) return true;
    if (chapterTitleNorm && t.toLowerCase() === chapterTitleNorm.toLowerCase()) return true;
    if (storyTitleNorm && t.toLowerCase() === storyTitleNorm.toLowerCase()) return true;
    if (/^(story|original author|author|translator|adapted by|source|edition|archived|published|copyright)\s*:/i.test(t)) return true;
    if (/^[=\-_]{3,}$/.test(t)) return true;
    if (/^(chapter|part|section)\s+[\w\d]+$/i.test(t)) return true;
    return false;
  }
  const paras = [];
  let started = false;
  for (const n of bodyJson?.content ?? []) {
    if (n.type !== "paragraph") {
      if (started) break;
      continue;
    }
    const t = plainText(n).trim();
    if (!started) {
      if (isHeaderLine(t)) continue;
      started = true;
    }
    paras.push(t);
    if (paras.join(" ").length >= 300) break;
  }
  const raw = paras.join(" ").replace(/\s+/g, " ").trim();
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}

export default async function handler(req, res) {
  const params =
    req.query ?? Object.fromEntries(new URL(req.url, "https://golponeer.com").searchParams);
  const username = params.username || "";
  const slug = params.slug || "";
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  // Strip non-routing query params (utm_*, fbclid, …) before any fetch:
  // the rewrite passes username/slug as query params, so anything else
  // is a param the crawler (or a shared link) added. A 301 to the
  // canonical story URL keeps the edge cache key clean — one cached
  // copy per story, not one per param combination.
  if (username && slug) {
    const extra = Object.keys(params).filter((k) => k !== "username" && k !== "slug");
    if (extra.length > 0) {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      res.redirect(
        301,
        `https://golponeer.com/stories/${encPath(username)}/${encPath(slug)}`
      );
      return;
    }
  }

  async function get(path) {
    if (!base || !key) return null;
    try {
      const r = await fetch(`${base}/rest/v1/${path}`, {
        signal: AbortSignal.timeout(3500),
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
  let authorAvatarPath = null;
  if (username && slug) {
    const currentUsername = await resolveUsername(username);
    const profiles = await get(
      `profiles?username=eq.${encodeURIComponent(currentUsername)}&select=id,username,display_name,avatar_path`
    );
    const profile = profiles?.[0] ?? null;
    if (profile) {
      canonicalUser = profile.username;
      authorName = profile.display_name || profile.username;
      authorAvatarPath = profile.avatar_path ?? null;
      const stories = await get(
        `stories?author_id=eq.${encodeURIComponent(profile.id)}&slug=eq.${encodeURIComponent(slug)}&select=id,title,summary,status,slug,cover_path,language,genre,tags,subcategories,published_at,updated_at,origin_type,original_author,original_title,translator_name,adapter_name,edition_source`
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
            `stories?id=eq.${encodeURIComponent(targetId)}&select=id,title,summary,status,slug,cover_path,language,genre,tags,subcategories,published_at,updated_at,origin_type,original_author,original_title,translator_name,adapter_name,edition_source`
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

  // Author avatar (same validation as api/og-page.js): only a
  // well-formed <user-uuid>/<file> path is trusted.
  const AVATAR_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;
  function publicAvatarUrl(p) {
    if (!p || !AVATAR_PATH_RE.test(p)) return null;
    const [uid, file] = p.split("/");
    return `${base}/storage/v1/object/public/avatars/${encodeURIComponent(uid)}/${encodeURIComponent(file)}`;
  }

  const siteTitle = "GolpoNeer";
  const siteDesc = "GolpoNeer — a nest for stories. Read and share Bangla and English stories.";
  const cover = (isPublic && publicThumbUrl(story)) || "https://golponeer.com/og-cover.jpg";
  const canonical = isPublic
    ? `https://golponeer.com/stories/${encPath(canonicalUser)}/${encPath(story.slug)}`
    : "https://golponeer.com/";

  const titleAuthor =
    isPublic &&
    story.origin_type &&
    story.origin_type !== "original" &&
    story.original_author
      ? story.original_author
      : authorName;
  const title = isPublic ? `${story.title} — ${titleAuthor} | ${siteTitle}` : siteTitle;
  const desc = isPublic
    ? String(story.summary || "").slice(0, 200) || siteDesc
    : siteDesc;

  // Book + breadcrumb JSON-LD, mirroring the rendered story page: for
  // classics/translations the author is the original author, otherwise
  // the publishing account; translator, language, genre, dates, cover,
  // and the free-to-read signal match the page exactly. Non-public
  // stories get no script, same as the 404 + generic meta above.
  let jsonLd = null;
  if (isPublic) {
    const isClassic =
      story.origin_type && story.origin_type !== "original" && story.original_author;
    const genreDef = (GENRES.find((g) => g.value === story.genre)) ?? null;
    const crumbs = [["Home", "https://golponeer.com/"]];
    if (genreDef) {
      crumbs.push([
        `${genreDef.bn} · ${genreDef.en}`,
        `https://golponeer.com/genres/${genreSlug(genreDef)}`,
      ]);
    }
    crumbs.push([story.title, canonical]);
    jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Book",
          name: story.title,
          author: isClassic
            ? { "@type": "Person", name: story.original_author }
            : {
                "@type": "Person",
                name: authorName,
                url: `https://golponeer.com/authors/${encPath(canonicalUser)}`,
              },
          ...(story.translator_name
            ? { translator: { "@type": "Person", name: story.translator_name } }
            : {}),
          inLanguage: story.language,
          url: canonical,
          description: story.summary || undefined,
          genre: story.genre || undefined,
          datePublished: story.published_at || undefined,
          dateModified: story.updated_at || undefined,
          publisher: {
            "@type": "Organization",
            name: "GolpoNeer",
            url: "https://golponeer.com/",
          },
          ...(cover !== "https://golponeer.com/og-cover.jpg"
            ? { image: cover, isAccessibleForFree: true }
            : {}),
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: crumbs.map(([name, url], i) => ({
            "@type": "ListItem",
            position: i + 1,
            name,
            item: url,
          })),
        },
      ],
    };
  }

  // The story body (search indexers only): the same content the SPA
  // story page shows — breadcrumb, cover, badges, title, author, full
  // summary, attribution, stats, the "Look Inside" excerpt, and the full
  // chapter list. Rendered in Bangla (the SPA default locale). "More by
  // author" is a recommendation widget, not the story's own content, so
  // it is not rendered here. No full chapter text is ever served.
  async function renderStoryBody() {
    // Published chapters (metadata only — bodies load per chapter in the
    // reader) in position order, plus the first chapter's body_json for
    // the excerpt. The two fetches are independent, so they run together.
    const [chapters, firstChapters] = await Promise.all([
      get(
        `chapters?story_id=eq.${encodeURIComponent(story.id)}&status=eq.published&order=position.asc&select=id,title,slug,position,word_count`
      ),
      get(
        `chapters?story_id=eq.${encodeURIComponent(story.id)}&status=eq.published&order=position.asc&limit=1&select=id,title,slug,body_json`
      ),
    ]);
    const list = chapters ?? [];
    const first = firstChapters?.[0] ?? null;
    const excerpt = first ? excerptFromDoc(first.body_json, first.title, story.title) : "";
    const totalWords = list.reduce((sum, c) => sum + (c.word_count ?? 0), 0);
    const minutes = readingMinutes(totalWords, story.language);
    const genreDef = (GENRES.find((g) => g.value === story.genre)) ?? null;
    const genrePath = genreDef
      ? `/genres/${genreSlug(genreDef)}`
      : `/discover?genre=${encodeURIComponent(story.genre)}`;
    const avatarUrl = publicAvatarUrl(authorAvatarPath);
    const publishedDate = story.published_at
      ? new Date(story.published_at).toISOString().slice(0, 10)
      : "";
    const parts = [];
    parts.push(
      `<nav><a href="https://golponeer.com/">হোম</a> › ` +
        `<a href="https://golponeer.com${genrePath}">${genreDef ? esc(`${genreDef.bn} · ${genreDef.en}`) : esc(story.genre)}</a> › ` +
        `${esc(story.title)}</nav>`
    );
    if (cover !== "https://golponeer.com/og-cover.jpg") {
      parts.push(`<img src="${esc(cover)}" alt="${esc(story.title)}">`);
    }
    const badges = [];
    badges.push(story.language === "bn" ? "বাংলা" : "English");
    badges.push(STATUS_BN[story.status] ?? story.status);
    if (genreDef) badges.push(`${genreDef.bn} · ${genreDef.en}`);
    for (const tag of story.tags ?? []) badges.push(`#${tag}`);
    for (const sub of story.subcategories ?? []) badges.push(sub);
    parts.push(`<p>${badges.map((b) => esc(b)).join(" · ")}</p>`);
    parts.push(`<h1>${esc(story.title)}</h1>`);
    parts.push(
      `<p>${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="${esc(authorName)}"> ` : ""}` +
        `<a href="https://golponeer.com/authors/${encPath(canonicalUser)}">${esc(authorName)}</a> @${esc(canonicalUser)}</p>`
    );
    if (story.summary) {
      parts.push(`<h2>গল্পের সংক্ষেপ</h2><p>${esc(story.summary)}</p>`);
    }
    const attribution = [];
    if (story.original_author) attribution.push(["মূল লেখক", story.original_author]);
    if (story.original_title) attribution.push(["মূল শিরোনাম", story.original_title]);
    if (story.translator_name) attribution.push(["অনুবাদক", story.translator_name]);
    if (story.adapter_name) attribution.push(["রূপান্তরকারী", story.adapter_name]);
    if (story.edition_source) attribution.push(["উৎস সংস্করণ", story.edition_source]);
    if (attribution.length > 0) {
      parts.push(
        `<dl>${attribution.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
      );
    }
    const stats = [];
    stats.push(`${list.length} অধ্যায়`);
    if (minutes > 0) stats.push(`~${minutes} মিনিট`);
    if (publishedDate) stats.push(`প্রকাশিত ${publishedDate}`);
    parts.push(`<p>${stats.map((s) => esc(s)).join(" · ")}</p>`);
    if (excerpt && list.length > 0) {
      parts.push(
        `<h2>ভেতরে এক ঝলক</h2>` +
          `<p>অধ্যায় ১ · ${esc(list[0].title)}</p>` +
          `<p>${esc(excerpt)}</p>`
      );
    }
    if (list.length > 0) {
      parts.push(
        `<h2>সূচিপত্র (${list.length})</h2><ol>` +
          list
            .map(
              (c, i) =>
                `<li><a href="https://golponeer.com/stories/${encPath(canonicalUser)}/${encPath(story.slug)}/${encPath(c.slug)}">অধ্যায় ${i + 1} — ${esc(c.title)}</a></li>`
            )
            .join("") +
          `</ol>`
      );
    }
    return parts.join("\n");
  }

  // A standalone HTML page (no SPA shell) for the no-shell fallback.
  // Carries the title, description, canonical, JSON-LD, and the body —
  // so a crawler always gets readable content, never an error.
  function standaloneHtml(body) {
    return (
      `<!doctype html><html lang="bn"><head><meta charset="utf-8">` +
      `<title>${esc(title)}</title>` +
      `<meta name="description" content="${esc(desc)}">` +
      `<link rel="canonical" href="${esc(canonical)}">` +
      (jsonLd ? `<script type="application/ld+json">${ldJson(jsonLd)}</script>` : "") +
      `</head><body>${body}</body></html>`
    );
  }

  const ua = String(req.headers["user-agent"] ?? "");
  const isIndexer = INDEXER_UA.test(ua);

  // Search indexer with a public story: full HTML (shell + body), same
  // 60-second cache as the OG response — revoked content stops being
  // served within ~1-2 minutes. If the chapter list could not be
  // fetched, the indexer gets the OG head-only response (never an
  // empty prerender).
  if (isIndexer && isPublic) {
    const body = await renderStoryBody();
    const shell = readShell();
    if (!shell) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(standaloneHtml(body));
      return;
    }
    let html = stripBakeTags(shell);
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${esc(desc)}" />`
    );
    html = html.replace(
      /<link rel="canonical" href="[^"]*"[^>]*>/,
      `<link rel="canonical" href="${esc(canonical)}" />`
    );
    // The og tags in the prerendered head match the OG response (the
    // bot layer's per-page values), not the shell's homepage values.
    // The \s+ forms match the shell's multi-line meta tags.
    html = html.replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${esc(title)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${esc(desc)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${esc(canonical)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${esc(cover)}" />`
    );
    if (jsonLd) {
      html = html.replace(
        "</head>",
        `<script type="application/ld+json">${ldJson(jsonLd)}</script>\n</head>`
      );
    }
    if (html.includes('<div id="root"></div>')) {
      html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    } else {
      html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${body}</div>`);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).send(html);
    return;
  }

  // Everyone else (social bots, and search indexers on non-public
  // stories): the OG head-only response, unchanged.
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
${jsonLd ? `<script type="application/ld+json">${ldJson(jsonLd)}</script>` : ""}
</head><body>
${isPublic
  ? `<p><a href="${esc(canonical)}">Read this story on GolpoNeer</a></p>`
  : `<p>This story is not public. <a href="https://golponeer.com/">Visit GolpoNeer</a></p>`}
</body></html>`);
}

// Named export for scripts/check-taxonomy-parity.mjs (CI guard).
export { GENRES };
