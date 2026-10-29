import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { GENRES, genreLabel, normalizeGenre } from "../lib/genres";
import { SUBCATEGORIES, subLabel } from "../lib/subcategories";
import { readingMinutes, timeAgo } from "../lib/utils";
import { Layout } from "../components/layout";
import { Button, ButtonLink, EmptyState, Spinner } from "../components/ui";
import { Cover, StoryCard, StoryRow, storyPath } from "../components/story-card";
import { ShelfHead, ShelfIcon, ShelfRow, VerticalShelfList } from "../components/shelf-blocks";
import { CARD_TEMPLATES } from "../lib/keepsake-card";
import type { Story, StoryLanguage } from "../lib/types";

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
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold">{title}</h2>
          {action}
        </div>
        <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />
      </div>
      {children}
    </section>
  );
}

export function HomePage() {
  const { t, dp } = useApp();
  const featured = useQuery({ queryKey: ["stories", { featured: true, limit: 4 }], queryFn: () => dp.listFeaturedStories(4) });
  const bn = useQuery({ queryKey: ["stories", { language: "bn", limit: 8 }], queryFn: () => dp.listStories({ language: "bn", limit: 8 }) });
  const en = useQuery({ queryKey: ["stories", { language: "en", limit: 8 }], queryFn: () => dp.listStories({ language: "en", limit: 8 }) });
  // Mixed-language wall below the language-split shelves: newest first
  // across both languages, capped so the homepage never grows forever.
  // View all opens Discover with no filters, i.e. every story on the site.
  const more = useQuery({ queryKey: ["stories", { limit: 12 }], queryFn: () => dp.listStories({ limit: 12 }) });
  const keepsakes = useQuery({ queryKey: ["public-keepsakes"], queryFn: () => dp.listPublicKeepsakes(8) });

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-ink px-6 py-10 text-center text-paper sm:px-12 sm:py-12">
        <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden
          style={{ background: "radial-gradient(ellipse at 30% 20%, #C28A42 0%, transparent 55%), radial-gradient(ellipse at 75% 80%, #285C4B 0%, transparent 50%)" }} />
        <div className="relative">
          <img src="/logo-mark.png" alt="" aria-hidden className="mx-auto mb-3 block h-12 w-auto" />
          <h1 className="mx-auto max-w-2xl font-serif text-3xl font-bold leading-tight sm:text-4xl">
            {t("home", "heroTitle")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-paper/80">{t("home", "heroSub")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/discover" size="lg" variant="gold" className="w-full sm:w-auto">{t("home", "startReading")}</ButtonLink>
            <ButtonLink to="/write" size="lg" variant="secondary" className="w-full sm:w-auto !bg-paper/10 !text-paper hover:!bg-paper/20">
              {t("home", "startWriting")}
            </ButtonLink>
          </div>
        </div>
      </section>

      <Shelf title={t("home", "featured")} action={<Link to="/discover?sort=featured" className="text-sm font-medium text-river hover:underline">{t("home", "viewAll")}</Link>}>
        {featured.isLoading ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {(featured.data ?? []).map((s) => <StoryCard key={s.id} story={s} compact />)}
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
                <Link key={k.id} to={`/k/${k.slug}`} className="block w-56 shrink-0 sm:w-auto">
                  <div className="h-full min-w-0 rounded-xl border p-4 shadow-card" style={{ backgroundColor: tpl.bg, color: tpl.ink, borderColor: tpl.rule }}>
                    <p className="whitespace-pre-line break-words font-serif text-base leading-relaxed">“{excerpt}”</p>
                    <p className="mt-3 truncate text-xs" style={{ color: tpl.ink, opacity: 0.85 }}>
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
              <div key={s.id} className="flex w-36 shrink-0 sm:w-auto"><StoryCard story={s} compact /></div>
            ))}
          </div>
        ) : <EmptyState title={t("discover", "noResults")} />}
      </Shelf>

      <Shelf title={t("home", "recentEn")} action={<Link to="/discover?language=en" className="text-sm font-medium text-river hover:underline">{t("home", "viewAll")}</Link>}>
        {en.isLoading ? <Spinner /> : en.data?.stories.length ? (
          <div className="shelf-scroll flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible lg:gap-6">
            {en.data.stories.map((s) => (
              <div key={s.id} className="flex w-36 shrink-0 sm:w-auto"><StoryCard story={s} compact /></div>
            ))}
          </div>
        ) : <EmptyState title={t("discover", "noResults")} />}
      </Shelf>

      <Shelf title={t("home", "moreStories")} action={<Link to="/discover" className="text-sm font-medium text-river hover:underline">{t("home", "viewAll")}</Link>}>
        {more.isLoading ? <Spinner /> : more.data?.stories.length ? (
          <div className="shelf-scroll flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible lg:gap-6">
            {more.data.stories.map((s) => (
              <div key={s.id} className="flex w-36 shrink-0 sm:w-auto"><StoryCard story={s} compact /></div>
            ))}
          </div>
        ) : <EmptyState title={t("discover", "noResults")} />}
      </Shelf>
    </Layout>
  );
}

