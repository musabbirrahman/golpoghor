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
// shell). Same pattern as api/prerender.js (Phase 1).
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


// Visible subtitles for genre + subcategory pages — mirror of
// src/lib/taxonomy-seo.ts (TAXONOMY_METADATA[key].subtitle.bn). The
// prerender shows the Bangla subtitle, the SPA's default locale.
// Kept in sync by scripts/check-taxonomy-parity.mjs (it compares these
// against the subtitle.bn values in src/lib/taxonomy-seo.ts).
const TAXONOMY_SUBTITLES = {
  "general": "আমাদের চারপাশের চেনা মানুষ, বাস্তব অভিজ্ঞতা এবং জীবনধর্মী বাংলা গল্প।",
  "human-nature": "মানুষের বিচিত্র মনস্তত্ত্ব, নৈতিক দ্বন্দ্ব এবং মানবচরিত্রের গভীর রূপের গল্প।",
  "twist-irony": "ভাগ্যের নির্মম পরিহাস এবং শেষ মুহূর্তে চমকে দেওয়া অপ্রত্যাশিত মোড়ের গল্প।",
  "everyday-life": "রোজকার চেনা রুটিন, ছোট ছোট সুখ-দুঃখ এবং সাধারণ মানুষের দৈনন্দিন জীবনের গল্প।",
  "short-story": "স্বল্প পরিসরে জীবনের গভীর অনুভূতি ও টুকরো মুহূর্তের বাংলা ছোটগল্প।",
  "village-life": "বাংলার মাটি ও মানুষ, নদীর বাঁক এবং সহজ-সরল গ্রামীণ জীবনের অনবদ্য গল্প।",
  "relationships": "পরিবার, বন্ধুত্ব এবং মানুষের পারস্পরিক সম্পর্কের জটিলতা ও মায়ার গল্প।",
  "childhood": "ফেলে আসা দুরন্ত দিন, শৈশবের স্মৃতি এবং নিষ্পাপ আনন্দ-বেদনার গল্প।",
  "contemporary": "আজকের প্রজন্মের জীবনযাত্রা, আধুনিক সমাজ এবং সমসাময়িক সময়ের বাংলা গল্প।",
  "coming-of-age": "কৈশোর থেকে যৌবনের রূপান্তর, আত্মোপলব্ধি এবং জীবনের পথে বেড়ে ওঠার গল্প।",
  "romance": "হৃদয়ের টানাপোড়েন, ভালোবাসার অনুভূতি এবং আবেগঘন বাংলা রোমান্টিক গল্প।",
  "warm-romance": "মন ভালো করে দেওয়া অনুভূতি, নিষ্পাপ ভালোবাসা এবং হৃদয়ছোঁয়া মিষ্টি প্রেমের গল্প।",
  "tragic-romance": "অপূর্ণ ভালোবাসা, বিচ্ছেদের দহন এবং চোখ ভিজিয়ে দেওয়া বিয়োগান্তক প্রেমের কাহিনী।",
  "mystery": "রুদ্ধশ্বাস রহস্য, অজানা সংকেত এবং চমকে দেওয়া বাংলা রহস্য গল্পের দুনিয়া।",
  "detective": "বুদ্ধিদীপ্ত তদন্ত, অপরাধের জট খোলা এবং রোমাঞ্চকর বাংলা গোয়েন্দা গল্পের সম্ভার।",
  "supernatural": "যুক্তির বাইরের ঘটনা, অশরীরী রহস্য এবং অলৌকিক জগতের শিহরণ জাগানো গল্প।",
  "thriller": "টানটান উত্তেজনা, স্নায়ুক্ষয়ী সাসপেন্স এবং শেষ পৃষ্ঠা পর্যন্ত আটকে রাখার মতো গল্প।",
  "adventure": "অজানার উদ্দেশ্যে যাত্রা, দুর্গম পথের হাতছানি এবং রোমাঞ্চকর অভিযানের কাহিনী।",
  "fantasy": "জাদুর রাজ্য, কাল্পনিক জগৎ এবং বাস্তবতার সীমানা ছাড়ানো বাংলা ফ্যান্টাসি গল্প।",
  "epic": "বিশাল কাল্পনিক জগৎ, শুভ-অশুভের মহাযুদ্ধ এবং মহাকাব্যিক আখ্যান।",
  "urban": "আধুনিক শহরের পরিচিত অলিগলিতে লুকিয়ে থাকা জাদু ও অতিপ্রাকৃত শক্তির গল্প।",
  "dark": "অন্ধকার জাদু, ভয়াবহ কল্পলোক এবং রহস্যে ঘেরা তমসাচ্ছন্ন ফ্যান্টাসি গল্প।",
  "science-fiction": "ভবিষ্যতের পৃথিবী, মহাকাশের অজানা রহস্য এবং বিজ্ঞানের বিস্ময়কর কল্পকাহিনী।",
  "horror": "গা ছমছমে পরিবেশ, অজানা ভয় এবং হাড় হিম করা বাংলা হরর ও ভৌতিক গল্প।",
  "psychological": "মনের অন্ধকার কোণ, ভ্রম এবং স্নায়ুচাপ বাড়িয়ে দেওয়া মনস্তাত্ত্বিক গল্প।",
  "gothic": "প্রাচীন প্রাসাদ, অভিশপ্ত অতীত এবং বিষণ্ণ ও রহস্যময় পরিবেশের গথিক কাহিনী।",
  "history": "অতীতের ফেলে আসা দিন, রাজ-রাজড়ার কাহিনী এবং ইতিহাসের পটভূমিতে লেখা গল্প।",
  "war-conflict": "রণক্ষেত্রের উত্তাপ, টিকে থাকার লড়াই এবং যুদ্ধ ও সংঘাতের মানবিক গল্প।",
  "freedom-struggle": "দেশপ্রেম, আত্মত্যাগ এবং শেকল ভাঙার লড়াই নিয়ে লেখা স্বাধীনতা সংগ্রামের গল্প।",
  "poetry": "ছন্দ, উপমা এবং হৃদয়ের গভীরতম অনুভূতির প্রকাশ নিয়ে বাংলা কবিতার আসর।",
  "lyric": "কবির ব্যক্তিগত আবেগ, প্রেম ও প্রকৃতির সুরেলা অনুভূতি নিয়ে লেখা গীতিকবিতা।",
  "narrative": "ছন্দের তালে গাথা পূর্ণাঙ্গ গল্প, ঐতিহাসিক ঘটনা এবং আখ্যানমূলক বাংলা কবিতা।",
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

  // Cover paths are always <story-author-uuid>/<safe filename> (see the
  // covers bucket). Only that shape is trusted — the same strict regex
  // as COVER_PATH_RE in api/sitemap.js — so a crafted cover_path can
  // never inject a foreign host or a ../ traversal into a prerendered
  // <img>. Anything else renders without an image.
  const COVER_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;
  function coverThumbUrl(cp) {
    if (!cp || !COVER_PATH_RE.test(cp)) return null;
    const [uid, file] = cp.split("/");
    return `${base}/storage/v1/object/public/cover-thumbs/${encodeURIComponent(uid)}/thumb-${encodeURIComponent(file)}`;
  }

  const siteTitle = "GolpoNeer";
  const siteDesc = "GolpoNeer — a nest for stories. Read and share Bangla and English stories.";
  const cover = "https://golponeer.com/og-cover.jpg";

  // Per-kind story-list fetchers (public stories only, newest first,
  // mirroring the SPA listStories default order of published_at desc).
  // Author identity for the prerendered story list: the username (for
  // the story URL) and the display name (what the SPA shows on cards).
  // Classics show original_author instead (see renderStoryItem).
  // Memoized: booksFor (JSON-LD) and renderStoryList (the body) request
  // the same authors, so the profile fetch runs once per render.
  let authorMapMemo = { key: "", value: null };
  async function authorMap(ids) {
    const uniq = [...new Set((ids ?? []).filter(Boolean))];
    if (!uniq.length) return new Map();
    const key = uniq.slice().sort().join(",");
    if (authorMapMemo.key === key && authorMapMemo.value) return authorMapMemo.value;
    const rows = await get(
      `profiles?id=in.(${uniq.map((x) => encodeURIComponent(x)).join(",")})&select=id,username,display_name`
    );
    const value = new Map(
      (rows ?? []).map((r) => [r.id, { username: r.username, display_name: r.display_name }])
    );
    authorMapMemo = { key, value };
    return value;
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
      `stories?${where}&status=in.(ongoing,complete)&order=published_at.desc.nullslast,id.asc&limit=${limit}&select=id,title,slug,author_id,published_at,origin_type,original_author,translator_name,summary,genre,tags,subcategories,status,language,cover_path,chapters!inner(id)&chapters.status=eq.published&chapters.limit=1`
    );
    return rows ?? [];
  }

  async function booksFor(stories) {
    const authors = await authorMap(stories.map((r) => r.author_id));
    return stories
      .filter((r) => authors.get(r.author_id)?.username)
      .map((r) => bookItem(r.title, authors.get(r.author_id).username, r.slug));
  }

  let found = false;
  let jsonLd = null;
  let title = siteTitle;
  let desc = siteDesc;
  let canonical = "https://golponeer.com/";
  let image = cover;
  let ogType = "website";
  // Prerender data (Phase 2): the fetched public stories + the per-kind
  // page pieces, set by the branch that served the request. Only set
  // when the stories were actually fetched — the drift safety-net
  // branches (generic meta, no stories) leave these null, so a search
  // indexer gets the OG head-only response instead of a body it cannot
  // build.
  let pageStories = null;
  let pageData = null;

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
        `stories?author_id=eq.${encodeURIComponent(profile.id)}&status=in.(ongoing,complete)&order=published_at.desc.nullslast,id.asc&select=id,title,slug,genre,author_id,published_at,origin_type,original_author,translator_name,summary,tags,subcategories,status,language,cover_path,chapters!inner(id)&chapters.status=eq.published&chapters.limit=1&limit=50`
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
      pageStories = stories;
      pageData = { kind: "author", profile, avatarUrl, isAuthor };
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
      pageStories = stories;
      pageData = { kind: "genre", def, subtitle: TAXONOMY_SUBTITLES[genreSlug(def)] };
    } else {
      // Taxonomy-drift safety net: a genre the SPA knows but this file
      // does not (see the parity check) must not 404 a live page.
      // Generic meta + 200; the parity check is the primary guard.
      found = true;
      canonical = `https://golponeer.com/genres/${encPath(String(params.slug).trim().toLowerCase())}`;
    }
  } else if (kind === "shelf" && params.slug) {
    const shelves = await get(
      `shelves?slug=eq.${encodeURIComponent(params.slug)}&select=id,slug,name,tagline,layout`
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
          `stories?id=in.(${idSet.map((x) => encodeURIComponent(x)).join(",")})&status=in.(ongoing,complete)&select=id,title,slug,author_id,published_at,origin_type,original_author,translator_name,summary,genre,tags,subcategories,status,language,cover_path,chapters!inner(id)&chapters.status=eq.published&chapters.limit=1`
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
      pageStories = stories;
      pageData = { kind: "shelf", shelf };
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
      pageStories = stories;
      pageData = { kind: "subcategory", sub, subtitle: TAXONOMY_SUBTITLES[sub.id] };
    } else {
      // Taxonomy-drift safety net (see the genre branch above).
      found = true;
      canonical = `https://golponeer.com/subcategories/${encPath(String(params.slug).trim().toLowerCase())}`;
    }
  } else if (kind === "tag" && params.slug) {
    // Guard the lookup with Object.hasOwn: TAG_PAGES is a plain object,
    // so a direct index with a prototype key ("constructor", "__proto__")
    // would resolve to a truthy Object.prototype member and crash at
    // `tag.matchTags` (HTTP 500). With the guard, prototype keys fall
    // through to the drift safety net below.
    const tagKey = String(params.slug).trim().toLowerCase();
    const tag = Object.hasOwn(TAG_PAGES, tagKey) ? TAG_PAGES[tagKey] : undefined;
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
      pageStories = stories;
      pageData = { kind: "tag", tag };
    } else {
      // Taxonomy-drift safety net (see the genre branch above).
      found = true;
      canonical = `https://golponeer.com/tags/${encPath(String(params.slug).trim().toLowerCase())}`;
    }
  }

  // ---- Phase 2 prerender body (search indexers only) ----
  // The story list, mirroring the SPA's VerticalShelfList (genre,
  // subcategory, tag, author, vertical shelf) and the compact StoryCard
  // grid (horizontal shelf). Rendered in Bangla (the SPA default).
  // Chapter counts and reading minutes are NOT rendered — they come
  // from the story_counts RPC, not the stories table, and they are UI
  // metadata, not the page's indexable content. The identifying content
  // (title, author, summary, cover, link) is all present.

  const STATUS_BN = { ongoing: "চলমান", complete: "সমাপ্ত" };

  function renderStoryItem(story, authors, compact) {
    const author = authors.get(story.author_id);
    if (!author?.username) return "";
    const url = `https://golponeer.com/stories/${encPath(author.username)}/${encPath(story.slug)}`;
    // Author line: the vertical list shows the uploader's display name;
    // the compact card shows the original author for classics. Match
    // each component exactly.
    const by = compact
      ? story.original_author || author.display_name || author.username
      : author.display_name || author.username;
    const img = coverThumbUrl(story.cover_path);
    const tagItems = [
      ...((story.subcategories ?? [])
        .map((id) => {
          const sub = SUBCATEGORIES.find((s) => s.id === id);
          return sub ? `#${sub.bn}` : null;
        })
        .filter(Boolean)),
      ...((story.tags ?? []).map((t) => `#${t}`)),
    ];
    const shown = tagItems.slice(0, 4);
    const rest = tagItems.length - shown.length;
    const status = STATUS_BN[story.status] ?? story.status;
    const cover = img ? `<a href="${esc(url)}"><img src="${esc(img)}" alt="" loading="lazy"></a>` : "";
    const titleLink = `<h3><a href="${esc(url)}">${esc(story.title)}</a></h3>`;
    if (compact) {
      return `<article>${cover}${titleLink}<p>${esc(by)}</p></article>`;
    }
    return `<article>${cover}${shown.length > 0 ? `<p>${shown.map(esc).join(" ")}${rest > 0 ? ` +${rest}` : ""}</p>` : ""}${titleLink}<p>${esc(by)}</p>${story.summary ? `<p>${esc(story.summary)}</p>` : ""}<p>${esc(status)}</p></article>`;
  }

  async function renderStoryList(stories, compact) {
    const authors = await authorMap(stories.map((r) => r.author_id));
    return stories
      .map((s) => renderStoryItem(s, authors, compact))
      .filter(Boolean)
      .join("\n");
  }

  // The page body for the prerender, per kind — mirroring the SPA page
  // (heading, subtitle, pills, profile/shelf header, story list).
  async function renderPageBody() {
    const parts = [];
    if (pageData.kind === "author") {
      const { profile, avatarUrl } = pageData;
      const display = profile.display_name || profile.username;
      if (avatarUrl) parts.push(`<img src="${esc(avatarUrl)}" alt="${esc(display)}">`);
      parts.push(`<h1>${esc(display)}</h1>`);
      if (profile.bio) parts.push(`<p>${esc(profile.bio)}</p>`);
      parts.push(await renderStoryList(pageStories, false));
    } else if (pageData.kind === "genre") {
      const { def, subtitle } = pageData;
      parts.push(`<h1>${esc(def.bn)} · ${esc(def.en)}</h1>`);
      if (subtitle) parts.push(`<p>${esc(subtitle)}</p>`);
      // Sub-category pills: the sub-categories this genre's stories
      // actually carry, in SUBCATEGORIES order (as in GenrePage).
      const order = new Map(SUBCATEGORIES.map((s, i) => [s.id, i]));
      const present = [...new Set(pageStories.flatMap((s) => s.subcategories ?? []))]
        .filter((id) => order.has(id))
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      if (present.length > 0) {
        parts.push(
          `<nav>${present
            .map((id) => {
              const sub = SUBCATEGORIES.find((s) => s.id === id);
              return `<a href="https://golponeer.com/subcategories/${encPath(id)}">${esc(sub.bn)}</a>`;
            })
            .join(" · ")}</nav>`
        );
      }
      parts.push(await renderStoryList(pageStories, false));
    } else if (pageData.kind === "shelf") {
      const { shelf } = pageData;
      parts.push(`<h1>${esc(shelf.name)}</h1>`);
      if (shelf.tagline) parts.push(`<p>${esc(shelf.tagline)}</p>`);
      const compact = shelf.layout !== "vertical";
      const list = await renderStoryList(pageStories, compact);
      parts.push(compact ? `<div>${list}</div>` : list);
    } else if (pageData.kind === "subcategory") {
      const { sub, subtitle } = pageData;
      parts.push(`<h1>${esc(sub.bn)} · ${esc(sub.label)} stories</h1>`);
      if (subtitle) parts.push(`<p>${esc(subtitle)}</p>`);
      parts.push(await renderStoryList(pageStories, false));
    } else if (pageData.kind === "tag") {
      const { tag } = pageData;
      parts.push(`<h1>${esc(tag.bn)} · ${esc(tag.en)} stories</h1>`);
      parts.push(await renderStoryList(pageStories, false));
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

  // Search indexer with a fully-fetched list page: full HTML (shell +
  // body), same 60-second cache as the OG response — revoked content
  // stops being served within ~1-2 minutes.
  if (isIndexer && found && pageStories && pageData) {
    const body = await renderPageBody();
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
      `<meta property="og:image" content="${esc(image)}" />`
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

  // Everyone else (social bots, and search indexers on pages whose list
  // could not be fetched): the OG head-only response, unchanged.
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
export { GENRES, TAXONOMY_META, TAXONOMY_SUBTITLES, SUBCATEGORIES, SUBCATEGORY_GROUPS, TAG_PAGES };
