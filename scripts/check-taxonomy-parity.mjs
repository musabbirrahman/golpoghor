// Taxonomy parity check (Argon prerender checkup, Phase 0).
//
// The bot handlers (api/og-page.js, api/og-story.js, api/sitemap.js) carry
// hand-synced copies of the taxonomy that lives in src/lib/ (genres,
// taxonomy-seo, subcategories) and src/pages/tag.tsx. If a genre,
// subcategory, or tag is added to the SPA without updating the api/
// copies, the bot handler serves a 404 (or generic meta) on a live public
// page. This script fails CI when the two sides diverge, so drift can
// never be deployed. Run: `node scripts/check-taxonomy-parity.mjs`
// (also wired into the CI `check` job).
//
// It imports the src/ tables directly (Node 24 type-strips .ts) and the
// api/ tables via named exports the api/ files expose for this check.
// src/pages/tag.tsx is TSX, so its TAG_PAGES is extracted with a focused
// regex — if that extraction ever fails, the script fails loudly rather
// than silently passing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { GENRES as SRC_GENRES } from "../src/lib/genres.ts";
import { TAXONOMY_METADATA as SRC_META } from "../src/lib/taxonomy-seo.ts";
import {
  SUBCATEGORIES as SRC_SUBS,
  SUBCATEGORY_BN as SRC_SUB_BN,
} from "../src/lib/subcategories.ts";

