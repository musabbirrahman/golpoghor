import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { genreLabel } from "../lib/genres";
import { Layout } from "../components/layout";
import { Button, ButtonLink, EmptyState, Spinner } from "../components/ui";
import { StoryCard, StoryRow } from "../components/story-card";
import { CARD_TEMPLATES } from "../lib/keepsake-card";
import type { StoryLanguage } from "../lib/types";

const PAGE_SIZE = 24;

/** Paged story list (V4-09): "Load more" over the provider's offset support,
 *  so results never silently stop at the first page. */
function useStoryPages(filters: import("../lib/data-provider").StoryFilters, enabled = true) {
  const { dp } = useApp();
  return useInfiniteQuery({
    queryKey: ["stories", "paged", filters],
    queryFn: ({ pageParam }) => dp.listStories({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((a, p) => a + p.stories.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled,
  });
}

function LoadMore({ hasNextPage, isFetching, onClick, label }: { hasNextPage?: boolean; isFetching: boolean; onClick: () => void; label: string }) {
  if (!hasNextPage) return null;
  return (
    <div className="mt-8 text-center">
      <Button variant="secondary" onClick={onClick} disabled={isFetching}>
        {label}
      </Button>
    </div>
  );
}

function Shelf({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function HomePage() {
  const { t, dp } = useApp();
  const featured = useQuery({ queryKey: ["stories", { sort: "popular", limit: 4 }], queryFn: () => dp.listStories({ sort: "popular", limit: 4 }) });
  const bn = useQuery({ queryKey: ["stories", { language: "bn", limit: 8 }], queryFn: () => dp.listStories({ language: "bn", limit: 8 }) });
  const en = useQuery({ queryKey: ["stories", { language: "en", limit: 8 }], queryFn: () => dp.listStories({ language: "en", limit: 8 }) });
  const keepsakes = useQuery({ queryKey: ["public-keepsakes"], queryFn: () => dp.listPublicKeepsakes() });

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-ink px-6 py-14 text-center text-paper sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden
          style={{ background: "radial-gradient(ellipse at 30% 20%, #C28A42 0%, transparent 55%), radial-gradient(ellipse at 75% 80%, #285C4B 0%, transparent 50%)" }} />
        <div className="relative">
          <p className="mb-3 font-serif text-5xl text-gold" aria-hidden>❦</p>
          <h1 className="mx-auto max-w-2xl font-serif text-4xl font-bold leading-tight sm:text-5xl">
            {t("home", "heroTitle")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-paper/80">{t("home", "heroSub")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/discover" size="lg" variant="gold">{t("home", "startReading")}</ButtonLink>
            <ButtonLink to="/write" size="lg" variant="secondary" className="!bg-paper/10 !text-paper hover:!bg-paper/20">
              {t("home", "startWriting")}
            </ButtonLink>
          </div>
        </div>
      </section>

      <Shelf title={t("home", "featured")} action={<Link to="/discover?sort=popular" className="text-sm font-medium text-river hover:underline">{t("home", "viewAll")}</Link>}>
        {featured.isLoading ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {(featured.data?.stories ?? []).map((s) => <StoryCard key={s.id} story={s} />)}
          </div>
        )}
      </Shelf>

      {/* Public keepsakes strip — hidden entirely until something is
          public, so it never shows an empty box on the home page. */}
      {!!keepsakes.data?.length && (
        <Shelf title={t("keepsakes", "shelfTitle")} action={<Link to="/keepsakes" className="text-sm font-medium text-river hover:underline">{t("home", "viewAll")}</Link>}>
          <div className="shelf-scroll flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible lg:gap-6">
            {keepsakes.data.slice(0, 8).map((k) => {
              const tpl = CARD_TEMPLATES[k.template];
              const excerpt = k.excerpt.length > 120 ? k.excerpt.slice(0, 120).trimEnd() + "…" : k.excerpt;
              return (
                <Link key={k.id} to={`/k/${k.slug}`} className="block w-64 shrink-0 sm:w-auto">
                  <div className="min-w-0 rounded-xl p-4 shadow-card" style={{ backgroundColor: tpl.bg, color: tpl.ink }}>
                    <p aria-hidden className="font-serif text-lg leading-none" style={{ color: tpl.accent }}>❦</p>
                    <p className="mt-2 whitespace-pre-line break-words font-serif text-base leading-relaxed">“{excerpt}”</p>
                    <p className="mt-3 truncate text-xs" style={{ color: tpl.faint }}>
                      {t("keepsakes", "keptBy")} {k.keeper_name}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Shelf>
      )}

      <Shelf title={t("home", "recentBn")} action={<Link to="/discover?language=bn" className="text-sm font-medium text-river hover:underline">{t("home", "viewAll")}</Link>}>
        {bn.isLoading ? <Spinner /> : bn.data?.stories.length ? (
          <div className="shelf-scroll flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible lg:gap-6">
            {bn.data.stories.map((s) => (
              <div key={s.id} className="flex w-40 shrink-0 sm:w-auto"><StoryCard story={s} /></div>
            ))}
          </div>
        ) : <EmptyState title={t("discover", "noResults")} />}
      </Shelf>

      <Shelf title={t("home", "recentEn")} action={<Link to="/discover?language=en" className="text-sm font-medium text-river hover:underline">{t("home", "viewAll")}</Link>}>
        {en.isLoading ? <Spinner /> : en.data?.stories.length ? (
          <div className="shelf-scroll flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible lg:gap-6">
            {en.data.stories.map((s) => (
              <div key={s.id} className="flex w-40 shrink-0 sm:w-auto"><StoryCard story={s} /></div>
            ))}
          </div>
        ) : <EmptyState title={t("discover", "noResults")} />}
      </Shelf>
    </Layout>
  );
}

const GENRE_FALLBACK = ["general"];

export function DiscoverPage() {
  const { t, dp, locale } = useApp();
  const [params, setParams] = useSearchParams();
  const language = (params.get("language") || "") as StoryLanguage | "";
  const genre = params.get("genre") || "";
  const sort = (params.get("sort") || "newest") as "newest" | "popular" | "most_viewed";
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";

  const genresQuery = useQuery({ queryKey: ["genres"], queryFn: () => dp.listGenres() });
  const genres = genresQuery.data?.length ? genresQuery.data : GENRE_FALLBACK;

  const filters = {
    language: (language || undefined) as StoryLanguage | undefined,
    genre: genre || undefined,
    q: q || undefined,
    tag: tag || undefined,
    sort,
  };
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useStoryPages(filters);
  const stories = data?.pages.flatMap((p) => p.stories) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  const selectCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-river focus:outline-none";

  return (
    <Layout>
      <h1 className="mt-6 font-serif text-3xl font-bold">{t("discover", "title")}</h1>

      <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
        <select aria-label={t("discover", "language")} className={selectCls} value={language} onChange={(e) => set({ language: e.target.value })}>
          <option value="">{t("discover", "allLanguages")}</option>
          <option value="bn">{t("discover", "bangla")}</option>
          <option value="en">{t("discover", "english")}</option>
        </select>
        <select aria-label={t("discover", "genre")} className={selectCls} value={genre} onChange={(e) => set({ genre: e.target.value })}>
          <option value="">{t("discover", "allGenres")}</option>
          {genres.map((g) => <option key={g} value={g}>{genreLabel(g, locale)}</option>)}
        </select>
        <select aria-label={t("discover", "sort")} className={selectCls} value={sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="newest">{t("discover", "newest")}</option>
          <option value="popular">{t("discover", "popular")}</option>
          <option value="most_viewed">{t("discover", "mostViewed")}</option>
        </select>
      </div>

      {tag && (
        <div className="mt-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-sm font-medium text-ink">
            {t("discover", "tagLabel")}: #{tag}
            <button
              type="button"
              onClick={() => set({ tag: "" })}
              aria-label={t("discover", "clearTag")}
              title={t("discover", "clearTag")}
              className="text-base font-bold leading-none text-ink-soft hover:text-ink"
            >
              ×
            </button>
          </span>
        </div>
      )}

      <div className="mt-6">
        {isLoading ? <Spinner /> : stories.length ? (
          <>
            <p className="mb-4 text-sm text-ink-faint">
              {total} {t("discover", "resultsFor")}{q ? ` “${q}”` : ""}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stories.map((s) => <StoryRow key={s.id} story={s} />)}
            </div>
            <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onClick={() => fetchNextPage()} label={t("discover", "loadMore")} />
          </>
        ) : (
          <EmptyState title={t("discover", "noResults")} />
        )}
      </div>
    </Layout>
  );
}

export function SearchPage() {
  const { t } = useApp();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useStoryPages({ q }, q.trim().length > 0);
  const stories = data?.pages.flatMap((p) => p.stories) ?? [];

  return (
    <Layout>
      <h1 className="mt-6 font-serif text-3xl font-bold">
        {t("nav", "search")}{q ? `: “${q}”` : ""}
      </h1>
      <div className="mt-6">
        {!q.trim() ? (
          <EmptyState title={t("discover", "searchPlaceholder")} />
        ) : isLoading ? <Spinner /> : stories.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stories.map((s) => <StoryRow key={s.id} story={s} />)}
            </div>
            <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onClick={() => fetchNextPage()} label={t("discover", "loadMore")} />
          </>
        ) : (
          <EmptyState title={t("discover", "noResults")} />
        )}
      </div>
    </Layout>
  );
}
