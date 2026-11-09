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
 * - genre: the bilingual genre title and the Bangla SEO meta description
 *   from the genre page (TAXONOMY_META, hand-synced with
 *   src/lib/taxonomy-seo.ts).
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
// changes rarely. A mismatch here falls back to generic meta (see the
// drift safety net in the genre/subcategory/tag branches) instead of a
// 404 — and scripts/check-taxonomy-parity.mjs fails CI if the tables
// drift from src/lib/ at all.
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
  { value: "ঐতিহাসিক", bn: "ঐতিহাসিক", en: "History", aliases: ["history", "historical"] },
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

// SEO meta descriptions for genre + subcategory pages — hand-synced mirror of
// src/lib/taxonomy-seo.ts (TAXONOMY_METADATA[].metaDescriptionBn). Kept in sync
// by hand; the taxonomy changes rarely, and a mismatch here only falls
// back to the formulaic description below.
const TAXONOMY_META = {
  "general": "বাস্তব জীবনের গল্প, জীবনের গল্প ও সেরা বাংলা সামাজিক কাহিনী অনলাইনে পড়ুন। আমাদের চারপাশের চেনা মানুষ, সমাজ ও জীবনের হৃদয়স্পর্শী বাংলা গল্পের সম্ভার।",
  "human-nature": "মানবচরিত্র ও মানুষের মনস্তত্ত্ব নিয়ে লেখা সেরা বাংলা গল্প পড়ুন। নৈতিক দ্বন্দ্ব, মানবিকতা, স্বার্থ এবং সমাজের আসল রূপের বাস্তব জীবনের কাহিনী।",
  "twist-irony": "চমকে দেওয়া টুইস্ট ও অপ্রত্যাশিত মোড়ের বাংলা গল্প অনলাইনে পড়ুন। ভাগ্যের পরিহাস এবং শেষ মুহূর্তে সব হিসাব বদলে দেওয়া রোমাঞ্চকর কাহিনী।",
  "everyday-life": "সাধারণ মানুষের দৈনন্দিন জীবনের বাংলা গল্প অনলাইনে পড়ুন। মধ্যবিত্তের জীবন সংগ্রাম, রোজকার চেনা রুটিন ও ছোট ছোট সুখ-দুঃখের বাস্তব কাহিনী।",
  "short-story": "নতুন ও সেরা বাংলা ছোটগল্প অনলাইনে পড়ুন। এক বসায় পড়ার মতো হৃদয়স্পর্শী, সাহিত্যধর্মী ও বাস্তব জীবনের অসাধারণ সব বাংলা ছোটগল্পের সম্ভার।",
  "village-life": "গ্রামবাংলার গল্প ও গ্রামীণ জীবনের বাংলা ছোটগল্প অনলাইনে পড়ুন। বাংলার মাটি, নদী, পল্লীপ্রকৃতি এবং সহজ-সরল মানুষের চিরচেনা কাহিনী।",
  "relationships": "পারিবারিক ও সম্পর্কের বাংলা গল্প অনলাইনে পড়ুন। মা-বাবা, দাম্পত্য জীবন, বন্ধুত্ব এবং মানুষের পারস্পরিক সম্পর্কের মায়া ও জটিলতার কাহিনী।",
  "childhood": "শৈশবের স্মৃতি ও দুরন্ত ছেলেবেলার বাংলা গল্প অনলাইনে পড়ুন। ফেলে আসা স্কুলজীবন, গ্রামের শৈশব এবং নিষ্পাপ আনন্দের নস্টালজিক কাহিনী।",
  "contemporary": "সমকালীন বাংলা গল্প ও আধুনিক জীবনের কাহিনী অনলাইনে পড়ুন। বর্তমান সমাজ, নাগরিক জীবন এবং তরুণ প্রজন্মের বাস্তব সংকটের নতুন বাংলা গল্প।",
  "coming-of-age": "তারুণ্য, কৈশোর ও বেড়ে ওঠার বাংলা গল্প অনলাইনে পড়ুন। বয়ঃসন্ধি, ক্যাম্পাস জীবন, বন্ধুত্ব, স্বপ্ন দেখা এবং আত্মোপলব্ধির সমকালীন কাহিনী।",
  "romance": "সেরা বাংলা রোমান্টিক গল্প এবং প্রেমের কাহিনী অনলাইনে পড়ুন। ভালোবাসার মানুষ, মিষ্টি প্রেম, বিরহ ও হৃদয়ের টানাপোড়েনের নতুন সব বাংলা গল্প।",
  "warm-romance": "মন ভালো করা বাংলা মিষ্টি প্রেমের গল্প ও রোমান্টিক কাহিনী পড়ুন। প্রথম প্রেম, নিষ্পাপ ভালোবাসা ও হৃদয়ছোঁয়া অনুভূতির সেরা গল্প।",
  "tragic-romance": "বাংলা বিরহের গল্প ও কষ্টের প্রেমের গল্প অনলাইনে পড়ুন। অপূর্ণ ভালোবাসা, বিচ্ছেদের ব্যথা এবং চোখ ভিজিয়ে দেওয়া আবেগঘন রোমান্টিক কাহিনী।",
  "mystery": "সেরা বাংলা রহস্য গল্প ও অমীমাংসিত রহস্যের কাহিনী অনলাইনে পড়ুন। গোপন সংকেত, ধাঁধা, গোয়েন্দা তদন্ত ও অলৌকিক রহস্যের রোমাঞ্চকর সম্ভার।",
  "detective": "নতুন ও সেরা বাংলা গোয়েন্দা গল্প এবং ডিটেকটিভ কাহিনী অনলাইনে পড়ুন। খুনের রহস্য, অপরাধ তদন্ত এবং মগজাস্ত্রের বুদ্ধিদীপ্ত খেলার গল্প।",
  "supernatural": "বাংলা অলৌকিক গল্প ও অতিপ্রাকৃত রহস্য কাহিনী অনলাইনে পড়ুন। যুক্তির বাইরের ঘটনা, প্যারানরমাল রহস্য এবং অশরীরী জগতের শিহরণ জাগানো গল্প।",
  "thriller": "সেরা বাংলা থ্রিলার গল্প, সাসপেন্স ও ক্রাইম থ্রিলার অনলাইনে পড়ুন। রুদ্ধশ্বাস উত্তেজনা, মার্ডার মিস্ট্রি এবং প্রতি মুহূর্তে চমকে দেওয়া নতুন থ্রিলার কাহিনী।",
  "adventure": "বাংলা অ্যাডভেঞ্চার গল্প ও রোমাঞ্চকর অভিযানের কাহিনী অনলাইনে পড়ুন। গুপ্তধনের সন্ধান, দুর্গম জঙ্গল, সমুদ্রযাত্রা ও অজানা রহস্য জয়ের গল্প।",
  "fantasy": "বাংলা ফ্যান্টাসি গল্প, জাদুর রাজ্য এবং কাল্পনিক জগতের কাহিনী অনলাইনে পড়ুন। রূপকথা, জাদুবিদ্যা ও মায়াবী কল্পলোকের নতুন সব বাংলা গল্প।",
  "epic": "বাংলা মহাকাব্যিক ও এপিক ফ্যান্টাসি গল্প অনলাইনে পড়ুন। বিশাল কাল্পনিক সাম্রাজ্য, প্রাচীন সিংহাসন এবং শুভ-অশুভের মহাযুদ্ধের রোমাঞ্চকর আখ্যান।",
  "urban": "বাংলা আরবান ফ্যান্টাসি ও আধুনিক শহরের জাদুর গল্প অনলাইনে পড়ুন। চেনা শহরের আড়ালে লুকিয়ে থাকা জাদু, রহস্য ও অতিপ্রাকৃত শক্তির আধুনিক কাহিনী।",
  "dark": "বাংলা ডার্ক ফ্যান্টাসি ও অন্ধকার জাদুর রোমাঞ্চকর গল্প অনলাইনে পড়ুন। অভিশপ্ত কল্পলোক, ভয়াবহ দানব এবং রহস্যে ঘেরা ডার্ক ফ্যান্টাসি কাহিনী।",
  "science-fiction": "সেরা বাংলা সায়েন্স ফিকশন গল্প ও বিজ্ঞান কল্পকাহিনী অনলাইনে পড়ুন। মহাকাশ অভিযান, টাইম ট্রাভেল, এলিয়েন, রোবট ও ভবিষ্যতের পৃথিবীর রোমাঞ্চকর গল্প।",
  "horror": "গা ছমছমে বাংলা ভূতের গল্প, হরর এবং ভৌতিক কাহিনী অনলাইনে পড়ুন। নিঝুম রাতের অজানা আতঙ্ক, প্রেতাত্মা ও হাড় হিম করা ভয়ের গল্পের আসর।",
  "psychological": "বাংলা মনস্তাত্ত্বিক গল্প, সাইকোলজিক্যাল হরর ও থ্রিলার অনলাইনে পড়ুন। মনের অন্ধকার কোণ, ভ্রম এবং স্নায়ুচাপ বাড়িয়ে দেওয়া রহস্যময় কাহিনী।",
  "gothic": "বাংলা গথিক হরর ও প্রাচীন জমিদার বাড়ির ভৌতিক গল্প পড়ুন। অভিশপ্ত প্রাসাদ, পুরনো রহস্য এবং ছমছমে বিষণ্ণ পরিবেশের ক্লাসিক ভয়ের কাহিনী।",
  "history": "বাংলা ঐতিহাসিক গল্প ও ইতিহাসের পটভূমিতে লেখা কাহিনী অনলাইনে পড়ুন। প্রাচীন বাংলা, রাজা-বাদশা, ঐতিহ্য এবং ফেলে আসা সময়ের জীবন্ত আখ্যান।",
  "war-conflict": "যুদ্ধ ও সংঘাতের বাংলা ঐতিহাসিক গল্প অনলাইনে পড়ুন। রণক্ষেত্রের লড়াই, দেশরক্ষা, রাজনৈতিক সংকট ও যুদ্ধের মাঝে টিকে থাকার মানবিক কাহিনী।",
  "freedom-struggle": "মুক্তিযুদ্ধ ও স্বাধীনতা সংগ্রামের বাংলা গল্প অনলাইনে পড়ুন। দেশপ্রেম, স্বদেশী আন্দোলন, বিপ্লব এবং বীর মুক্তিযোদ্ধাদের আত্মত্যাগের অমর কাহিনী।",
  "poetry": "নতুন ও সেরা বাংলা কবিতা অনলাইনে পড়ুন। প্রেম, বিরহ, প্রকৃতি, দেশপ্রেম ও বিদ্রোহের ছন্দে লেখা আধুনিক ও সমকালীন বাংলা কবিতার বিশাল সম্ভার।",
  "lyric": "বাংলা গীতিকবিতা ও রোমান্টিক ছন্দের কবিতা অনলাইনে পড়ুন। প্রেম, বিরহ, প্রকৃতি এবং হৃদয়ের গভীর অনুভূতির সুরেলা কাব্যিক প্রকাশ।",
  "narrative": "বাংলা কাহিনীকাব্য ও আখ্যানকাব্য অনলাইনে পড়ুন। ছন্দের তালে গাথা পূর্ণাঙ্গ গল্প, ঐতিহাসিক ঘটনা ও জীবনের দীর্ঘ কাব্যগাথা।",
};

