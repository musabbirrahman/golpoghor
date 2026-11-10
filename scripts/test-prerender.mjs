/**
 * Live handler tests for api/prerender.js (Phase 1).
 * Run from the repo root with dist/index.html present.
 * Expects dist/index.html to be the LIVE shell (with the homepage
 * bake tags) so the stripping is actually exercised.
 */
import handler from "../api/prerender.js";

const GB = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function mockReq(slug, ua) {
  return { query: { slug }, headers: { "user-agent": ua } };
}
function mockRes() {
  const r = { headers: {}, statusCode: 0, body: "", redirected: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.redirect = (c, u) => { r.statusCode = c; r.redirected = u; return r; };
  return r;
}

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

async function call(slug, ua) {
  const req = mockReq(slug, ua);
  const res = mockRes();
  await handler(req, res);
  return res;
}

// 1. About (Googlebot) — full prerender.
const about = await call("about", GB);
check("about: 200", about.statusCode === 200);
check("about: 1h cache", /s-maxage=3600/.test(about.headers["Cache-Control"] || ""));
check("about: title", about.body.includes("<title>গল্পনীড় সম্পর্কে | GolpoNeer</title>"));
check("about: canonical", about.body.includes('<link rel="canonical" href="https://golponeer.com/about" />'));
check("about: meta description is shell description", about.body.includes("read and publish stories in Bangla and English"));
check("about: h1", about.body.includes("<h1>গল্পনীড় সম্পর্কে</h1>"));
check("about: section heading", about.body.includes("<h2>গল্পের জন্য একটি বাসা</h2>"));
check("about: founder name present", about.body.includes("মুসাব্বির রহমান"));
check("about: founder links to GitHub", about.body.includes('href="https://github.com/musabbirrahman"'));
check("about: FAQ section", about.body.includes("<h2>সাধারণ প্রশ্ন</h2>") && about.body.includes("গল্পনীড় কী?"));
check("about: FAQPage JSON-LD", about.body.includes('"@type":"FAQPage"') && about.body.includes("data-page-jsonld"));
check("about: nav to other pages", about.body.includes('href="https://golponeer.com/terms"'));
check("about: NO bake preload", !about.body.includes('rel="preload"'));
check("about: NO baked featured data", !about.body.includes("__BAKED_FEATURED__"));
check("about: NO homepage featured cover", !about.body.includes("thumb-sm-"));
check("about: shell JS bundle still present", /\/assets\/index-[^"]+\.js/.test(about.body));
check("about: Organization JSON-LD kept", about.body.includes('"@type": "Organization"'));

// 2. Terms (Googlebot) — no FAQ, no FAQPage JSON-LD.
const terms = await call("terms", GB);
check("terms: 200", terms.statusCode === 200);
check("terms: title", terms.body.includes("<title>ব্যবহারের শর্তাবলি | GolpoNeer</title>"));
check("terms: canonical", terms.body.includes('href="https://golponeer.com/terms"'));
check("terms: content", terms.body.includes("<h2>গল্পনীড় কী</h2>"));
check("terms: NO FAQPage JSON-LD", !terms.body.includes("FAQPage"));
check("terms: NO bake tags", !terms.body.includes("__BAKED_FEATURED__") && !terms.body.includes('rel="preload"'));

// 3. Contact (Googlebot) — mailto + Facebook links.
const contact = await call("contact", GB);
check("contact: 200", contact.statusCode === 200);
check("contact: mailto link", contact.body.includes('href="mailto:golponeer.app@gmail.com"'));
check("contact: facebook link", contact.body.includes('href="https://facebook.com/golponeerofficial"'));

// 4. Keepsakes-policy (Googlebot) — slug "keepsakes" maps to /keepsakes-policy.
const keeps = await call("keepsakes", GB);
check("keepsakes: 200", keeps.statusCode === 200);
check("keepsakes: canonical is /keepsakes-policy", keeps.body.includes('href="https://golponeer.com/keepsakes-policy"'));
check("keepsakes: title", keeps.body.includes("<title>কিপসেক নীতি | GolpoNeer</title>"));

// 5. Non-indexer UA — the SPA shell untouched, no-store.
const browser = await call("about", BROWSER);
check("browser UA: 200", browser.statusCode === 200);
check("browser UA: no-store", browser.headers["Cache-Control"] === "no-store");
check("browser UA: shell title (not prerendered)", browser.body.includes("<title>GolpoNeer — গল্পনীড় · A nest for stories, in two languages</title>"));
check("browser UA: NO injected content", !browser.body.includes("<h1>গল্পনীড় সম্পর্কে</h1>"));
check("browser UA: bake tags still in shell (untouched)", browser.body.includes("__BAKED_FEATURED__"));

// 6. Unknown slug — 404.
const bad = await call("nope", GB);
check("unknown slug: 404", bad.statusCode === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
