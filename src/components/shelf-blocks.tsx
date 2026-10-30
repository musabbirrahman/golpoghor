import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { subLabel } from "../lib/subcategories";
import { readingMinutes } from "../lib/utils";
import { StatusBadge } from "./ui";
import { Cover, StoryCard, storyPath } from "./story-card";
import type { Story } from "../lib/types";

/** Shared shelf building blocks: used by Discover and by shelf pages, so a
 *  shelf renders identically in both places. (Moved out of discovery.tsx
 *  when shelf pages landed; no visual change.) */

/** Curated-shelf accent palette: keys are what the database stores, hexes
 *  are what renders. Gold is the default — the look shelves already had —
 *  so rows predating the accent column render unchanged. */
export const SHELF_ACCENTS = [
  { key: "gold", hex: "#C28A42" },
  { key: "river", hex: "#285C4B" },
  { key: "clay", hex: "#A85745" },
  { key: "blue", hex: "#3A6EA5" },
  { key: "purple", hex: "#6D5BD0" },
] as const;

export function shelfAccentHex(accent?: string | null): string {
  return SHELF_ACCENTS.find((a) => a.key === accent)?.hex ?? "#C28A42";
}

export function ShelfIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V5" />
      <path d="M9 19V8" />
      <path d="M14 19V5" />
      <path d="M19 19V10" />
      <path d="M2 19h20" />
    </svg>
  );
}

export function ShelfHead({ icon, name, tagline, accent, action }: { icon: ReactNode; name: string; tagline?: string; accent: string; action?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0" style={{ color: accent }}>{icon}</span>
          <h2 className="font-serif text-2xl font-bold">{name}</h2>
        </div>
        {action}
      </div>
      {tagline ? <p className="mt-1 text-sm text-ink-soft">{tagline}</p> : null}
      <div className="mt-2 h-0.5 w-10" style={{ backgroundColor: accent }} aria-hidden />
    </div>
  );
}

export function ShelfRow({ stories }: { stories: Story[] }) {
  return (
    <div className="shelf-scroll flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible lg:gap-6">
      {stories.map((s) => (
        <div key={s.id} className="flex w-36 shrink-0 sm:w-auto">
          <StoryCard story={s} compact />
        </div>
      ))}
    </div>
  );
}

/* Vertical signature-shelf template (owner-approved 2026-10-29) — the
   §3d reference-1 pattern: cover left, #tags FIRST above the title,
   then author, summary, and a small meta line. Plain rows with
   hairline dividers, no card boxes, so the shelf reads like a list of
   books rather than a strip of covers. */
export function VerticalShelfList({ stories }: { stories: Story[] }) {
  const { t } = useApp();
  return (
    <div className="divide-y divide-ink/10">
      {stories.map((s) => {
        const minutes = readingMinutes(s.word_count ?? 0, s.language);
        const tagItems = [
          ...(s.subcategories ?? []).map((sub) => `#${subLabel(sub)}`),
          ...(s.tags ?? []).map((tag) => `#${tag}`),
        ];
        const shown = tagItems.slice(0, 4);
        const rest = tagItems.length - shown.length;
        return (
          <Link key={s.id} to={storyPath(s)} className="flex gap-4 py-4 first:pt-0 last:pb-0 sm:gap-5 sm:py-5">
            <Cover story={s} className="aspect-[3/4] w-24 shrink-0 rounded-lg sm:w-28" thumb />
            <div className="min-w-0 flex-1">
              {shown.length > 0 && (
                <p className="flex flex-wrap gap-1.5 text-xs font-medium text-gold">
                  {shown.map((tag) => <span key={tag}>{tag}</span>)}
                  {rest > 0 && <span>+{rest}</span>}
                </p>
              )}
              <h3 className="clamp-2 mt-1 font-serif text-lg font-bold leading-snug sm:text-xl">{s.title}</h3>
              <p className="mt-1 truncate text-sm text-ink-soft">{s.author?.display_name}</p>
              {s.summary && <p className="clamp-2 mt-1.5 text-sm text-ink-soft">{s.summary}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <StatusBadge status={s.status} />
                <span>{s.chapter_count} {s.chapter_count === 1 ? t("story", "chapterSingular") : t("story", "chapters")}</span>
                {minutes > 0 && <span>~{minutes} {t("story", "minRead")}</span>}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
