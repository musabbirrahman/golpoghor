/**
 * Live handler tests for api/og-page.js (Phase 2 prerender).
 * Run from the repo root with dist/index.html present.
 * Expects dist/index.html to be the LIVE shell (with the homepage
 * bake tags) so the stripping is actually exercised.
 * Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in the environment
 * (the handler fetches the live public API).
 */
import handler from "../api/og-page.js";

const GB = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const FB = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function mockReq(query, ua) {
  return { query, headers: { "user-agent": ua } };
}
function mockRes() {
  const r = { headers: {}, statusCode: 0, body: "" };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

async function call(query, ua) {
  const req = mockReq(query, ua);
  const res = mockRes();
  await handler(req, res);
  return res;
}

// 1. Genre horror, Googlebot — full prerender.
const horror = await call({ kind: "genre", slug: "horror" }, GB);
check("horror GB: 200", horror.statusCode === 200);
check("horror GB: 60s cache", /max-age=60/.test(horror.headers["Cache-Control"] || ""));
check("horror GB: title", horror.body.includes("<title>হরর · Horror stories | GolpoNeer</title>"));
check("horror GB: canonical", horror.body.includes('href="https://golponeer.com/genres/horror"'));
check("horror GB: h1", horror.body.includes("<h1>হরর · Horror</h1>"));
check("horror GB: subtitle", horror.body.includes("গা ছমছমে পরিবেশ"));
check("horror GB: Kwaidan listed", horror.body.includes("Kwaidan"));
check("horror GB: Tell-Tale Heart listed", horror.body.includes("The Tell-Tale Heart"));
check("horror GB: story link", horror.body.includes("/stories/golponeer/kwaidan") || horror.body.includes("/stories/"));
check("horror GB: ItemList JSON-LD", horror.body.includes('"@type":"ItemList"'));
check("horror GB: NO bake tags", !horror.body.includes("__BAKED_FEATURED__") && !horror.body.includes('rel="preload"'));
check("horror GB: shell JS present", /\/assets\/index-[^"]+\.js/.test(horror.body));

// 2. Genre horror, Facebook bot — OG head-only, no story list.
const horrorFB = await call({ kind: "genre", slug: "horror" }, FB);
check("horror FB: 200", horrorFB.statusCode === 200);
check("horror FB: 60s cache", /max-age=60/.test(horrorFB.headers["Cache-Control"] || ""));
check("horror FB: title", horrorFB.body.includes("<title>হরর · Horror stories | GolpoNeer</title>"));
check("horror FB: NO prerender body", !horrorFB.body.includes("<h1>") && !horrorFB.body.includes("<article>") && !horrorFB.body.includes('<div id="root">'));
check("horror FB: has Visit link", horrorFB.body.includes("Visit this page on GolpoNeer"));

// 3. Author golponeer, Googlebot — full prerender.
const author = await call({ kind: "author", username: "golponeer" }, GB);
check("author GB: 200", author.statusCode === 200);
check("author GB: title (isAuthor)", author.body.includes("Author on GolpoNeer"));
check("author GB: h1 display name", author.body.includes("<h1>"));
check("author GB: story list present", author.body.includes("/stories/golponeer/"));
check("author GB: Person JSON-LD", author.body.includes('"@type":"Person"'));
check("author GB: NO bake tags", !author.body.includes("__BAKED_FEATURED__"));

// 4. Author golponeer, browser UA — OG head-only (not the prerender).
const authorBrowser = await call({ kind: "author", username: "golponeer" }, BROWSER);
check("author browser: 200", authorBrowser.statusCode === 200);
check("author browser: NO story list", !authorBrowser.body.includes("<h1>") || !authorBrowser.body.includes("/stories/golponeer/") || authorBrowser.body.includes("Visit this page"));

// 5. Shelf editors-pick, Googlebot — full prerender, shelf order.
const shelf = await call({ kind: "shelf", slug: "editors-pick" }, GB);
check("shelf GB: 200", shelf.statusCode === 200);
check("shelf GB: title", shelf.body.includes(" | GolpoNeer</title>"));
check("shelf GB: story list present", shelf.body.includes("/stories/"));
check("shelf GB: NO bake tags", !shelf.body.includes("__BAKED_FEATURED__"));

// 6. Subcategory detective, Googlebot — full prerender.
// (gothic has no public stories — the only gothic story is the owner's
// unpublished "Testing" draft — so it renders an empty list by design.)
const sub = await call({ kind: "subcategory", slug: "detective" }, GB);
check("subcategory GB: 200", sub.statusCode === 200);
check("subcategory GB: title", sub.body.includes("stories | GolpoNeer</title>"));
check("subcategory GB: h1", sub.body.includes("গোয়েন্দা"));
check("subcategory GB: Speckled Band listed", sub.body.includes("Speckled Band"));
check("subcategory GB: story list present", sub.body.includes("/stories/"));

// 7. Tag classics, Googlebot — full prerender.
const tag = await call({ kind: "tag", slug: "classics" }, GB);
check("tag GB: 200", tag.statusCode === 200);
check("tag GB: title", tag.body.includes("ক্লাসিক"));
check("tag GB: story list present", tag.body.includes("/stories/"));
check("tag GB: NO bake tags", !tag.body.includes("__BAKED_FEATURED__"));

// 8. Unknown genre, Googlebot — drift safety net: OG head-only, generic meta, 200.
const unknownGenre = await call({ kind: "genre", slug: "not-a-genre" }, GB);
check("unknown genre GB: 200", unknownGenre.statusCode === 200);
check("unknown genre GB: NO story list", !unknownGenre.body.includes("<h1>"));
check("unknown genre GB: generic title", unknownGenre.body.includes("<title>GolpoNeer</title>"));

// 9. Unknown author, Googlebot — 404.
const unknownAuthor = await call({ kind: "author", username: "no-such-user" }, GB);
check("unknown author GB: 404", unknownAuthor.statusCode === 404);

// 10. Prototype keys in the tag branch — must NOT crash (Argon Phase 2
// check). /tags/constructor and /tags/__proto__ fall through to the
// drift safety net (generic meta + 200), not an HTTP 500.
const protoCtor = await call({ kind: "tag", slug: "constructor" }, GB);
check("tag constructor GB: 200 (no 500)", protoCtor.statusCode === 200);
check("tag constructor GB: generic title", protoCtor.body.includes("<title>GolpoNeer</title>"));
check("tag constructor GB: NO story list", !protoCtor.body.includes("<h1>"));
const protoProto = await call({ kind: "tag", slug: "__proto__" }, GB);
check("tag __proto__ GB: 200 (no 500)", protoProto.statusCode === 200);
check("tag __proto__ GB: generic title", protoProto.body.includes("<title>GolpoNeer</title>"));
check("tag __proto__ GB: NO story list", !protoProto.body.includes("<h1>"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
