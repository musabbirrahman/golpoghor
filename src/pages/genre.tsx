import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { usePageMeta, useJsonLd } from "../lib/page-meta";
import { Layout } from "../components/layout";
import { ButtonLink, EmptyState, Spinner } from "../components/ui";
import { VerticalShelfList } from "../components/shelf-blocks";
import {
  genreFromSlug,
  genreSlug,
  type GenreDef,
} from "../lib/genres";

/** English plural for a genre def ("Short story" -> "Short stories"). */
function pluralEn(def: GenreDef): string {
  return def.value === "ছোটগল্প" ? "Short stories" : `${def.en} stories`;
}

/** Bilingual meta description. One line covers Bangla-script queries
 *  ("বাংলা হরর গল্প", "হরর গল্প") and Latin queries ("bangla horror
 *  stories", "horror stories"): both phrasings appear verbatim. */
function genreDescription(def: GenreDef): string {
  const plural = pluralEn(def);
  const bnPhrase =
    def.value === "ছোটগল্প" ? `বাংলা ${def.bn}` : `বাংলা ${def.bn} গল্প`;
  return `${bnPhrase} ও English ${plural} — Bangla ${plural} and English ${plural} on GolpoNeer, free, no account needed.`;
}

/** Public genre landing page (/genres/<slug>): every story in one genre,
 *  at a shareable URL with its own title and description, so Google can
 *  show genres in search results. The slug is the English label
 *  ("horror", "short-story"); Bangla values and aliases resolve too.
 *  Genres with no stories yet render an honest empty state and are kept
 *  out of the sitemap until their first story arrives. */
export function GenrePage() {
  const { t, dp } = useApp();
  const { slug = "" } = useParams();
  const def = genreFromSlug(slug);
  const storiesQuery = useQuery({
    queryKey: ["genre", def?.value ?? slug],
    queryFn: () => {
      if (!def) throw new Error("unknown genre");
      return dp.listStories({ genre: def.value, limit: 100 });
    },
    enabled: !!def,
  });
  const stories = storiesQuery.data?.stories ?? [];

  usePageMeta({
    title: def ? `${def.bn} · ${pluralEn(def)} | GolpoNeer` : null,
    description: def ? genreDescription(def) : undefined,
    path: def ? `/genres/${genreSlug(def)}` : `/genres/${slug}`,
  });

  // List-page schema, same pattern as author pages: a breadcrumb trail
  // plus the genre's stories as a list, so search results can associate
  // the works with the genre. No script for unknown slugs; no list when
  // the genre has no stories yet.
  useJsonLd(
    def
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: t("nav", "home"),
                  item: "https://golponeer.com/",
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: `${def.bn} · ${def.en}`,
                  item: `https://golponeer.com/genres/${genreSlug(def)}`,
                },
              ],
            },
            ...(stories.length > 0
              ? [
                  {
                    "@type": "ItemList",
                    itemListElement: stories
                      .filter((s) => s.author?.username)
                      .map((s, i) => ({
                        "@type": "ListItem",
                        position: i + 1,
                        item: {
                          "@type": "Book",
                          name: s.title,
                          url: `https://golponeer.com/stories/${s.author?.username}/${s.slug}`,
                        },
                      })),
                  },
                ]
              : []),
          ],
        })
      : null
  );

  return (
    <Layout>
      <Link to="/discover" className="mt-6 inline-block text-sm font-medium text-river hover:underline">
        ← {t("nav", "discover")}
      </Link>
      {storiesQuery.isLoading ? (
        <div className="mt-10"><Spinner /></div>
      ) : !def ? (
        <EmptyState title={t("discover", "noResults")} action={<ButtonLink to="/discover">{t("nav", "discover")}</ButtonLink>} />
      ) : (
        <>
          <div className="mb-4 mt-4">
            <h1 className="font-serif text-3xl font-bold">{def.bn} · {def.en}</h1>
            <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />
          </div>
          {stories.length === 0 ? (
            <EmptyState title={t("discover", "noResults")} />
          ) : (
            <VerticalShelfList stories={stories} />
          )}
        </>
      )}
    </Layout>
  );
}
