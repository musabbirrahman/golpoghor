/**
 * List/author bot OG. Shared author, genre, and shelf links are SPA
 * routes, so social and search crawlers would only ever see the generic shell meta.
 * Vercel rewrites crawler user-agents on those URLs to this function,
 * which serves each page's own title/description to bots, plus the
 * same JSON-LD the rendered page emits (Person/Book lists and
 * breadcrumbs) — the same pattern as api/og-story.js, for pages
 * that carry no single story.
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

// JSON-LD helpers: the bot HTML carries the same structured data the
// rendered page emits (Person/Book/ItemList/BreadcrumbList), so search
// crawlers get the associations without running JavaScript. Script
// content is escaped so a stray "<" in a title can never break out.
function ldJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function bookItem(title, username, slug) {
  return {
    "@type": "Book",
    name: title,
    url: `https://golponeer.com/stories/${encPath(username)}/${encPath(slug)}`,
  };
}

function breadcrumbList(crumbs) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, url], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: url,
    })),
  };
}

function itemList(items) {
  return {
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: it,
    })),
  };
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
  { value: "অ্যাডভেঞ্চার", bn: "অ্যাডভেঞ্চার", en: "Adventure", aliases: ["adventure"] },
  { value: "ফ্যান্টাসি", bn: "ফ্যান্টাসি", en: "Fantasy", aliases: ["fantasy"] },
  { value: "বিজ্ঞান কল্পকাহিনী", bn: "বিজ্ঞান কল্পকাহিনী", en: "Science Fiction", aliases: ["science-fiction", "science fiction", "sci-fi"] },
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

// Sub-category mirror of src/lib/subcategories.ts (ids + labels) and
// src/pages/tag.tsx SUBCATEGORY_BN. Same hand-sync caveat as genres.
const SUBCATEGORIES = [
  { id: "detective", label: "Detective", bn: "গোয়েন্দা" },
  { id: "supernatural", label: "Supernatural", bn: "অলৌকিক" },
  { id: "psychological", label: "Psychological", bn: "মনস্তাত্ত্বিক" },
  { id: "gothic", label: "Gothic", bn: "গথিক" },
  { id: "warm-romance", label: "Warm romance", bn: "মিষ্টি প্রেম" },
  { id: "tragic-romance", label: "Tragic romance", bn: "বিরহ" },
  { id: "war-conflict", label: "War & conflict", bn: "যুদ্ধ ও সংঘাত" },
  { id: "freedom-struggle", label: "Freedom struggle", bn: "স্বাধীনতা সংগ্রাম" },
  { id: "coming-of-age", label: "Coming of age", bn: "তারুণ্য ও বেড়ে ওঠা" },
  { id: "village-life", label: "Village life", bn: "গ্রামীণ জীবন" },
  { id: "relationships", label: "Relationships", bn: "সম্পর্ক" },
  { id: "childhood", label: "Childhood", bn: "শৈশব" },
  { id: "human-nature", label: "Human nature", bn: "মানবচরিত্র" },
  { id: "twist-irony", label: "Twist & irony", bn: "অপ্রত্যাশিত মোড়" },
  { id: "everyday-life", label: "Everyday life", bn: "দৈনন্দিন জীবন" },
  { id: "epic", label: "Epic", bn: "মহাকাব্যিক" },
  { id: "urban", label: "Urban", bn: "শহুরে ফ্যান্টাসি" },
  { id: "dark", label: "Dark", bn: "ডার্ক ফ্যান্টাসি" },
  { id: "lyric", label: "Lyric", bn: "গীতিকবিতা" },
  { id: "narrative", label: "Narrative", bn: "কাহিনীকাব্য" },
];

function subDescription(sub) {
  return `বাংলা ${sub.bn} গল্প ও English ${sub.label} stories — Bangla ${sub.label} stories and English ${sub.label} stories on GolpoNeer, free, no account needed.`;
}

// Sub-category -> major-genre group mirror of src/lib/subcategories.ts
// (used only for subcategory breadcrumb trails, as in tag.tsx).
const SUBCATEGORY_GROUPS = {
  detective: "রহস্য", supernatural: "রহস্য",
  psychological: "হরর", gothic: "হরর",
  "warm-romance": "রোমান্স", "tragic-romance": "রোমান্স",
  "war-conflict": "ইতিহাস", "freedom-struggle": "ইতিহাস",
  "coming-of-age": "সমকালীন",
  "village-life": "ছোটগল্প", relationships: "ছোটগল্প", childhood: "ছোটগল্প",
  "human-nature": "general", "twist-irony": "general", "everyday-life": "general",
  epic: "ফ্যান্টাসি", urban: "ফ্যান্টাসি", dark: "ফ্যান্টাসি",
  lyric: "কবিতা", narrative: "কবিতা",
};

// Tag pages mirror of src/pages/tag.tsx TAG_PAGES ("classics" + "tagore").
const TAG_PAGES = {
  classics: {
    bn: "ক্লাসিক", en: "Classic", matchTags: ["Classic", "ক্লাসিক"],
    title: "ক্লাসিক · Classic stories | GolpoNeer",
    description:
      "ক্লাসিক গল্প ও Classic stories — timeless classic stories on GolpoNeer, free, no account needed.",
  },
  tagore: {
    bn: "রবীন্দ্রনাথ ঠাকুর", en: "Tagore", matchTags: ["রবীন্দ্রনাথ ঠাকুর"],
    title: "রবীন্দ্রনাথ ঠাকুর · Tagore stories | GolpoNeer",
    description:
      "রবীন্দ্রনাথ ঠাকুরের গল্প ও Tagore stories — stories by Rabindranath Tagore on GolpoNeer, free, no account needed.",
  },
};

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

  // Per-kind story-list fetchers (public stories only, newest first,
  // mirroring the SPA listStories default order of published_at desc).
  async function usernameMap(ids) {
    const uniq = [...new Set((ids ?? []).filter(Boolean))];
    if (!uniq.length) return new Map();
    const rows = await get(
      `profiles?id=in.(${uniq.map((x) => encodeURIComponent(x)).join(",")})&select=id,username`
    );
    return new Map((rows ?? []).map((r) => [r.id, r.username]));
  }

  async function listStories(where, limit) {
    const rows = await get(
      `stories?${where}&status=in.(ongoing,complete)&order=published_at.desc&limit=${limit}&select=id,title,slug,author_id,published_at`
    );
    return rows ?? [];
  }

  async function booksFor(stories) {
    const names = await usernameMap(stories.map((r) => r.author_id));
    return stories
      .filter((r) => names.get(r.author_id))
      .map((r) => bookItem(r.title, names.get(r.author_id), r.slug));
  }

  let found = false;
  let jsonLd = null;
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
        `stories?author_id=eq.${encodeURIComponent(profile.id)}&status=in.(ongoing,complete)&order=published_at.desc&select=id,title,slug,genre,author_id,published_at&limit=50`
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
      const graph = [
        {
          "@type": "Person",
          name: display,
          url: canonical,
          description: profile.bio || undefined,
          ...(isAuthor ? { jobTitle: "Author" } : {}),
          ...(profile.avatar_path && !String(profile.avatar_path).startsWith("data:")
            ? { image }
            : {}),
        },
        breadcrumbList([
          ["Home", "https://golponeer.com/"],
          [display, canonical],
        ]),
      ];
      if (isAuthor) {
        const books = await booksFor(stories);
        if (books.length > 0) graph.push(itemList(books));
      }
      jsonLd = { "@context": "https://schema.org", "@graph": graph };
    }
  } else if (kind === "genre" && params.slug) {
    const def = genreFromSlug(params.slug);
    if (def) {
      found = true;
      title = `${def.bn} · ${pluralEn(def)} | GolpoNeer`;
      desc = genreDescription(def);
      canonical = `https://golponeer.com/genres/${genreSlug(def)}`;
      const stories = await listStories(`genre=eq.${encodeURIComponent(def.value)}`, 100);
      const graph = [
        breadcrumbList([
          ["Home", "https://golponeer.com/"],
          [`${def.bn} · ${def.en}`, canonical],
        ]),
      ];
      const books = await booksFor(stories);
      if (books.length > 0) graph.push(itemList(books));
      jsonLd = { "@context": "https://schema.org", "@graph": graph };
    }
  } else if (kind === "shelf" && params.slug) {
    const shelves = await get(
      `shelves?slug=eq.${encodeURIComponent(params.slug)}&select=id,slug,name,tagline`
    );
    const shelf = shelves?.[0] ?? null;
    if (shelf) {
      found = true;
      title = `${shelf.name} | GolpoNeer`;
      desc = shelf.tagline ? String(shelf.tagline).slice(0, 200) : siteDesc;
      canonical = `https://golponeer.com/shelves/${encPath(shelf.slug)}`;
      const items = await get(
        `shelf_items?shelf_id=eq.${encodeURIComponent(shelf.id)}&order=position.asc&select=story_id`
      );
      const order = (items ?? []).map((it) => it.story_id);
      const idSet = [...new Set(order.filter(Boolean))];
      let stories = [];
      if (idSet.length > 0) {
        const rows = await get(
          `stories?id=in.(${idSet.map((x) => encodeURIComponent(x)).join(",")})&status=in.(ongoing,complete)&select=id,title,slug,author_id,published_at`
        );
        const byId = new Map((rows ?? []).map((r) => [r.id, r]));
        stories = order.map((id) => byId.get(id)).filter(Boolean);
      }
      const graph = [
        breadcrumbList([
          ["Home", "https://golponeer.com/"],
          [shelf.name, canonical],
        ]),
      ];
      const books = await booksFor(stories);
      if (books.length > 0) graph.push(itemList(books));
      jsonLd = { "@context": "https://schema.org", "@graph": graph };
    }
  } else if (kind === "subcategory" && params.slug) {
    const sub = SUBCATEGORIES.find(
      (s) => s.id === String(params.slug).trim().toLowerCase()
    );
    if (sub) {
      found = true;
      title = `${sub.bn} · ${sub.label} stories | GolpoNeer`;
      desc = subDescription(sub);
      canonical = `https://golponeer.com/subcategories/${sub.id}`;
      const stories = await listStories(`subcategories=ov.{${sub.id}}`, 100);
      const groupValue = SUBCATEGORY_GROUPS[sub.id];
      const groupDef = groupValue ? GENRES.find((g) => g.value === groupValue) : null;
      const crumbs = [["Home", "https://golponeer.com/"]];
      if (groupDef) {
        crumbs.push([
          `${groupDef.bn} · ${groupDef.en}`,
          `https://golponeer.com/genres/${genreSlug(groupDef)}`,
        ]);
      }
      crumbs.push([`${sub.bn} · ${sub.label}`, canonical]);
      const graph = [breadcrumbList(crumbs)];
      const books = await booksFor(stories);
      if (books.length > 0) graph.push(itemList(books));
      jsonLd = { "@context": "https://schema.org", "@graph": graph };
    }
  } else if (kind === "tag" && params.slug) {
    const tag = TAG_PAGES[String(params.slug).trim().toLowerCase()];
    if (tag) {
      found = true;
      title = tag.title;
      desc = tag.description;
      canonical = `https://golponeer.com/tags/${encPath(String(params.slug).trim().toLowerCase())}`;
      const merged = new Map();
      for (const match of tag.matchTags) {
        const rows = await listStories(`tags=cs.{${encodeURIComponent(match)}}`, 100);
        for (const r of rows) merged.set(r.id, r);
      }
      const stories = [...merged.values()].sort((a, b) =>
        (b.published_at ?? "").localeCompare(a.published_at ?? "")
      );
      const graph = [
        breadcrumbList([
          ["Home", "https://golponeer.com/"],
          [`${tag.bn} · ${tag.en}`, canonical],
        ]),
      ];
      const books = await booksFor(stories);
      if (books.length > 0) graph.push(itemList(books));
      jsonLd = { "@context": "https://schema.org", "@graph": graph };
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
${jsonLd ? `<script type="application/ld+json">${ldJson(jsonLd)}</script>` : ""}
</head><body>
${found
  ? `<p><a href="${esc(canonical)}">Visit this page on GolpoNeer</a></p>`
  : `<p>This page is not public. <a href="https://golponeer.com/">Visit GolpoNeer</a></p>`}
</body></html>`);
}
