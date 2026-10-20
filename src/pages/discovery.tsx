import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { ButtonLink, EmptyState, Spinner } from "../components/ui";
import { StoryCard, StoryRow } from "../components/story-card";
import type { StoryLanguage } from "../lib/types";

function useStories(filters: import("../lib/data-provider").StoryFilters) {
  const { dp } = useApp();
  return useQuery({
    queryKey: ["stories", filters],
    queryFn: () => dp.listStories(filters),
  });
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
  const { t, dp } = useApp();
  const [params, setParams] = useSearchParams();
  const language = (params.get("language") || "") as StoryLanguage | "";
  const genre = params.get("genre") || "";
  const sort = (params.get("sort") || "newest") as "newest" | "popular" | "most_viewed";
  const q = params.get("q") || "";

  const genresQuery = useQuery({ queryKey: ["genres"], queryFn: () => dp.listGenres() });
  const genres = genresQuery.data?.length ? genresQuery.data : GENRE_FALLBACK;

  const filters = {
    language: (language || undefined) as StoryLanguage | undefined,
    genre: genre || undefined,
    q: q || undefined,
    sort,
    limit: 24,
  };
  const { data, isLoading } = useStories(filters);

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
          {genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select aria-label={t("discover", "sort")} className={selectCls} value={sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="newest">{t("discover", "newest")}</option>
          <option value="popular">{t("discover", "popular")}</option>
          <option value="most_viewed">{t("discover", "mostViewed")}</option>
        </select>
      </div>

      <div className="mt-6">
        {isLoading ? <Spinner /> : data && data.stories.length ? (
          <>
            <p className="mb-4 text-sm text-ink-faint">
              {data.total} {t("discover", "resultsFor")}{q ? ` “${q}”` : ""}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.stories.map((s) => <StoryRow key={s.id} story={s} />)}
            </div>
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
  const { dp } = useApp();
  const { data, isLoading } = useQuery({
    queryKey: ["stories", { q }],
    queryFn: () => dp.listStories({ q, limit: 24 }),
    enabled: q.trim().length > 0,
  });

  return (
    <Layout>
      <h1 className="mt-6 font-serif text-3xl font-bold">
        {t("nav", "search")}{q ? `: “${q}”` : ""}
      </h1>
      <div className="mt-6">
        {!q.trim() ? (
          <EmptyState title={t("discover", "searchPlaceholder")} />
        ) : isLoading ? <Spinner /> : data && data.stories.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.stories.map((s) => <StoryRow key={s.id} story={s} />)}
          </div>
        ) : (
          <EmptyState title={t("discover", "noResults")} />
        )}
      </div>
    </Layout>
  );
}
