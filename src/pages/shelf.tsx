import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { usePageMeta } from "../lib/page-meta";
import { Layout } from "../components/layout";
import { ButtonLink, EmptyState, Spinner } from "../components/ui";
import { ShelfIcon, VerticalShelfList, shelfAccentHex } from "../components/shelf-blocks";
import { StoryCard } from "../components/story-card";

/** Public shelf page: a curated shelf's full ordered list at a shareable
 *  URL (/shelves/<slug>). Vertical shelves render the cover-left list;
 *  horizontal shelves render a grid (a page, unlike Discover's scroll
 *  strip, earns the room to show every story at once). */
export function ShelfPage() {
  const { t, dp } = useApp();
  const { slug = "" } = useParams();
  const shelfQuery = useQuery({ queryKey: ["shelf", slug], queryFn: () => dp.getShelfBySlug(slug) });
  const shelf = shelfQuery.data ?? null;

  usePageMeta({
    title: shelf ? `${shelf.name} | GolpoNeer` : null,
    description: shelf?.tagline,
    path: `/shelves/${slug}`,
  });

  return (
    <Layout>
      <Link to="/discover" className="mt-6 inline-block text-sm font-medium text-river hover:underline">
        ← {t("nav", "discover")}
      </Link>
      {shelfQuery.isLoading ? (
        <div className="mt-10"><Spinner /></div>
      ) : !shelf ? (
        <EmptyState title={t("moderation", "shelfNotFound")} action={<ButtonLink to="/discover">{t("nav", "discover")}</ButtonLink>} />
      ) : (
        <>
          <div className="mb-4 mt-4">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0" style={{ color: shelfAccentHex(shelf.accent) }}><ShelfIcon /></span>
              <h1 className="font-serif text-3xl font-bold">{shelf.name}</h1>
            </div>
            {shelf.tagline ? <p className="mt-1 text-sm text-ink-soft">{shelf.tagline}</p> : null}
            <div className="mt-2 h-0.5 w-10" style={{ backgroundColor: shelfAccentHex(shelf.accent) }} aria-hidden />
          </div>
          {shelf.stories.length === 0 ? (
            <EmptyState title={t("moderation", "shelfEmpty")} />
          ) : shelf.layout === "vertical" ? (
            <VerticalShelfList stories={shelf.stories} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
              {shelf.stories.map((s) => (
                <StoryCard key={s.id} story={s} compact />
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
