// Handler tests for api/og-story.js (Phase 3 prerender).
// Calls the handler directly in Node with mock req/res, against the LIVE
// Supabase project and the LIVE shell (dist/index.html must be the live
// shell with bake tags — swap it in before running, swap back after).
// Env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY must be set.
// Run: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/test-og-story-prerender.mjs
import handler from "../api/og-story.js";

const GB = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const FB = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${name}`);
  }
}

function call(query, ua, headers = {}) {
  return new Promise((resolve) => {
    const req = { query, headers: { "user-agent": ua, ...headers } };
    const res = {
      statusCode: 200,
      headers: {},
      body: "",
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      status(c) {
        this.statusCode = c;
        return this;
      },
      redirect(c, loc) {
        this.statusCode = c;
        this.headers.location = loc;
        resolve(this);
      },
      send(b) {
        this.body = b;
        resolve(this);
      },
    };
    handler(req, res).catch((e) => {
      res.statusCode = 500;
      res.body = String(e?.stack || e);
      resolve(res);
    });
  });
}

async function main() {
  // 1. Kwaidan, Googlebot — full prerender.
  const kwaidan = await call({ username: "golponeer", slug: "kwaidan" }, GB);
  check("kwaidan GB: 200", kwaidan.statusCode === 200);
  check("kwaidan GB: title", kwaidan.body.includes("<title>Kwaidan — Lafcadio Hearn | GolpoNeer</title>"));
  check("kwaidan GB: h1", kwaidan.body.includes("<h1>Kwaidan</h1>"));
  check("kwaidan GB: summary", kwaidan.body.includes("গল্পের সংক্ষেপ"));
  check("kwaidan GB: author link", kwaidan.body.includes("/authors/golponeer"));
  check("kwaidan GB: ToC (20)", kwaidan.body.includes("সূচিপত্র (20)"));
  check("kwaidan GB: chapter 1 title", kwaidan.body.includes("The Story of Mimi-Nashi-Hōïchi"));
  check("kwaidan GB: chapter link", kwaidan.body.includes("/stories/golponeer/kwaidan/"));
  check("kwaidan GB: minutes ~151", kwaidan.body.includes("~151 মিনিট"));
  check("kwaidan GB: excerpt starts", kwaidan.body.includes("More than seven hundred years ago"));
  check("kwaidan GB: Book JSON-LD", kwaidan.body.includes('"@type":"Book"'));
  check("kwaidan GB: BreadcrumbList", kwaidan.body.includes("BreadcrumbList"));
  check("kwaidan GB: NO bake tags", !kwaidan.body.includes("__BAKED_FEATURED__"));
  check("kwaidan GB: NO preload", !kwaidan.body.includes('rel="preload"'));
  check("kwaidan GB: cache 60s", (kwaidan.headers["cache-control"] || "").includes("max-age=60"));

  // Excerpt length: at most 300 chars + ellipsis, and no full chapter text.
  const excerptMatch = kwaidan.body.match(/ভেতরে এক ঝলক<\/h2><p>অধ্যায় ১ · [^<]*<\/p><p>([^<]*)<\/p>/);
  check("kwaidan GB: excerpt present", !!excerptMatch);
  if (excerptMatch) {
    check("kwaidan GB: excerpt <= 301 chars", excerptMatch[1].length <= 301);
  }

  // All 20 Kwaidan chapter titles present (full list, not just the first 10).
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const chRes = await fetch(
    `${base}/rest/v1/chapters?story_id=eq.675a6032-69d5-47a8-9a2a-5133a5a02728&status=eq.published&order=position.asc&select=title`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const chList = await chRes.json();
  check("kwaidan GB: 20 chapters fetched", chList.length === 20);
  const missing = chList.filter((c) => !kwaidan.body.includes(c.title));
  check("kwaidan GB: all chapter titles in body", missing.length === 0);

  // 2. Speckled Band, Googlebot — header-line skipping in the excerpt.
  const speckled = await call(
    { username: "golponeer", slug: "the-adventure-of-the-speckled-band" },
    GB
  );
  check("speckled GB: 200", speckled.statusCode === 200);
  check("speckled GB: h1", speckled.body.includes("<h1>The Adventure of the Speckled Band</h1>"));
  check("speckled GB: ToC (1)", speckled.body.includes("সূচিপত্র (1)"));
  check("speckled GB: minutes ~45", speckled.body.includes("~45 মিনিট"));
  check("speckled GB: excerpt skips Story: header", !speckled.body.includes("Story: The Adventure"));
  check("speckled GB: excerpt skips Original author header", !speckled.body.includes("Original author: Arthur Conan Doyle"));
  check("speckled GB: Look Inside present", speckled.body.includes("ভেতরে এক ঝলক"));

  // 3. প্রভালয় (Bangla, risad), Googlebot — Bangla excerpt + verse joining.
  const prabaloy = await call({ username: "risad", slug: "আমানতে-খেয়াতরী" }, GB);
  check("prabaloy GB: 200", prabaloy.statusCode === 200);
  check("prabaloy GB: h1", prabaloy.body.includes("<h1>প্রভালয়</h1>"));
  check("prabaloy GB: Bangla badge", prabaloy.body.includes("বাংলা"));
  check("prabaloy GB: minutes ~1", prabaloy.body.includes("~1 মিনিট"));
  check("prabaloy GB: excerpt poem line", prabaloy.body.includes("তুরাগ গাঙের আদি নাই"));

  // 4. Kwaidan, Facebook bot — OG head-only.
  const fb = await call({ username: "golponeer", slug: "kwaidan" }, FB);
  check("kwaidan FB: 200", fb.statusCode === 200);
  check("kwaidan FB: title", fb.body.includes("<title>Kwaidan — Lafcadio Hearn | GolpoNeer</title>"));
  check("kwaidan FB: NO h1", !fb.body.includes("<h1>"));
  check("kwaidan FB: NO ToC", !fb.body.includes("সূচিপত্র"));
  check("kwaidan FB: Book JSON-LD", fb.body.includes('"@type":"Book"'));

  // 5. Kwaidan, browser UA — OG head-only (the real browser never reaches
  // the function; the rewrite only matches bot UAs).
  const browser = await call({ username: "golponeer", slug: "kwaidan" }, BROWSER);
  check("kwaidan browser: 200", browser.statusCode === 200);
  check("kwaidan browser: NO h1", !browser.body.includes("<h1>"));

  // 6. Missing story, Googlebot — 404, generic meta, no title/summary.
  const missingStory = await call({ username: "golponeer", slug: "does-not-exist" }, GB);
  check("missing GB: 404", missingStory.statusCode === 404);
  check("missing GB: generic title", missingStory.body.includes("<title>GolpoNeer</title>"));
  check("missing GB: NO h1", !missingStory.body.includes("<h1>"));

  // 7. Non-routing query params — 301 to the canonical story URL.
  const utm = await call({ username: "golponeer", slug: "kwaidan", utm_source: "google" }, GB);
  check("utm GB: 301", utm.statusCode === 301);
  check(
    "utm GB: location",
    utm.headers.location === "https://golponeer.com/stories/golponeer/kwaidan"
  );
  const fbclid = await call({ username: "golponeer", slug: "kwaidan", fbclid: "abc123" }, FB);
  check("fbclid FB: 301", fbclid.statusCode === 301);
  check(
    "fbclid FB: location",
    fbclid.headers.location === "https://golponeer.com/stories/golponeer/kwaidan"
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