const GENRE_FALLBACK = ["general"];

/* Discover shelves v1: motifs are small inline SVGs (no new assets).
   Each shelf's identity is its accent color + motif + tagline; the
   books themselves are never recolored. */
function StarIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}
function CheckSealIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="8.5 12.5 11 15 15.5 9.5" />
    </svg>
  );
}
function PenIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
function ShelfViewAll({ to, label, accent }: { to: string; label: string; accent: string }) {
  return (
    <Link
      to={to}
      onClick={() => document.getElementById("all-stories")?.scrollIntoView({ behavior: "smooth" })}
      className="shrink-0 text-sm font-medium hover:underline"
      style={{ color: accent }}
    >
      {label}
    </Link>
  );
}

/* Horror shelf v2: the full-environment template, made to actually read
   as horror — near-black panel, stronger candlelight + crimson glow,
   big cobweb, bat silhouettes, mist at the base, crimson glow on the
   name, and DARK cards (white cards on the dark panel broke the mood).
   Rows sit in a 2-column grid on desktop so no card stretches the full
   panel width; phones get dark compact cards in a scroll row. */
function HorrorRow({ story, onHover, active }: { story: Story; onHover?: () => void; active?: boolean }) {
  const { t } = useApp();
  return (
    <Link
      to={storyPath(story)}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={`group flex h-full min-w-0 gap-3 p-2.5 sm:p-3${active ? " lg:rounded-xl lg:ring-1 lg:ring-inset lg:ring-gold/70" : ""}`}
    >
      <Cover story={story} className="h-24 w-16 shrink-0 rounded-lg sm:h-28 sm:w-20" thumb />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {story.status === "ongoing" && (
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#F0A35A", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
            {t("discover", "newChapters")}
          </p>
        )}
        <h3 className="font-serif font-semibold clamp-2 text-base sm:text-lg text-white" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
          {story.title}
        </h3>
        <p className="truncate text-sm" style={{ color: "#EDE6DA", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
          {t("story", "by")} {story.original_author ?? story.author?.display_name}
        </p>
        <p className="hidden sm:block lg:hidden"><span className="text-sm clamp-2" style={{ color: "#EDE6DA", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{story.summary}</span></p>
      </div>
    </Link>
  );
}

// Panel art registry: major tag + sub-category worlds. The tag ROW is data-driven:
// the major tag always shows; a sub tag shows only when some story carries it.
const HORROR_ARTS: Record<string, string> = {
  all: "/horror-panel-bg.jpg",
  psychological: "/horror-panel-bg-psychological.jpg",
  gothic: "/horror-panel-bg-gothic.jpg",
};
const HORROR_SUB_ORDER = ["psychological", "gothic"];

function HorrorShelf({ stories }: { stories: Story[] }) {
  const { t, locale } = useApp();
  const [activeTag, setActiveTag] = useState("all");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { trackRef.current?.scrollTo({ left: 0 }); }, [activeTag]);
  const subIds = [...new Set(stories.flatMap((st) => (st.subcategories ?? []).map((s) => s.toLowerCase())))];
  const tagIds = ["all", ...HORROR_SUB_ORDER.filter((id) => subIds.includes(id))];
  const tagLabel = (id: string) => id === "all" ? `#${genreLabel("হরর", locale)}` : `#${id.charAt(0).toUpperCase() + id.slice(1)}`;
  const tagArt = (id: string) => HORROR_ARTS[id] ?? HORROR_ARTS.all;
  const handleStripScroll = () => {
    const el = trackRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 8) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) {
      const idx = tagIds.indexOf(activeTag);
      setActiveTag(tagIds[(idx + 1) % tagIds.length]);
    }
  };
  const visible = activeTag === "all" ? stories : stories.filter((st) => (st.subcategories ?? []).map((s) => s.toLowerCase()).includes(activeTag));
  const pages: Story[][] = [];
  for (let i = 0; i < visible.length; i += 3) pages.push(visible.slice(i, i + 3));
  const detail = visible.find((st) => st.id === hoverId) ?? visible[0];
  const detailMinutes = detail ? readingMinutes(detail.word_count ?? 0, detail.language) : 0;
  const newCount = visible.filter((st) => {
    const d = st.published_at ? new Date(st.published_at).getTime() : NaN;
    return !Number.isNaN(d) && Date.now() - d < 30 * 24 * 3600 * 1000;
  }).length;
  return (
    <section className="mt-12 border-t border-ink/10 pt-10">
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/20 shadow-lift lg:max-w-6xl" style={{ backgroundColor: "#100D0B" }}>
        {tagIds.map((id) => (
          <div key={id} className="pointer-events-none absolute inset-0 transition-opacity duration-500" aria-hidden style={{ backgroundImage: "url(" + tagArt(id) + ")", backgroundSize: "cover", backgroundPosition: "center 20%", opacity: activeTag === id ? 1 : 0 }} />
        ))}
        <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "linear-gradient(to bottom, rgba(16,13,11,0.60) 0%, rgba(16,13,11,0.78) 50%, rgba(16,13,11,0.92) 100%)" }} />
        <div className="relative mx-auto w-full px-4 py-4 sm:px-6 sm:py-6 lg:max-w-6xl">
          <h2 className="sr-only">{genreLabel("হরর", locale)}</h2>
          <div className="lg:flex lg:items-start lg:gap-8">
            {detail && (
              <div className="hidden lg:sticky lg:top-24 lg:block lg:w-[300px] lg:shrink-0 lg:self-start xl:w-[340px]">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-sm">
                  <div className="flex gap-4">
                    <Cover story={detail} className="h-44 w-32 shrink-0 rounded-lg" thumb />
                    <p className="min-w-0 flex-1 text-sm leading-relaxed" style={{ color: "#EDE6DA", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{detail.summary}</p>
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-bold leading-snug text-white" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{detail.title}</h3>
                  <p className="mt-1 truncate text-sm" style={{ color: "#EDE6DA", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
                    {t("story", "by")} {detail.original_author ?? detail.author?.display_name}
                  </p>
                  <p className="mt-3 text-xs" style={{ color: "#D8CFC4", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
                    {detail.chapter_count ?? 0}{" "}
                    {(detail.chapter_count ?? 0) === 1 ? t("story", "chapterSingular") : t("story", "chapters")}
                    {detailMinutes > 0 ? ` · ~${detailMinutes} ${t("story", "minRead")}` : ""}
                    {` · ${detail.status === "ongoing" ? t("story", "ongoing") : t("story", "complete")}`}
                    {` · ${detail.language === "bn" ? t("discover", "bangla") : t("discover", "english")}`}
                    {detail.published_at ? ` · ${timeAgo(detail.published_at, locale)}` : ""}
                  </p>
                  <ButtonLink to={storyPath(detail)} variant="gold" className="mt-4 w-full">
                    {t("story", "startReading")}
                  </ButtonLink>
                </div>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-nowrap gap-x-3 overflow-x-auto text-lg font-bold sm:text-xl">
                {tagIds.map((id) => (
                  <button key={id} type="button" className={`shrink-0${activeTag === id ? " underline underline-offset-4 decoration-2" : ""}`} onClick={() => setActiveTag(id)} aria-pressed={activeTag === id} style={{ color: activeTag === id ? "#F2EDE4" : "#9A8F86" }}>{tagLabel(id)}</button>
                ))}
              </p>
              {newCount > 0 && (
                <p className="mt-2 text-sm font-bold" style={{ color: "#F0A35A" }}>
                  +{newCount} {t("discover", "newLabel")}
                </p>
              )}
              {visible.length === 0 ? (
                <p className="mt-4 text-sm" style={{ color: "#D8CFC4" }}>{t("discover", "noResults")}</p>
              ) : (
                <>
                  <div ref={trackRef} onScroll={handleStripScroll} className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:hidden">
                    {pages.map((page, pi) => (
                      <div key={pi} className="grid w-full shrink-0 snap-start grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                        {page.map((st) => <HorrorRow key={st.id} story={st} onHover={() => setHoverId(st.id)} active={detail?.id === st.id} />)}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 hidden gap-x-6 gap-y-4 lg:grid lg:grid-cols-2">
                    {visible.map((st) => <HorrorRow key={st.id} story={st} onHover={() => setHoverId(st.id)} active={detail?.id === st.id} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Phase 2 filter portal: one button, many options, floating above the
   page (never an in-flow section pushing content down). Each dimension
   is a single pick (All clears it); genre picks either a major or one
   sub — a sub pick clears the major and vice versa, so a pick never
   dead-ends. Empty majors/subs stay hidden (reader panel only); a picked
   value always stays visible so it can be cleared. Sort lives here too,
   not as a separate dropdown. Rendered through a body portal so no
   ancestor transform or clipping can trap it. */
function Pick({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-river bg-river text-paper" : "border-ink/20 bg-white hover:border-river"}`}
    >
      {children}
    </button>
  );
}

/* Phase 2 v3: sub-categories are multi-select — each #tag toggles on
   and off, and the list shows stories carrying ANY selected tag. A tag
   pick clears the major; a major pick clears all tags. Every other pill
   also toggles: tapping an active pick unselects it. */
function FilterDialog({ language, genre, selectedSubs, status, time, sort, genresInUse, subsInUse, set, toggleSub, onClose }: {
  language: string;
  genre: string;
  selectedSubs: string[];
  status: string;
  time: string;
  sort: string;
  genresInUse: string[];
  subsInUse: string[];
  set: (patch: Record<string, string>) => void;
  toggleSub: (id: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useApp();
  const [expanded, setExpanded] = useState<string | null>(() => {
    const found = SUBCATEGORIES.find((s) => selectedSubs.includes(s.id));
    return found ? found.group : null;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const clearAll = () => set({ language: "", genre: "", sub: "", status: "", time: "", new: "", sort: "" });
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button type="button" aria-label={t("discover", "close")} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div role="dialog" aria-modal="true" aria-label={t("discover", "filter")} className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-paper p-5 shadow-lift sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 pb-4">
          <h3 className="font-serif text-xl font-bold">{t("discover", "filter")}</h3>
          <button type="button" onClick={onClose} aria-label={t("discover", "close")} className="text-2xl leading-none text-ink-soft hover:text-ink">×</button>
        </div>
        <div className="mt-5 grid gap-x-6 gap-y-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("discover", "language")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pick active={!language} onClick={() => set({ language: "" })}>{t("discover", "allLanguages")}</Pick>
              <Pick active={language === "bn"} onClick={() => set({ language: language === "bn" ? "" : "bn" })}>{t("discover", "bangla")}</Pick>
              <Pick active={language === "en"} onClick={() => set({ language: language === "en" ? "" : "en" })}>{t("discover", "english")}</Pick>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("discover", "statusLabel")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pick active={!status} onClick={() => set({ status: "" })}>{t("discover", "allOption")}</Pick>
              <Pick active={status === "ongoing"} onClick={() => set({ status: status === "ongoing" ? "" : "ongoing" })}>{t("story", "ongoing")}</Pick>
              <Pick active={status === "complete"} onClick={() => set({ status: status === "complete" ? "" : "complete" })}>{t("story", "complete")}</Pick>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("discover", "readingTime")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pick active={!time} onClick={() => set({ time: "" })}>{t("discover", "allOption")}</Pick>
              <Pick active={time === "under15"} onClick={() => set({ time: time === "under15" ? "" : "under15" })}>{t("discover", "timeUnder15")}</Pick>
              <Pick active={time === "15to45"} onClick={() => set({ time: time === "15to45" ? "" : "15to45" })}>{t("discover", "time15to45")}</Pick>
              <Pick active={time === "over45"} onClick={() => set({ time: time === "over45" ? "" : "over45" })}>{t("discover", "timeOver45")}</Pick>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("discover", "sort")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pick active={sort === "newest"} onClick={() => set({ sort: sort === "newest" ? "" : "newest" })}>{t("discover", "newest")}</Pick>
              <Pick active={sort === "featured"} onClick={() => set({ sort: sort === "featured" ? "" : "featured" })}>{t("discover", "featured")}</Pick>
            </div>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white/60 p-4 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("discover", "genre")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pick active={!genre && selectedSubs.length === 0} onClick={() => set({ genre: "", sub: "" })}>{t("discover", "allGenres")}</Pick>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {GENRES.map((g) => {
                const subs = SUBCATEGORIES.filter((s) => s.group === g.value);
                const groupSubsInUse = subs.filter((s) => subsInUse.includes(s.id));
                const groupVisible = genresInUse.includes(g.value) || groupSubsInUse.length > 0 || genre === g.value || subs.some((s) => selectedSubs.includes(s.id));
                if (!groupVisible) return null;
                const visibleSubs = subs.filter((s) => subsInUse.includes(s.id) || selectedSubs.includes(s.id));
                const isOpen = expanded === g.value;
                return (
                  <div key={g.value}>
                    <div className="flex flex-wrap items-center gap-2">
                      {genresInUse.includes(g.value) || genre === g.value ? (
                        <Pick active={genre === g.value} onClick={() => set({ genre: genre === g.value ? "" : g.value, sub: "" })}>{genreLabel(g.value, locale)}</Pick>
                      ) : (
                        <span className="text-sm font-medium">{genreLabel(g.value, locale)}</span>
                      )}
                      {visibleSubs.length > 0 && (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : g.value)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/20 text-xs text-ink-soft hover:border-river hover:text-river"
                        >
                          {isOpen ? "▴" : "▾"}
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-4">
                        {visibleSubs.map((s) => (
                          <Pick key={s.id} active={selectedSubs.includes(s.id)} onClick={() => toggleSub(s.id)}>#{subLabel(s.id)}</Pick>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-5">
          <Button variant="secondary" onClick={clearAll}>{t("discover", "clearFilters")}</Button>
          <Button onClick={onClose}>{t("discover", "filterDone")}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DiscoverPage() {
  const { t, dp } = useApp();
  const [params, setParams] = useSearchParams();
  const language = (params.get("language") || "") as StoryLanguage | "";
  const genre = params.get("genre") || "";
  const subs = params.getAll("sub");
  const status = params.get("status") || "";
  const time = params.get("time") || "";
  const newOnly = params.get("new") === "1";
  const sort = (params.get("sort") || "newest") as "newest" | "popular" | "most_viewed" | "featured";
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const [filterOpen, setFilterOpen] = useState(false);

  const genresQuery = useQuery({ queryKey: ["genres"], queryFn: () => dp.listGenres() });
  const genresInUse = genresQuery.data?.length ? genresQuery.data : GENRE_FALLBACK;
  const subsQuery = useQuery({ queryKey: ["subcategories-in-use"], queryFn: () => dp.listSubcategoriesInUse() });
  const subsInUse = subsQuery.data ?? [];

  const filters = {
    language: (language || undefined) as StoryLanguage | undefined,
    genre: genre || undefined,
    subcategories: subs.length ? subs : undefined,
    status: (status || undefined) as "ongoing" | "complete" | undefined,
    time: (time || undefined) as "under15" | "15to45" | "over45" | undefined,
    newOnly: newOnly || undefined,
    q: q || undefined,
    tag: tag || undefined,
    sort,
  };
  const activeFilterCount = [language, genre || subs.length, status, time, newOnly].filter(Boolean).length;
  // Phase 2 rework: any active filter hides the shelves, so the page
  // shows only the filtered results. Featured sort hides them too: its
  // list is a subset (the picks only), not the whole library — while
  // Newest sort shows everything, so the shelves stay for it.
  const hasActiveFilter = Boolean(language || genre || subs.length || status || time || tag || newOnly);
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

  // Multi-tag toggle: tapping a selected tag removes just that one;
  // tapping an unselected tag adds it (and clears the major).
  const toggleSub = (id: string) => {
    const next = new URLSearchParams(params);
    const current = next.getAll("sub");
    next.delete("sub");
    const kept = current.filter((v) => v !== id);
    if (kept.length === current.length) kept.push(id);
    kept.forEach((v) => next.append("sub", v));
    next.delete("genre");
    setParams(next);
  };

  // Discover shelves v1: rule shelves from fields that already exist.
  // One base fetch (newest first, limit 50) feeds every derived shelf
  // client-side, so no provider or migration change is needed. Every
  // shelf hides when empty — no shelf ever shows an empty box.
  const featuredQuery = useQuery({ queryKey: ["stories", { featured: true, limit: 8 }], queryFn: () => dp.listFeaturedStories(8) });
  const shelfBaseQuery = useQuery({ queryKey: ["stories", { shelfBase: true, limit: 50 }], queryFn: () => dp.listStories({ limit: 50 }) });
  const curatedQuery = useQuery({ queryKey: ["curated-shelves"], queryFn: () => dp.listCuratedShelves() });
  const shelfBase = shelfBaseQuery.data?.stories ?? [];
  const featured = featuredQuery.data ?? [];
  const curated = curatedQuery.data ?? [];
  const newest = shelfBase.slice(0, 8);
  const complete = shelfBase.filter((s) => s.status === "complete").slice(0, 8);
  const ongoing = shelfBase.filter((s) => s.status === "ongoing").slice(0, 8);
  const quick = shelfBase.filter((s) => {
    const m = readingMinutes(s.word_count ?? 0, s.language);
    return m > 0 && m <= 15;
  }).slice(0, 8);
  const classics = shelfBase.filter((s) => s.language === "bn" && s.pd_verified).slice(0, 8);
  const horror = shelfBase.filter((s) => normalizeGenre(s.genre) === "হরর").slice(0, 8);
  const shelvesLoading = featuredQuery.isLoading || shelfBaseQuery.isLoading || curatedQuery.isLoading;

  return (
    <Layout>
      {/* Vault entrance — hidden on phones (it ate ~170px before any
          shelf); the title stays as a screen-reader-only heading so the
          page keeps its outline. */}
      <h1 className="sr-only sm:hidden">{t("discover", "title")}</h1>
      <section className="relative mt-6 hidden overflow-hidden rounded-2xl bg-ink px-6 py-6 text-center text-paper sm:block sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          aria-hidden
          style={{ background: "radial-gradient(ellipse at 30% 20%, #C28A42 0%, transparent 55%), radial-gradient(ellipse at 75% 80%, #285C4B 0%, transparent 50%)" }}
        />
        <div className="relative">
          <h1 className="font-serif text-3xl font-bold sm:text-4xl">{t("discover", "title")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-paper/80">{t("discover", "vaultTagline")}</p>
        </div>
      </section>

      {/* Filter row stays at the top, above the shelves, so nobody has
          to scroll down to find it. */}
      <div className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((v) => !v)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm font-medium hover:border-river"
        >
          {t("discover", "filter")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        {(activeFilterCount > 0 || sort !== "newest") && (
          <button
            type="button"
            onClick={() => set({ language: "", genre: "", sub: "", status: "", time: "", new: "", sort: "" })}
            className="text-sm font-medium text-river hover:underline"
          >
            {t("discover", "clearFilters")}
          </button>
        )}
      </div>
      {filterOpen && (
        <FilterDialog
          language={language}
          genre={genre}
          selectedSubs={subs}
          status={status}
          time={time}
          sort={sort}
          genresInUse={genresInUse}
          subsInUse={subsInUse}
          set={set}
          toggleSub={toggleSub}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {/* Shelves — View all exists only where the list has a matching
          filter. Phase 2 added status + reading-time filters, so
          Complete, Ongoing, and Quick gained View all; Classics still
          has none (no classics filter exists). Shelves hide entirely
          while any filter is active (Phase 2 rework). */}
      {!hasActiveFilter && sort !== "featured" && (shelvesLoading ? <div className="mt-10"><Spinner /></div> : (
        <>
          {newest.length > 0 && (
            <section className="mt-8 border-t border-ink/10 pt-6 sm:mt-12 sm:pt-10">
              <ShelfHead icon={<SparkIcon />} name={t("discover", "shelfNew")} tagline={t("discover", "tagNew")} accent="#285C4B" action={<ShelfViewAll to="/discover?new=1" label={t("home", "viewAll")} accent="#285C4B" />} />
              <ShelfRow stories={newest} />
            </section>
          )}
          {featured.length > 0 && (
            <section className="mt-12 border-t border-ink/10 pt-10">
              <ShelfHead icon={<StarIcon />} name={t("discover", "featured")} tagline={t("discover", "tagFeatured")} accent="#C28A42" action={<ShelfViewAll to="/discover?sort=featured" label={t("home", "viewAll")} accent="#C28A42" />} />
              <ShelfRow stories={featured} />
            </section>
          )}
          {horror.length > 0 && <HorrorShelf stories={horror} />}
          {complete.length > 0 && (
            <section className="mt-12 border-t border-ink/10 pt-10">
              <ShelfHead icon={<CheckSealIcon />} name={t("discover", "shelfComplete")} tagline={t("discover", "tagComplete")} accent="#A85745" action={<ShelfViewAll to="/discover?status=complete" label={t("home", "viewAll")} accent="#A85745" />} />
              <ShelfRow stories={complete} />
            </section>
          )}
          {ongoing.length > 0 && (
            <section className="mt-12 border-t border-ink/10 pt-10">
              <ShelfHead icon={<PenIcon />} name={t("story", "ongoing")} tagline={t("discover", "tagOngoing")} accent="#3A6EA5" action={<ShelfViewAll to="/discover?status=ongoing" label={t("home", "viewAll")} accent="#3A6EA5" />} />
              <ShelfRow stories={ongoing} />
            </section>
          )}
          {quick.length > 0 && (
            <section className="mt-12 border-t border-ink/10 pt-10">
              <ShelfHead icon={<BoltIcon />} name={t("discover", "shelfQuick")} tagline={t("discover", "tagQuick")} accent="#6D5BD0" action={<ShelfViewAll to="/discover?time=under15" label={t("home", "viewAll")} accent="#6D5BD0" />} />
              <ShelfRow stories={quick} />
            </section>
          )}
          {classics.length > 0 && (
            <section className="mt-12 border-t border-ink/10 pt-10">
              <ShelfHead icon={<BookIcon />} name={t("footer", "classicsBn")} tagline={t("discover", "tagClassics")} accent="#8C6A3C" />
              <VerticalShelfList stories={classics} />
            </section>
          )}
          {/* Phase 3b curated shelves: moderator-picked, in shelf order, after
              the rule shelves. Empty shelves never render. */}
          {curated.filter((s) => s.stories.length > 0).map((shelf) => (
            <section key={shelf.id} className="mt-12 border-t border-ink/10 pt-10">
              <ShelfHead icon={<ShelfIcon />} name={shelf.name} tagline={shelf.tagline ?? undefined} accent="#C28A42" action={<Link to={`/shelves/${shelf.slug}`} className="shrink-0 text-sm font-medium text-gold hover:underline">{t("home", "viewAll")}</Link>} />
              {shelf.layout === "vertical" ? (
                <VerticalShelfList stories={shelf.stories} />
              ) : (
                <ShelfRow stories={shelf.stories} />
              )}
            </section>
          ))}
        </>
      ))}

      {/* All stories list — controls live in the top filter row now;
          the portal holds every option including sort. When the shelves
          are hidden it is the first block after the filter row, so it
          takes the same tighter phone spacing as the first shelf. */}
      <section id="all-stories" className={hasActiveFilter || sort === "featured" ? "mt-8 border-t border-ink/10 pt-6 sm:mt-12 sm:pt-10 scroll-mt-24" : "mt-12 border-t border-ink/10 pt-10 scroll-mt-24"}>
        <h2 className="font-serif text-2xl font-bold">{t("story", "allStories")}</h2>

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
      </section>
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
