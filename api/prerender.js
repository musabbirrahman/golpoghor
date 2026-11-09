/**
 * Phase 1 prerender — stable (legal) pages for search indexers.
 *
 * Serves the full HTML of GolpoNeer's legal pages (/about, /terms,
 * /privacy, /guidelines, /contact, /licence, /keepsakes-policy) to
 * search indexers (googlebot, bingbot, google-inspectiontool) only.
 * Social bots keep the SPA shell (no og handler covers these pages,
 * so nothing changes for them); real users never reach this function
 * (the vercel.json rewrite gates the user-agent).
 *
 * The page content is rendered from the same data the SPA renders
 * (`api/legal-docs.js`, a generated copy of `src/lib/legal-docs.ts`),
 * in Bangla — the SPA's default locale, i.e. what a locale-less
 * visitor (and a crawler running the JS) sees. The shell template is
 * `dist/index.html` (bundled via vercel.json `includeFiles`); the
 * homepage bake tags (the featured-cover preload and the
 * `__BAKED_FEATURED__` script) are stripped, because they belong to
 * the homepage only and must never leak onto another page.
 *
 * What is rendered here mirrors the SPA exactly (see `LegalPage` in
 * `src/pages/legal.tsx`): the page `<title>`, the shell meta
 * description, the canonical, the FAQPage JSON-LD on /about, the
 * founder link on /about, the contact links on /contact, and the
 * body content (headings, paragraphs, FAQ, nav to the other pages).
 * The og:title / og:description and the Organization JSON-LD are
 * left as the shell has them — the SPA does not change them either.
 *
 * Cache: 1 hour + 24-hour SWR (stable pages, per the prerender plan).
 *
 * Kill switch: Vercel deployment rollback. Reverting production to
 * the previous deployment removes this function (and its rewrites)
 * instantly; crawlers then get the SPA shell again, as before.
 * There is no in-function env flag — an env var needs a redeploy to
 * take effect, which is the same operation as a rollback.
 *
 * Fallback: if the shell template cannot be read, a standalone HTML
 * page (content + title + FAQPage JSON-LD, no SPA shell) is served
 * with `no-store`. The fallback is never cached and never an error,
 * so a crawler always gets readable content.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS } from "./legal-docs.js";

const SITE = "https://golponeer.com";

/** The meta description the SPA renders for these pages (usePageMeta
 *  falls back to the shell description when a page passes none). */
const SHELL_DESCRIPTION =
  "GolpoNeer (গল্পনীড়) — read and publish stories in Bangla and English. বাংলা ও ইংরেজিতে গল্প পড়ুন ও প্রকাশ করুন।";

/** Search indexers only. Social bots are deliberately excluded — they
 *  keep the SPA shell, as they do today. */
const INDEXER_UA = /googlebot|bingbot|google-inspectiontool/i;

