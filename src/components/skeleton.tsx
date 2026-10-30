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
