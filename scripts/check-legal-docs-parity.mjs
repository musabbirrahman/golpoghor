/**
 * Parity check: the legal-page data the prerender serves must match
 * the data the SPA renders.
 *
 * Compares `src/lib/legal-docs.ts` (single source of truth, imported
 * by `src/pages/legal.tsx`) with `api/legal-docs.js` (the generated
 * plain-JS copy, imported by `api/prerender.js`). If they differ, the
 * copy is stale — regenerate it with:
 *
 *   node scripts/generate-legal-docs.mjs
 *
 * Also checks that every legal doc has a prerender route (and every
 * prerender route has a doc), so a new legal page cannot be added
 * without a route — or a route left pointing at a removed doc.
 *
 * Run: `node scripts/check-legal-docs-parity.mjs`
 * CI: wired into `.github/workflows/ci.yml` (after the taxonomy check).
 */
import { DOCS as SRC_DOCS } from "../src/lib/legal-docs.ts";
import { DOCS as API_DOCS } from "../api/legal-docs.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}

const srcKeys = Object.keys(SRC_DOCS);
const apiKeys = Object.keys(API_DOCS);

// 1. Same set of docs.
for (const key of srcKeys) {
  if (!(key in API_DOCS)) fail(`doc "${key}" is in src/lib/legal-docs.ts but missing from api/legal-docs.js`);
}
for (const key of apiKeys) {
  if (!(key in SRC_DOCS)) fail(`doc "${key}" is in api/legal-docs.js but missing from src/lib/legal-docs.ts`);
}

// 2. Same content, doc by doc.
for (const key of srcKeys) {
  if (key in API_DOCS && JSON.stringify(SRC_DOCS[key]) !== JSON.stringify(API_DOCS[key])) {
    fail(`doc "${key}" differs between src/lib/legal-docs.ts and api/legal-docs.js — regenerate with: node scripts/generate-legal-docs.mjs`);
  }
}

// 3. Every doc has a prerender route; every route has a doc.
//    The PAGES map lives in api/prerender.js; extract its doc values.
const prerenderSrc = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "api", "prerender.js"),
  "utf8",
);
const routeDocs = [...prerenderSrc.matchAll(/doc:\s*"([a-z]+)"/g)].map((m) => m[1]);
if (routeDocs.length === 0) {
  fail("Could not find any doc: entries in api/prerender.js PAGES — update this script");
}
for (const key of srcKeys) {
  if (!routeDocs.includes(key)) fail(`doc "${key}" has no route in api/prerender.js PAGES — add one (and a vercel.json rewrite)`);
}
for (const key of routeDocs) {
  if (!srcKeys.includes(key)) fail(`api/prerender.js PAGES routes doc "${key}", which is not in src/lib/legal-docs.ts`);
}

if (failures.length > 0) {
  console.error(`\nLegal-docs parity FAILED (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
  process.exit(1);
}
console.log(
  `Legal-docs parity OK: ${srcKeys.length} docs (${srcKeys.join(", ")}), all matching, all routed.`,
);