/** Rewrite slug -> the page's URL path and its key in DOCS. */
const PAGES = {
  about: { path: "/about", doc: "about" },
  terms: { path: "/terms", doc: "terms" },
  privacy: { path: "/privacy", doc: "privacy" },
  guidelines: { path: "/guidelines", doc: "guidelines" },
  contact: { path: "/contact", doc: "contact" },
  licence: { path: "/licence", doc: "licence" },
  keepsakes: { path: "/keepsakes-policy", doc: "keepsakes" },
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** About page only: the founder's name links to his LinkedIn profile,
 *  exactly as the SPA's linkifyFounder does. */
function linkifyFounder(text) {
  return esc(text).replace(
    /(মুসাব্বির রহমান|Musabbir Rahman)/g,
    '<a href="https://www.linkedin.com/in/musabbirrahman" target="_blank" rel="noreferrer">$1</a>',
  );
}

/** Contact page only: the email and Facebook address render as links,
 *  exactly as the SPA's linkifyContact does. */
function linkifyContact(text) {
  return esc(text)
    .replace(
      /(golponeer\.app@gmail\.com)/g,
      '<a href="mailto:$1">$1</a>',
    )
    .replace(
      /(facebook\.com\/golponeerofficial)/g,
      '<a href="https://$1" target="_blank" rel="noreferrer">$1</a>',
    );
}

/** The body content of a legal page, in Bangla (the SPA default),
 *  mirroring LegalPage's render: h1, updated line, sections, FAQ,
 *  and the nav to the other legal pages. */
function renderContent(slug) {
  const doc = DOCS[slug];
  const linkify = slug === "about" ? linkifyFounder : slug === "contact" ? linkifyContact : esc;
  const parts = [];
  parts.push(`<h1>${esc(doc.title.bn)}</h1>`);
  parts.push(`<p>হালনাগাদ: অক্টোবর ২০২৬</p>`);
  for (const section of doc.sections) {
    parts.push(`<section><h2>${esc(section.h.bn)}</h2>`);
    for (const para of section.paras) {
      parts.push(`<p>${linkify(para.bn)}</p>`);
    }
    parts.push(`</section>`);
  }
  if (doc.faq) {
    parts.push(`<section><h2>সাধারণ প্রশ্ন</h2>`);
    for (const f of doc.faq) {
      parts.push(`<div><h3>${esc(f.q.bn)}</h3><p>${esc(f.a.bn)}</p></div>`);
    }
    parts.push(`</section>`);
  }
  const others = Object.keys(DOCS).filter((k) => k !== slug);
  parts.push(
    `<nav>${others
      .map((k) => `<a href="${SITE}${PAGES[k].path}">${esc(DOCS[k].title.bn)}</a>`)
      .join(" · ")}</nav>`,
  );
  return parts.join("\n");
}

/** FAQPage JSON-LD for /about, in Bangla — the same payload the SPA
 *  emits via useJsonLd when the locale is Bangla. */
function faqJsonLd(doc) {
  if (!doc.faq) return null;
  const payload = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: doc.faq.map((f) => ({
      "@type": "Question",
      name: f.q.bn,
      acceptedAnswer: { "@type": "Answer", text: f.a.bn },
    })),
  };
  return `<script type="application/ld+json" data-page-jsonld>${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
}

/** The SPA shell template (dist/index.html), read once and cached.
 *  Returns null when it cannot be found (the standalone fallback
 *  then serves the content without the shell). */
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

/** Strip the homepage-only bake tags from the shell template, so the
 *  featured-cover preload and the baked featured data never leak onto
 *  another page. */
function stripBakeTags(shell) {
  return shell
    .replace(/<link rel="preload"[^>]*>/g, "")
    .replace(/<script>window\.__BAKED_FEATURED__=[\s\S]*?<\/script>/g, "");
}

/** A standalone HTML page (no SPA shell) for the no-shell fallback. */
function standaloneHtml(slug, canonical) {
  const doc = DOCS[slug];
  const title = `${doc.title.bn} | GolpoNeer`;
  const faq = faqJsonLd(doc);
  return (
    `<!doctype html><html lang="bn"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(SHELL_DESCRIPTION)}">` +
    `<link rel="canonical" href="${esc(canonical)}">` +
    (faq ? faq : "") +
    `</head><body>${renderContent(slug)}</body></html>`
  );
}

export default async function handler(req, res) {
  const slug = String(req.query.slug ?? "");
  const page = PAGES[slug];
  if (!page || !DOCS[page.doc]) {
    res.status(404).send("Page not found");
    return;
  }
  const doc = DOCS[page.doc];
  const canonical = `${SITE}${page.path}`;
  const title = `${doc.title.bn} | GolpoNeer`;
  const ua = String(req.headers["user-agent"] ?? "");

  const shell = readShell();

  // Not a search indexer: serve the SPA shell untouched (the app),
  // or redirect to the page when the shell is unavailable.
  if (!INDEXER_UA.test(ua)) {
    if (shell) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(shell);
    } else {
      res.redirect(302, canonical);
    }
    return;
  }

  // Search indexer, no shell available: standalone content, never cached.
  if (!shell) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(standaloneHtml(page.doc, canonical));
    return;
  }

  // Search indexer, shell available: inject the page into the shell.
  let html = stripBakeTags(shell);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(SHELL_DESCRIPTION)}" />`,
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"[^>]*>/,
    `<link rel="canonical" href="${esc(canonical)}" />`,
  );
  const faq = faqJsonLd(doc);
  if (faq) html = html.replace("</head>", `${faq}\n</head>`);
  const content = renderContent(page.doc);
  if (html.includes('<div id="root"></div>')) {
    html = html.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
  } else {
    html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${content}</div>`);
  }

  res.setHeader(
    "Cache-Control",
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
