/**
 * Regenerates `api/legal-docs.js` (the plain-JS copy of the legal-page
 * data) from the single source of truth, `src/lib/legal-docs.ts`.
 *
 * Run: `node scripts/generate-legal-docs.mjs`
 * Check: `node scripts/check-legal-docs-parity.mjs` (also run in CI) —
 * it fails if the generated copy has drifted from the source.
 *
 * The prerender function (`api/prerender.js`) imports the generated
 * copy because Vercel's api/ functions must not depend on importing
 * TypeScript out of `src/`; the copy keeps that boundary clean.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DOCS } from "../src/lib/legal-docs.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(repoRoot, "api", "legal-docs.js");

const header = `/**
 * GENERATED — do not edit by hand.
 * Plain-JS copy of the legal-page data in \`src/lib/legal-docs.ts\`,
 * produced by \`scripts/generate-legal-docs.mjs\`. Edit the source file
 * only, regenerate this copy, and let the parity check
 * (\`npm run check-legal-docs\`, run in CI) catch any drift.
 *
 * The prerender function (\`api/prerender.js\`) imports this copy
 * because Vercel's api/ functions must not import TypeScript out of
 * \`src/\`; the copy keeps that boundary clean.
 */
`;

writeFileSync(outPath, header + `export const DOCS = ${JSON.stringify(DOCS, null, 2)};\n`);
console.log(`Wrote ${outPath} (${Object.keys(DOCS).length} docs).`);