function genreDescription(def) {
  if (TAXONOMY_META[genreSlug(def)]) return TAXONOMY_META[genreSlug(def)];
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
  if (TAXONOMY_META[sub.id]) return TAXONOMY_META[sub.id];
  return `বাংলা ${sub.bn} গল্প ও English ${sub.label} stories — Bangla ${sub.label} stories and English ${sub.label} stories on GolpoNeer, free, no account needed.`;
}

// Sub-category -> major-genre group mirror of src/lib/subcategories.ts
// (used only for subcategory breadcrumb trails, as in tag.tsx).
const SUBCATEGORY_GROUPS = {
  detective: "রহস্য", supernatural: "রহস্য",
  psychological: "হরর", gothic: "হরর",
  "warm-romance": "রোমান্স", "tragic-romance": "রোমান্স",
  "war-conflict": "ঐতিহাসিক", "freedom-struggle": "ঐতিহাসিক",
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

  // Follow username renames (mirror of resolveUsername in api/og-story.js
  // and the client's resolveUsername): 3 hops max, expiry-aware,
  // loop-guarded, lowercased. Without this, a renamed author 404s on
  // /authors/:old_username for bots while the SPA resolves it.
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

  // Avatar paths are always <author-uuid>/<safe filename> (see
  // uploadAvatar in the Supabase provider). Only that shape is trusted —
  // the same strict regex as COVER_PATH_RE in api/og-story.js — so a
  // crafted avatar_path can never inject a foreign host, a data: URI, or
  // a ../ traversal into og:image / JSON-LD / prerendered <img> tags.
  // Anything else falls back to the generic cover.
  const AVATAR_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;
  function publicAvatarUrl(p) {
    if (!p || !AVATAR_PATH_RE.test(p)) return null;
    const [uid, file] = p.split("/");
    return `${base}/storage/v1/object/public/avatars/${encodeURIComponent(uid)}/${encodeURIComponent(file)}`;
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

  // Public = status ongoing/complete AND >= 1 published chapter (the
  // story_is_public rule): the chapters!inner join enforces the chapter
  // gate server-side, so a story whose chapters are all drafts never
  // leaks into a list and never marks its account as an author.
  // Ordering matches the SPA (published_at desc, NULLS LAST, id
  // tie-breaker). The select carries the attribution fields the SPA
  // shows on cards/titles (origin_type, original_author, translator_name)
  // so the prerender can match the SPA exactly.
  async function listStories(where, limit) {
    const rows = await get(
      `stories?${where}&status=in.(ongoing,complete)&order=published_at.desc.nullslast,id.asc&limit=${limit}&select=id,title,slug,author_id,published_at,origin_type,original_author,translator_name,summary,genre,tags,language,cover_path,chapters!inner(id)&chapters.status=eq.published&chapters.limit=1`
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
    // Follow username renames the same way the story handler does, so a
    // renamed author does not 404 here while the SPA resolves it.
    const currentUsername = await resolveUsername(params.username);
    const profiles = await get(
      `profiles?username=eq.${encodeURIComponent(currentUsername)}&select=id,username,display_name,bio,avatar_path`
    );
    const profile = profiles?.[0] ?? null;
    if (profile) {
      const display = profile.display_name || profile.username;
      const stories = await get(
        `stories?author_id=eq.${encodeURIComponent(profile.id)}&status=in.(ongoing,complete)&order=published_at.desc.nullslast,id.asc&select=id,title,slug,genre,author_id,published_at,origin_type,original_author,translator_name,summary,tags,language,cover_path,chapters!inner(id)&chapters.status=eq.published&chapters.limit=1&limit=50`
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
      const avatarUrl = publicAvatarUrl(profile.avatar_path);
      if (avatarUrl) image = avatarUrl;
      canonical = `https://golponeer.com/authors/${encPath(profile.username)}`;
      const graph = [
        {
          "@type": "Person",
          name: display,
          url: canonical,
          description: profile.bio || undefined,
          ...(isAuthor ? { jobTitle: "Author" } : {}),
          ...(avatarUrl ? { image } : {}),
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
    } else {
      // Taxonomy-drift safety net: a genre the SPA knows but this file
      // does not (see the parity check) must not 404 a live page.
      // Generic meta + 200; the parity check is the primary guard.
      found = true;
      canonical = `https://golponeer.com/genres/${encPath(String(params.slug).trim().toLowerCase())}`;
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
          `stories?id=in.(${idSet.map((x) => encodeURIComponent(x)).join(",")})&status=in.(ongoing,complete)&select=id,title,slug,author_id,published_at,origin_type,original_author,translator_name,summary,genre,tags,language,cover_path,chapters!inner(id)&chapters.status=eq.published&chapters.limit=1`
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
    } else {
      // Taxonomy-drift safety net (see the genre branch above).
      found = true;
      canonical = `https://golponeer.com/subcategories/${encPath(String(params.slug).trim().toLowerCase())}`;
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
      const stories = [...merged.values()].sort((a, b) => {
        // Match the listStories order: published_at desc, NULLS LAST,
        // id asc tie-breaker (the old localeCompare put nulls first).
        if (a.published_at == null && b.published_at == null)
          return (a.id ?? "").localeCompare(b.id ?? "");
        if (a.published_at == null) return 1;
        if (b.published_at == null) return -1;
        return (
          b.published_at.localeCompare(a.published_at) ||
          (a.id ?? "").localeCompare(b.id ?? "")
        );
      });
      const graph = [
        breadcrumbList([
          ["Home", "https://golponeer.com/"],
          [`${tag.bn} · ${tag.en}`, canonical],
        ]),
      ];
      const books = await booksFor(stories);
      if (books.length > 0) graph.push(itemList(books));
      jsonLd = { "@context": "https://schema.org", "@graph": graph };
    } else {
      // Taxonomy-drift safety net (see the genre branch above).
      found = true;
      canonical = `https://golponeer.com/tags/${encPath(String(params.slug).trim().toLowerCase())}`;
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

// Named exports for scripts/check-taxonomy-parity.mjs (CI guard): the
// taxonomy tables above are hand-synced copies of src/lib/ — the parity
// script imports them to prove they still match. Vercel only uses the
// default handler export; these add nothing to the served response.
export { GENRES, TAXONOMY_META, SUBCATEGORIES, SUBCATEGORY_GROUPS, TAG_PAGES };
