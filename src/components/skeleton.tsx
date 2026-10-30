import { useApp } from "../lib/app-context";

/**
 * Phase 1 skeleton loading (homepage shelves, story hero, keepsake
 * cards). Every box below matches the real element's size and place:
 * same aspect ratios, same text line-heights, same gaps and padding —
 * so content landing replaces the skeleton without moving anything
 * around it. Bars are decorative; the loading announcement itself
 * comes from role="status" on each skeleton root.
 *
 * Where a real element's height genuinely varies (a 1-line vs 2-line
 * title), the skeleton takes the 2-line case: on phones, where most
 * readers are, card titles wrap to two lines at card width, so the
 * common case lands exactly and the rarer case shifts by one line
 * height at most — far less than the old spinner-to-content pop.
 */
function Bar({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-ink/10 ${className}`} />;
}

/** Compact story card: cover + 2-line title + author. Matches
 * StoryCard compact (aspect-[3/4] cover, p-4, gap-1.5, 22px title
 * lines at text-base/leading-snug, 20px author line at text-sm). */
export function StoryCardSkeleton() {
  const { t } = useApp();
  return (
    <div
      role="status"
      aria-label={t("common", "loading")}
      data-skeleton="story-card"
      className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-card"
    >
      <div aria-hidden className="aspect-[3/4] animate-pulse bg-ink/10" />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div aria-hidden>
          <Bar className="h-[22px] w-4/5" />
          <Bar className="h-[22px] w-3/5" />
        </div>
        <Bar className="h-5 w-1/2" />
      </div>
    </div>
  );
}

/** Story page hero: breadcrumb (lg only), mobile band, cover, badges,
 * title, author row, meta strip, desktop buttons. Mirrors the real
 * hero's boxes, including the responsive title heights (28px mobile,
 * 48px sm, 52px md, 56px lg, all leading-tight) and the lg-only
 * breadcrumb — without the breadcrumb bar, it would pop in above
 * the hero on load and shift everything down. */
export function StoryHeroSkeleton() {
  const { t } = useApp();
  return (
    <div role="status" aria-label={t("common", "loading")} data-skeleton="story-hero">
      {/* Breadcrumb row (lg only, like the real nav). */}
      <div className="mt-6 hidden items-center gap-1.5 lg:flex" aria-hidden>
        <div className="h-9 w-9 animate-pulse rounded-full bg-ink/10" />
        <Bar className="h-5 w-16" />
        <Bar className="h-5 w-24" />
        <Bar className="h-5 w-40" />
        <div className="ml-auto hidden h-9 w-9 animate-pulse rounded-full bg-ink/10 xl:hidden" />
      </div>
      {/* Mobile band (lg:hidden, like the real band). */}
      <div className="relative -mx-4 overflow-hidden rounded-b-3xl bg-gradient-to-b from-sage-dark via-sage to-paper lg:hidden" aria-hidden>
        <div className="relative flex items-center justify-between px-4 pt-4">
          <div className="h-9 w-9 animate-pulse rounded-full bg-white/60" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-white/60" />
        </div>
        <div className="relative flex justify-center px-4 pb-6 pt-2">
          <div className="aspect-[3/4] w-48 animate-pulse rounded-xl bg-white/50 sm:w-56" />
        </div>
      </div>
      {/* Hero section. */}
      <section className="mt-4 rounded-2xl bg-white p-5 shadow-card sm:p-8 max-lg:rounded-none max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none" aria-hidden>
        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <div className="mx-auto hidden aspect-[3/4] w-48 animate-pulse rounded-xl bg-ink/10 sm:w-56 lg:mx-0 lg:block lg:w-full" />
          <div className="min-w-0">
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <Bar className="h-6 w-16 rounded-full" />
              <Bar className="h-6 w-20 rounded-full" />
              <Bar className="h-6 w-14 rounded-full" />
            </div>
            <div className="lg:mt-3">
              <Bar className="mx-auto h-[35px] w-3/4 sm:h-[60px] md:h-[65px] lg:mx-0 lg:h-[70px]" />
              <Bar className="mx-auto mt-0 h-[35px] w-1/2 sm:h-[60px] md:h-[65px] lg:mx-0 lg:h-[70px]" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 max-lg:flex-nowrap max-lg:justify-center max-lg:gap-2">
              <div className="h-8 w-8 animate-pulse rounded-full bg-ink/10" />
              <Bar className="h-5 w-32 lg:h-6" />
              <Bar className="h-4 w-20 lg:h-5" />
            </div>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 max-lg:justify-center">
              <Bar className="h-5 w-24" />
              <Bar className="h-5 w-20" />
              <Bar className="h-5 w-28" />
            </div>
            <div className="mt-6 hidden flex-wrap gap-2 lg:flex">
              <Bar className="h-12 w-40 rounded-full" />
              <Bar className="h-12 w-32 rounded-full" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Public keepsake shelf card: quote (3 lines at text-lg/sm:text-xl
 * leading-relaxed) + footer source + keeper lines. Matches the
 * /keepsakes card box (p-5 sm:p-6, mt-5 footer). The real card's
 * template background color varies, so the skeleton stays neutral
 * white — a color change on load, not a layout shift. */
export function KeepsakeCardSkeleton() {
  const { t } = useApp();
  return (
    <div
      role="status"
      aria-label={t("common", "loading")}
      data-skeleton="keepsake-card"
      className="min-w-0 rounded-xl bg-white p-5 shadow-card sm:p-6"
    >
      <div aria-hidden>
        <Bar className="h-[29px] w-full sm:h-8" />
        <Bar className="mt-0 h-[29px] w-full sm:h-8" />
        <Bar className="mt-0 h-[29px] w-2/3 sm:h-8" />
        <div className="mt-5 border-t border-ink/10 pt-3">
          <Bar className="h-5 w-2/3" />
          <Bar className="mt-1 h-4 w-1/3" />
        </div>
      </div>
    </div>
  );
}

/** Homepage keepsake strip card: quote (3 lines at text-base
 * leading-relaxed) + kept-by line, in the strip's w-56 card box. */
export function KeepsakeStripSkeleton() {
  const { t } = useApp();
  return (
    <div
      role="status"
      aria-label={t("common", "loading")}
      data-skeleton="keepsake-strip"
      className="block w-56 shrink-0 sm:w-auto"
    >
      <div aria-hidden className="h-full min-w-0 rounded-xl border bg-white p-4 shadow-card">
        <Bar className="h-[26px] w-full" />
        <Bar className="mt-0 h-[26px] w-full" />
        <Bar className="mt-0 h-[26px] w-2/3" />
        <Bar className="mt-3 h-4 w-1/2" />
      </div>
    </div>
  );
}

/* ---- Phase 2: remaining public surfaces (Discover, Search, Author,
 * story Contents + More by author). Same rule as Phase 1: every box
 * copies the real element's size, gaps and padding. ---- */

/** Shelf section head: icon + title + action + tagline + gold rule.
 * Matches ShelfHead (h2 text-2xl = 32px lines, tagline text-sm = 20px). */
export function ShelfHeadSkeleton() {
  const { t } = useApp();
  return (
    <div role="status" aria-label={t("common", "loading")} data-skeleton="shelf-head" className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="h-6 w-6 animate-pulse rounded-full bg-ink/10" />
          <Bar className="h-8 w-40" />
        </div>
        <Bar className="h-5 w-16" />
      </div>
      <Bar className="mt-1 h-5 w-64" />
      <div className="mt-2 h-0.5 w-10 animate-pulse bg-ink/10" />
    </div>
  );
}

/** Vertical shelf row (VerticalShelfList): cover left, title + author +
 * summary + meta. Matches the row boxes (cover w-24/sm:w-28, title
 * text-lg/sm:text-xl leading-snug, summary clamp-2 text-sm, meta
 * text-xs with badge). Summary included — the common case, since
 * most stories carry one. */
export function ShelfListRowSkeleton() {
  const { t } = useApp();
  return (
    <div
      role="status"
      aria-label={t("common", "loading")}
      data-skeleton="shelf-list-row"
      className="flex gap-4 py-4 first:pt-0 last:pb-0 sm:gap-5 sm:py-5"
    >
      <div aria-hidden className="aspect-[3/4] w-24 shrink-0 animate-pulse rounded-lg bg-ink/10 sm:w-28" />
      <div className="min-w-0 flex-1">
        <div aria-hidden>
          <Bar className="h-[25px] w-4/5 sm:h-[28px]" />
          <Bar className="h-[25px] w-3/5 sm:h-[28px]" />
        </div>
        <Bar className="mt-1 h-5 w-1/2" />
        <div aria-hidden>
          <Bar className="mt-1.5 h-5 w-full" />
          <Bar className="h-5 w-2/3" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2" aria-hidden>
          <Bar className="h-[22px] w-16 rounded-full" />
          <Bar className="h-4 w-20" />
          <Bar className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

/** StoryRow grid card (Discover All Stories, Search): cover + badges +
 * single-line title + byline + 2-line summary + meta. Matches StoryRow
 * (h-28 w-20 cover, p-3, gap-1, title text-lg = 27px, summary clamp-2).
 * Sub-tags omitted — the common case, since most stories carry none. */
export function StoryRowSkeleton() {
  const { t } = useApp();
  return (
    <div
      role="status"
      aria-label={t("common", "loading")}
      data-skeleton="story-row"
      className="flex h-full min-w-0 gap-4 overflow-hidden rounded-xl bg-white p-3 shadow-card"
    >
      <div aria-hidden className="h-28 w-20 shrink-0 animate-pulse rounded-lg bg-ink/10" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2" aria-hidden>
          <Bar className="h-[22px] w-12 rounded-full" />
          <Bar className="h-[22px] w-16 rounded-full" />
        </div>
        <Bar className="h-[27px] w-4/5" />
        <Bar className="h-5 w-3/5" />
        <div aria-hidden>
          <Bar className="h-5 w-full" />
          <Bar className="h-5 w-2/3" />
        </div>
        <Bar className="mt-auto h-4 w-1/2" />
      </div>
    </div>
  );
}

/** Panel row, on the panel's dark shell: light bars on dark, matching
 * PanelRow (cover h-24 w-16/sm:h-28 sm:w-20, title clamp-2 text-base/
 * sm:text-lg, author text-sm, summary only sm–lg). No status role of
 * its own — it only ever renders inside PanelSkeleton's status
 * section, which announces loading once. */
export function PanelRowSkeleton() {
  return (
    <div
      data-skeleton="panel-row"
      className="flex h-full min-w-0 gap-3 p-2.5 sm:p-3"
    >
      <div aria-hidden className="h-24 w-16 shrink-0 animate-pulse rounded-lg bg-white/20 sm:h-28 sm:w-20" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div aria-hidden>
          <Bar className="h-6 w-4/5 !bg-white/20 sm:h-[27px]" />
          <Bar className="h-6 w-3/5 !bg-white/20 sm:h-[27px]" />
        </div>
        <Bar className="h-5 w-1/2 !bg-white/20" />
        <div className="hidden sm:block lg:hidden" aria-hidden>
          <Bar className="h-5 w-full !bg-white/20" />
          <Bar className="h-5 w-2/3 !bg-white/20" />
        </div>
      </div>
    </div>
  );
}

/** Genre panel shell: dark rounded block with tag row, mobile strip and
 * desktop detail pane + grid — the panel's shape without its artwork.
 * The artwork is decorative, so the shell stays neutral dark (bg-ink)
 * and bars read light on it. */
export function PanelSkeleton() {
  const { t } = useApp();
  return (
    <section className="mt-12 border-t border-ink/10 pt-10" role="status" aria-label={t("common", "loading")} data-skeleton="panel">
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/20 bg-ink shadow-lift lg:max-w-6xl">
        <div className="relative mx-auto w-full px-4 py-4 sm:px-6 sm:py-6 lg:max-w-6xl">
          <div className="lg:flex lg:items-start lg:gap-8">
            <div className="hidden lg:sticky lg:top-24 lg:block lg:w-[300px] lg:shrink-0 lg:self-start xl:w-[340px]" aria-hidden>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="flex gap-4">
                  <div className="h-44 w-32 shrink-0 animate-pulse rounded-lg bg-white/20" />
                  <div className="min-w-0 flex-1">
                    <Bar className="h-[32px] w-full !bg-white/20" />
                    <Bar className="h-[32px] w-full !bg-white/20" />
                    <Bar className="h-[32px] w-2/3 !bg-white/20" />
                  </div>
                </div>
                <Bar className="mt-4 h-[28px] w-3/4 !bg-white/20" />
                <Bar className="mt-1 h-5 w-1/2 !bg-white/20" />
                <Bar className="mt-3 h-4 w-2/3 !bg-white/20" />
                <Bar className="mt-4 h-9 w-full rounded-full !bg-white/20" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-nowrap gap-x-3 overflow-x-auto" aria-hidden>
                <Bar className="h-[27px] w-20 shrink-0 !bg-white/20 sm:h-7" />
                <Bar className="h-[27px] w-24 shrink-0 !bg-white/20 sm:h-7" />
                <Bar className="h-[27px] w-16 shrink-0 !bg-white/20 sm:h-7" />
              </div>
              <div className="mt-4 flex gap-4 overflow-x-auto pb-2 lg:hidden" aria-hidden>
                <div className="grid w-full shrink-0 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                  <PanelRowSkeleton />
                  <PanelRowSkeleton />
                  <PanelRowSkeleton />
                </div>
              </div>
              <div className="mt-4 hidden gap-x-6 gap-y-4 lg:grid lg:grid-cols-2" aria-hidden>
                <PanelRowSkeleton />
                <PanelRowSkeleton />
                <PanelRowSkeleton />
                <PanelRowSkeleton />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Contents chapter row: number + title + meta, matching the Contents
 * link row (px-4 py-3.5, number text-lg, title font-bold, meta text-xs).
 * The row lives in the same ol wrapper as the real list, so dividers
 * and the card box carry over. */
export function ChapterRowSkeleton() {
  const { t } = useApp();
  return (
    <li role="status" aria-label={t("common", "loading")} data-skeleton="chapter-row">
      <div className="flex items-center gap-4 px-4 py-3.5" aria-hidden>
        <Bar className="h-7 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <Bar className="h-6 w-3/4" />
          <Bar className="mt-0 h-4 w-1/3" />
        </div>
      </div>
    </li>
  );
}

/** More-by-author sidebar: heading + rule + small rows, matching the
 * story page aside (title clamp-2 text-base leading-snug, w-14 cover,
 * language badge below the title). */
export function MoreByAuthorSkeleton() {
  const { t } = useApp();
  return (
    <aside role="status" aria-label={t("common", "loading")} data-skeleton="more-by-author">
      <Bar className="h-8 w-40" />
      <div className="mt-2 h-0.5 w-10 animate-pulse bg-ink/10" />
      <div className="mt-4 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
            <div className="aspect-[3/4] w-14 shrink-0 animate-pulse rounded-lg bg-ink/10" />
            <div className="min-w-0 flex-1">
              <Bar className="h-[22px] w-4/5" />
              <Bar className="h-[22px] w-3/5" />
              <Bar className="mt-1 h-[22px] w-10 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/** Author profile hero: banner + avatar + name + username + stats pill
 * + tabs + rule. Matches the author page chrome (banner h-32/sm:h-40/
 * lg:h-52, avatar xl, h1 text-3xl/sm:text-4xl, pill px-4 py-2 text-sm).
 * Bio omitted — the no-bio case, matching the author's own profile;
 * bio authors gain those lines below the fold on load. Buttons
 * omitted — guests (the common case for a public profile) see only
 * the pill; signed-in viewers gain the buttons beside it. */
export function AuthorHeroSkeleton() {
  const { t } = useApp();
  return (
    <div role="status" aria-label={t("common", "loading")} data-skeleton="author-hero">
      <div className="-mx-4 bg-gradient-to-b from-sage-dark via-sage to-paper" aria-hidden>
        <div className="h-32 sm:h-40 lg:h-52" />
      </div>
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
        <div className="-mt-14 shrink-0 rounded-full ring-4 ring-gold sm:-mt-[72px] lg:-mt-[88px]" aria-hidden>
          <div className="h-28 w-28 animate-pulse rounded-full bg-ink/10 sm:h-36 sm:w-36 lg:h-44 lg:w-44" />
        </div>
        <div className="min-w-0 flex-1 sm:pb-2" aria-hidden>
          <Bar className="mx-auto h-9 w-56 sm:mx-0 sm:h-10" />
          <Bar className="h-6 w-32" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start" aria-hidden>
        <Bar className="h-9 w-56 rounded-full" />
      </div>
      <div className="mt-8 flex gap-6 overflow-x-auto overflow-y-hidden" aria-hidden>
        <Bar className="h-6 w-20" />
        <Bar className="h-6 w-16" />
        <Bar className="h-6 w-20" />
      </div>
      <div className="h-px bg-ink/10" aria-hidden />
    </div>
  );
}

/** Author story grid card: cover + badges + title + summary + bottom
 * badges. Matches the author page card (cover w-24/sm:w-28, title
 * clamp-2 text-base leading-snug, summary clamp-2 text-sm, p-3). */
export function AuthorStoryCardSkeleton() {
  const { t } = useApp();
  return (
    <div
      role="status"
      aria-label={t("common", "loading")}
      data-skeleton="author-story-card"
      className="block h-full"
    >
      <div aria-hidden className="flex h-full gap-3 rounded-xl bg-white p-3 shadow-card">
        <div className="aspect-[3/4] w-24 shrink-0 animate-pulse rounded-lg bg-ink/10 sm:w-28" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap gap-1.5">
            <Bar className="h-[22px] w-14 rounded-full" />
            <Bar className="h-[22px] w-16 rounded-full" />
          </div>
          <div className="mt-2">
            <Bar className="h-[22px] w-4/5" />
            <Bar className="h-[22px] w-3/5" />
          </div>
          <div className="mt-1">
            <Bar className="h-5 w-full" />
            <Bar className="h-5 w-2/3" />
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
            <Bar className="h-[22px] w-16 rounded-full" />
            <Bar className="h-[22px] w-20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
