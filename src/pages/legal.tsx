import { Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { usePageMeta, useJsonLd } from "../lib/page-meta";

import { DOCS, EMAIL } from "../lib/legal-docs";

/** Contact page only: the email and Facebook addresses render as links.
 *  Other pages keep them as plain text — their mentions are references,
 *  not calls to write or visit. */
function linkifyContact(text: string) {
  const parts = text.split(new RegExp(`(${EMAIL.replace(".", "\\.")}|facebook\\.com/golponeerofficial)`, "g"));
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part === EMAIL)
      return (
        <a key={i} href={`mailto:${EMAIL}`} className="font-medium text-river hover:underline">
          {part}
        </a>
      );
    if (part === "facebook.com/golponeerofficial")
      return (
        <a key={i} href="https://facebook.com/golponeerofficial" target="_blank" rel="noreferrer" className="font-medium text-river hover:underline">
          {part}
        </a>
      );
    return part;
  });
}

/** About page only: the founder's name links to his portfolio —
 *  LinkedIn gates profile viewing behind a login, so most readers
 *  who click it land on a sign-in page. The portfolio is his own
 *  site, viewable by anyone, and shows his work. LinkedIn stays
 *  linked in the founder JSON-LD sameAs (for search engines).
 *  Other pages keep names as plain text. */
function linkifyFounder(text: string) {
  const parts = text.split(/(মুসাব্বির রহমান|Musabbir Rahman)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part === "মুসাব্বির রহমান" || part === "Musabbir Rahman" ? (
      <a key={i} href="https://musabbirrahman.vercel.app" target="_blank" rel="noreferrer" className="font-medium text-river hover:underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function LegalPage({ slug }: { slug: keyof typeof DOCS }) {
  const { t, locale } = useApp();
  const doc = DOCS[slug];
  usePageMeta({
    title: `${doc.title[locale]} | GolpoNeer`,
    path: slug === "keepsakes" ? "/keepsakes-policy" : `/${slug}`,
  });
  useJsonLd(
    doc.faq
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: doc.faq.map((f) => ({
            "@type": "Question",
            name: f.q[locale],
            acceptedAnswer: { "@type": "Answer", text: f.a[locale] },
          })),
        })
      : null,
  );
  const others = Object.keys(DOCS).filter((k) => k !== slug) as (keyof typeof DOCS)[];
  return (
    <Layout>
      <div className="mx-auto mt-6 max-w-3xl">
        <h1 className="font-serif text-3xl font-bold">{doc.title[locale]}</h1>
        <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />
        <p className="mt-2 text-xs text-ink-faint">
          {locale === "bn" ? "হালনাগাদ: অক্টোবর ২০২৬" : "Updated: October 2026"}
        </p>
        <div className="mt-6 flex flex-col gap-7 rounded-xl bg-white p-6 shadow-card sm:p-8">
          {doc.sections.map((s) => (
            <section key={s.h.en}>
              <h2 className="font-serif text-lg font-bold">{s.h[locale]}</h2>
              {s.paras.map((para) => (
                <p key={para.en.slice(0, 24)} className="mt-2 leading-relaxed text-ink-soft">
                  {slug === "contact"
                    ? linkifyContact(para[locale])
                    : slug === "about"
                      ? linkifyFounder(para[locale])
                      : para[locale]}
                </p>
              ))}
            </section>
          ))}
          {doc.faq && (
            <section>
              <h2 className="font-serif text-lg font-bold">
                {locale === "bn" ? "সাধারণ প্রশ্ন" : "Common questions"}
              </h2>
              {doc.faq.map((f) => (
                <div key={f.q.en} className="mt-4">
                  <h3 className="font-bold">{f.q[locale]}</h3>
                  <p className="mt-1 leading-relaxed text-ink-soft">{f.a[locale]}</p>
                </div>
              ))}
            </section>
          )}
        </div>
        <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-river" aria-label="Legal">
          {others.map((k) => (
            <Link key={k} to={k === "keepsakes" ? "/keepsakes-policy" : `/${k}`} className="hover:underline">
              {DOCS[k].title[locale]}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-xs text-ink-faint">{t("footer", "rights")}</p>
      </div>
    </Layout>
  );
}
