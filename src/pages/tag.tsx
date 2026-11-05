import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { usePageMeta, useJsonLd } from "../lib/page-meta";
import { Layout } from "../components/layout";
import { ButtonLink, EmptyState, Spinner } from "../components/ui";
import { VerticalShelfList } from "../components/shelf-blocks";
import { SUBCATEGORIES, SUBCATEGORY_BN, subLabel } from "../lib/subcategories";
import { TAXONOMY_METADATA } from "../lib/taxonomy-seo";
import { genreSlug, GENRES } from "../lib/genres";
import type { Story } from "../lib/types";

/** Tag landing pages: one registry entry per tag that gets a page.
 *  Only "classics" and "tagore" are registered for now — the other free
 *  tags are mostly author names, which would duplicate author pages, or
 *  duplicates of genre/sub-category pages. A story matches when it
 *  carries ANY of matchTags. */
export const TAG_PAGES: Record<
  string,
  { bn: string; en: string; matchTags: string[]; description: string }
> = {
  classics: {
    bn: "ক্লাসিক",
    en: "Classic",
    matchTags: ["Classic", "ক্লাসিক"],
    description:
      "ক্লাসিক গল্প ও Classic stories — timeless classic stories on GolpoNeer, free, no account needed.",
  },
  tagore: {
    bn: "রবীন্দ্রনাথ ঠাকুর",
    en: "Tagore",
    matchTags: ["রবীন্দ্রনাথ ঠাকুর"],
    description:
      "রবীন্দ্রনাথ ঠাকুরের গল্প ও Tagore stories — stories by Rabindranath Tagore on GolpoNeer, free, no account needed.",
  },
};

// Fallback meta description, used only when a sub-category has no entry
// in TAXONOMY_METADATA. The live text comes from that object instead.
function subDescription(id: string): string {
  const label = subLabel(id, "en");
  const bn = SUBCATEGORY_BN[id] ?? label;
  return `বাংলা ${bn} গল্প ও English ${label} stories — Bangla ${label} stories and English ${label} stories on GolpoNeer, free, no account needed.`;
}

interface CollectionDef {
  /** Page title without the site suffix. */
  title: string;
  description: string;
  /** Visible subtitle shown under the heading (sub-category pages only;
   *  tag pages leave this unset and show no subtitle). */
  subtitle?: string;
  /** Canonical path. */
  path: string;
  /** Breadcrumb trail: [name, url] pairs after Home. */
  crumbs: [string, string][];
  /** Back link: [label, url]. */
  back: [string, string];
  /** H1 lines: [bangla, english]. */
  heading: [string, string];
  fetchStories: (dp: ReturnType<typeof useApp>["dp"]) => Promise<Story[]>;
}

function CollectionPage({ def, slug }: { def: CollectionDef | null; slug: string }) {
  const { t, dp } = useApp();
  const storiesQuery = useQuery({
    queryKey: ["collection", def?.path ?? slug],
    queryFn: () => def!.fetchStories(dp),
    enabled: !!def,
  });
  const stories = storiesQuery.data ?? [];

  usePageMeta({
    title: def ? `${def.title} | GolpoNeer` : null,
    description: def ? def.description : undefined,
    path: def ? def.path : `/tags/${slug}`,
  });

  // List-page schema, same pattern as genre pages: a breadcrumb trail
  // plus the collection's stories as a list. No script for unknown slugs;
  // no list when the collection has no stories yet.
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
                ...def.crumbs.map(([name, url], i) => ({
                  "@type": "ListItem",
                  position: i + 2,
                  name,
                  item: `https://golponeer.com${url}`,
                })),
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
      <Link to={def ? def.back[1] : "/discover"} className="mt-6 inline-block text-sm font-medium text-river hover:underline">
        ← {def ? def.back[0] : t("nav", "discover")}
      </Link>
      {storiesQuery.isLoading ? (
        <div className="mt-10"><Spinner /></div>
      ) : !def ? (
        <EmptyState title={t("discover", "noResults")} action={<ButtonLink to="/discover">{t("nav", "discover")}</ButtonLink>} />
      ) : (
        <>
          <div className="mb-4 mt-4">
            <h1 className="font-serif text-3xl font-bold">{def.heading[0]} · {def.heading[1]}</h1>
            <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />
            {def.subtitle ? <p className="mt-2 max-w-2xl text-ink-soft">{def.subtitle}</p> : null}
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

/** Sub-category landing page (/subcategories/<id>): every public story
 *  carrying one sub-category, at a shareable URL with its own title and
 *  description, so a search for "detective stories" can land here directly.
 *  Sub-categories with no stories yet render an honest empty state and are
 *  kept out of the sitemap until their first story arrives (same rule as
 *  genre pages). */
export function SubcategoryPage() {
  const { slug = "" } = useParams();
  const { locale } = useApp();
  const id = slug.trim().toLowerCase();
  const sub = SUBCATEGORIES.find((s) => s.id === id);
  const group = sub ? GENRES.find((g) => g.value === sub.group) : undefined;
  const label = sub ? subLabel(sub.id, "en") : id;
  const bn = sub ? (SUBCATEGORY_BN[sub.id] ?? label) : id;
  const seo = sub ? TAXONOMY_METADATA[sub.id] : undefined;
  const def: CollectionDef | null = sub
    ? {
        title: `${bn} · ${label} stories`,
        description: seo?.metaDescriptionBn ?? subDescription(sub.id),
        subtitle: seo?.subtitle[locale],
        path: `/subcategories/${sub.id}`,
        crumbs: group
          ? [
              [`${group.bn} · ${group.en}`, `/genres/${genreSlug(group)}`],
              [`${bn} · ${label}`, `/subcategories/${sub.id}`],
            ]
          : [[`${bn} · ${label}`, `/subcategories/${sub.id}`]],
        back: group
          ? [`${group.bn} · ${group.en}`, `/genres/${genreSlug(group)}`]
          : ["Discover", "/discover"],
        heading: [bn, `${label} stories`],
        fetchStories: async (dp) =>
          (await dp.listStories({ subcategories: [sub.id], limit: 100 })).stories,
      }
    : null;
  return <CollectionPage def={def} slug={slug} />;
}

/** Tag landing page (/tags/<slug>): every public story carrying a
 *  registered tag. "classics" and "tagore" are registered for now (see
 *  TAG_PAGES): classics matches the "Classic" and "ক্লাসিক" tags, 26
 *  stories today with no overlap between the two spellings; tagore
 *  matches the "রবীন্দ্রনাথ ঠাকুর" tag, 6 stories today. Unknown tags
 *  render the empty state and stay out of the sitemap. */
export function TagPage() {
  const { slug = "" } = useParams();
  const key = slug.trim().toLowerCase();
  const tag = TAG_PAGES[key];
  const def: CollectionDef | null = tag
    ? {
        title: `${tag.bn} · ${tag.en} stories`,
        description: tag.description,
        path: `/tags/${key}`,
        crumbs: [[`${tag.bn} · ${tag.en}`, `/tags/${key}`]],
        back: ["Discover", "/discover"],
        heading: [tag.bn, `${tag.en} stories`],
        fetchStories: async (dp) => {
          const merged = new Map<string, Story>();
          for (const match of tag.matchTags) {
            const { stories } = await dp.listStories({ tag: match, limit: 100 });
            for (const s of stories) merged.set(s.id, s);
          }
          return [...merged.values()].sort((a, b) =>
            (b.published_at ?? b.created_at ?? "").localeCompare(
              a.published_at ?? a.created_at ?? ""
            )
          );
        },
      }
    : null;
  return <CollectionPage def={def} slug={slug} />;
}