import {
  GENRES as API_PAGE_GENRES,
  TAXONOMY_META as API_META,
  TAXONOMY_SUBTITLES as API_SUBTITLES,
  SUBCATEGORIES as API_SUBS,
  SUBCATEGORY_GROUPS as API_SUB_GROUPS,
  TAG_PAGES as API_TAG_PAGES,
} from "../api/og-page.js";
import { GENRES as API_STORY_GENRES } from "../api/og-story.js";
import {
  GENRE_SLUGS as API_SITEMAP_SLUGS,
  GENRE_ALIASES as API_SITEMAP_ALIASES,
  SUBCATEGORY_ORDER as API_SITEMAP_SUB_ORDER,
} from "../api/sitemap.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function fail(msg) {
  failures.push(msg);
}
function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}
function diffSets(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    onlyA: [...sa].filter((x) => !sb.has(x)),
    onlyB: [...sb].filter((x) => !sa.has(x)),
  };
}
function genreSlug(en) {
  return en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// --- 1. Genre values -------------------------------------------------
const srcGenreValues = SRC_GENRES.map((g) => g.value);
for (const [name, values] of [
  ["api/og-page.js GENRES", API_PAGE_GENRES.map((g) => g.value)],
  ["api/og-story.js GENRES", API_STORY_GENRES.map((g) => g.value)],
  ["api/sitemap.js GENRE_SLUGS keys", Object.keys(API_SITEMAP_SLUGS)],
]) {
  if (!sameSet(srcGenreValues, values)) {
    const d = diffSets(srcGenreValues, values);
    fail(`Genre values differ (src vs ${name}): only in src: ${d.onlyA.join(", ") || "—"}; only in api: ${d.onlyB.join(", ") || "—"}`);
  }
}

// --- 2. Genre bn / en / aliases --------------------------------------
const srcGenreByValue = new Map(SRC_GENRES.map((g) => [g.value, g]));
for (const g of API_PAGE_GENRES) {
  const src = srcGenreByValue.get(g.value);
  if (!src) continue; // already reported in (1)
  if (src.bn !== g.bn) fail(`Genre ${g.value}: bn differs (src "${src.bn}" vs api/og-page.js "${g.bn}")`);
  if (src.en !== g.en) fail(`Genre ${g.value}: en differs (src "${src.en}" vs api/og-page.js "${g.en}")`);
  if (!sameSet(src.aliases, g.aliases))
    fail(`Genre ${g.value}: aliases differ (src [${src.aliases.join(", ")}] vs api/og-page.js [${g.aliases.join(", ")}])`);
}
for (const g of API_STORY_GENRES) {
  const src = srcGenreByValue.get(g.value);
  if (!src) continue;
  if (src.bn !== g.bn) fail(`Genre ${g.value}: bn differs (src "${src.bn}" vs api/og-story.js "${g.bn}")`);
  if (src.en !== g.en) fail(`Genre ${g.value}: en differs (src "${src.en}" vs api/og-story.js "${g.en}")`);
}

// --- 3. Genre slugs + sitemap aliases ---------------------------------
for (const g of SRC_GENRES) {
  const want = genreSlug(g.en);
  if (API_SITEMAP_SLUGS[g.value] !== want)
    fail(`Genre ${g.value}: sitemap slug is "${API_SITEMAP_SLUGS[g.value]}", expected "${want}" (from src en "${g.en}")`);
}
for (const [alias, value] of Object.entries(API_SITEMAP_ALIASES)) {
  if (!srcGenreByValue.has(value))
    fail(`Sitemap GENRE_ALIASES: "${alias}" maps to unknown genre value "${value}"`);
}
for (const g of SRC_GENRES) {
  for (const a of g.aliases) {
    if (API_SITEMAP_ALIASES[a.toLowerCase()] !== g.value && a.toLowerCase() !== g.value.toLowerCase())
      fail(`Sitemap GENRE_ALIASES: missing alias "${a}" for genre "${g.value}"`);
  }
}

// --- 4. TAXONOMY_META (descriptions) ----------------------------------
const srcMetaKeys = Object.keys(SRC_META);
const apiMetaKeys = Object.keys(API_META);
if (!sameSet(srcMetaKeys, apiMetaKeys)) {
  const d = diffSets(srcMetaKeys, apiMetaKeys);
  fail(`TAXONOMY_META keys differ: only in src/lib/taxonomy-seo.ts: ${d.onlyA.join(", ") || "—"}; only in api/og-page.js: ${d.onlyB.join(", ") || "—"}`);
}
for (const k of srcMetaKeys) {
  if (API_META[k] !== undefined && API_META[k] !== SRC_META[k].metaDescriptionBn)
    fail(`TAXONOMY_META["${k}"]: description differs between src/lib/taxonomy-seo.ts and api/og-page.js`);
}

// --- 4b. TAXONOMY_SUBTITLES (visible Bangla subtitles, Phase 2) ------
const apiSubtitleKeys = Object.keys(API_SUBTITLES);
if (!sameSet(srcMetaKeys, apiSubtitleKeys)) {
  const d = diffSets(srcMetaKeys, apiSubtitleKeys);
  fail(`TAXONOMY_SUBTITLES keys differ: only in src/lib/taxonomy-seo.ts: ${d.onlyA.join(", ") || "—"}; only in api/og-page.js: ${d.onlyB.join(", ") || "—"}`);
}
for (const k of srcMetaKeys) {
  if (API_SUBTITLES[k] !== undefined && API_SUBTITLES[k] !== SRC_META[k].subtitle.bn)
    fail(`TAXONOMY_SUBTITLES["${k}"]: subtitle differs between src/lib/taxonomy-seo.ts and api/og-page.js`);
}

// --- 5. Subcategories --------------------------------------------------
const srcSubIds = SRC_SUBS.map((s) => s.id);
const apiSubIds = API_SUBS.map((s) => s.id);
if (!sameSet(srcSubIds, apiSubIds)) {
  const d = diffSets(srcSubIds, apiSubIds);
  fail(`Subcategory ids differ: only in src: ${d.onlyA.join(", ") || "—"}; only in api/og-page.js: ${d.onlyB.join(", ") || "—"}`);
}
const srcSubById = new Map(SRC_SUBS.map((s) => [s.id, s]));
for (const s of API_SUBS) {
  const src = srcSubById.get(s.id);
  if (!src) continue;
  if (src.label !== s.label) fail(`Subcategory ${s.id}: label differs (src "${src.label}" vs api "${s.label}")`);
  if (SRC_SUB_BN[s.id] !== s.bn) fail(`Subcategory ${s.id}: bn differs (src "${SRC_SUB_BN[s.id]}" vs api "${s.bn}")`);
  if (API_SUB_GROUPS[s.id] !== src.group)
    fail(`Subcategory ${s.id}: group differs (src "${src.group}" vs api SUBCATEGORY_GROUPS "${API_SUB_GROUPS[s.id]}")`);
}
if (!sameSet(srcSubIds, API_SITEMAP_SUB_ORDER)) {
  const d = diffSets(srcSubIds, API_SITEMAP_SUB_ORDER);
  fail(`Sitemap SUBCATEGORY_ORDER ids differ from src: only in src: ${d.onlyA.join(", ") || "—"}; only in sitemap: ${d.onlyB.join(", ") || "—"}`);
}

// --- 6. TAG_PAGES (src/pages/tag.tsx is TSX: extract by regex) -------
const tagSrc = readFileSync(join(ROOT, "src/pages/tag.tsx"), "utf8");
const tagBlock = tagSrc.match(/export const TAG_PAGES[\s\S]*?^};/m);
if (!tagBlock) fail("Could not find TAG_PAGES in src/pages/tag.tsx — update this script");
const srcTagPages = {};
if (tagBlock) {
  const entryRe =
    /(\w+):\s*\{\s*bn:\s*"([^"]+)",\s*en:\s*"([^"]+)",\s*matchTags:\s*\[([^\]]*)\],\s*description:\s*"([^"]*)"/g;
  let m;
  let found = 0;
  while ((m = entryRe.exec(tagBlock[0])) !== null) {
    found++;
    srcTagPages[m[1]] = {
      bn: m[2],
      en: m[3],
      matchTags: [...m[4].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
      description: m[5],
    };
  }
  if (found === 0) fail("Could not parse any TAG_PAGES entries in src/pages/tag.tsx — update this script");
}
const srcTagKeys = Object.keys(srcTagPages);
const apiTagKeys = Object.keys(API_TAG_PAGES);
if (!sameSet(srcTagKeys, apiTagKeys)) {
  const d = diffSets(srcTagKeys, apiTagKeys);
  fail(`TAG_PAGES keys differ: only in src/pages/tag.tsx: ${d.onlyA.join(", ") || "—"}; only in api/og-page.js: ${d.onlyB.join(", ") || "—"}`);
}
for (const k of srcTagKeys) {
  const src = srcTagPages[k];
  const api = API_TAG_PAGES[k];
  if (!api) continue;
  if (!sameSet(src.matchTags, api.matchTags))
    fail(`TAG_PAGES["${k}"]: matchTags differ (src [${src.matchTags.join(", ")}] vs api [${api.matchTags.join(", ")}])`);
  if (src.description !== api.description)
    fail(`TAG_PAGES["${k}"]: description differs between src/pages/tag.tsx and api/og-page.js`);
  if (src.bn !== api.bn) fail(`TAG_PAGES["${k}"]: bn differs (src "${src.bn}" vs api "${api.bn}")`);
  if (src.en !== api.en) fail(`TAG_PAGES["${k}"]: en differs (src "${src.en}" vs api "${api.en}")`);
}

// --- Report ------------------------------------------------------------
if (failures.length > 0) {
  console.error(`Taxonomy parity FAILED (${failures.length} problem${failures.length > 1 ? "s" : ""}):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "Fix the api/ copy (or the src/ source) so the tables match, then re-run."
  );
  process.exit(1);
}
console.log(
  `Taxonomy parity OK: ${srcGenreValues.length} genres, ${srcMetaKeys.length} taxonomy descriptions, ${srcMetaKeys.length} taxonomy subtitles, ${srcSubIds.length} subcategories, ${srcTagKeys.length} tag pages — src/ and api/ agree.`
);
