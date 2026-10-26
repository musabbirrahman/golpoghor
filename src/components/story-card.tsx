import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Story } from "../lib/types";
import { useApp } from "../lib/app-context";
import { genreLabel } from "../lib/genres";
import { formatDate, readingMinutes, timeAgo } from "../lib/utils";
import { LanguageBadge, StatusBadge } from "./ui";

export function storyPath(s: Story): string {
  return `/stories/${s.author?.username ?? "unknown"}/${s.slug}`;
}

export function Cover({ story, className = "", thumb = false }: { story: Story; className?: string; thumb?: boolean }) {
  const { dp } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const backfillFired = useRef(false);
  const retriedThumb = useRef(false);
  const retriedOriginal = useRef(false);
  useEffect(() => {
    let cancelled = false;
    backfillFired.current = false;
    retriedThumb.current = false;
    retriedOriginal.current = false;
    setShowingOriginal(false);
    if (!story.cover_path) {
      setUrl(null);
      return;
    }
    (async () => {
      // Thumbnail first in card mode; any miss falls back to the
      // original, which is also the pre-1A behavior.
      let u: string | null = null;
      if (thumb) u = await dp.coverThumbUrl(story.cover_path).catch(() => null);
      const usedThumb = !!u;
      if (!u) u = await dp.coverUrl(story.cover_path).catch(() => null);
      if (cancelled) return;
      // Phase 1B fix (Argon finding 2): when the thumbnail was missing
      // at mount, the rendered URL is the original — record that, so
      // a later load error retries the original instead of being
      // misidentified as a thumbnail failure.
      setShowingOriginal(thumb && !usedThumb && !!u);
      setUrl(u);
      // Best-effort backfill, fire-and-forget: the provider refuses
      // non-owners and signed-out viewers before any network use, and
      // records attempts so a cover is not retried on every render.
      // Trigger only when the thumbnail itself was missing.
      if (thumb && !usedThumb && !backfillFired.current) {
        backfillFired.current = true;
        dp.ensureCoverThumbnail(story).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [dp, story.cover_path, story.author_id, story.id, thumb]);
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-river-soft font-serif text-5xl text-river ${className}`} aria-hidden>
        {story.language === "bn" ? "গ" : "G"}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={`object-cover ${className}`}
      onError={async () => {
        // Phase 1B: a persisted signed URL can expire or lose its
        // object. Each kind retries at most once (evict + fresh sign)
        // before the existing fallback/placeholder — never a loop.
        const isThumb = thumb && !showingOriginal;
        if (isThumb && !retriedThumb.current) {
          retriedThumb.current = true;
          await dp.invalidateCoverUrl(story.cover_path).catch(() => {});
          const fresh = await dp.coverThumbUrl(story.cover_path).catch(() => null);
          if (fresh) {
            setUrl(fresh);
            return;
          }
          // Fresh thumbnail also missing: fall through to the original.
        }
        if (isThumb) {
          // A signed thumbnail URL can exist while its object does not
          // (or fail to load for any other reason); a failed thumbnail
          // image falls back to the original exactly once — never a loop.
          // (Argon finding 2: setUrl(null) when orig is null, so a
          // failed fallback renders the placeholder, not a broken img.)
          setShowingOriginal(true);
          const orig = await dp.coverUrl(story.cover_path).catch(() => null);
          setUrl(orig);
          if (!backfillFired.current) {
            backfillFired.current = true;
            dp.ensureCoverThumbnail(story).catch(() => {});
          }
          return;
        }
        // Original failed.
        if (!retriedOriginal.current) {
          retriedOriginal.current = true;
          await dp.invalidateCoverUrl(story.cover_path).catch(() => {});
          const fresh = await dp.coverUrl(story.cover_path).catch(() => null);
          if (fresh) {
            setUrl(fresh);
            return;
          }
        }
        setUrl(null);
      }}
    />
  );
}

export function StoryCard({ story, compact = false }: { story: Story; compact?: boolean }) {
  const { t, locale } = useApp();
  // Shared estimate from the story's real published word count (see utils).
  const minutes = readingMinutes(story.word_count ?? 0, story.language);
  return (
    <Link
      to={storyPath(story)}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-card transition-shadow hover:shadow-lift"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-river-soft">
        <Cover story={story} className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" thumb />
        <div className="absolute left-2 top-2 flex gap-1.5">
          <LanguageBadge language={story.language} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className={`font-serif font-semibold leading-snug clamp-2 group-hover:text-river-dark ${compact ? "text-base sm:text-lg" : "text-lg"}`}>
          {story.title}
        </h3>
        <p className={`text-sm ${compact ? "truncate text-ink-soft" : "text-ink-faint"}`}>
          {t("story", "by")} {story.original_author ?? story.author?.display_name}
        </p>
        {!compact && <p className="text-sm text-ink-soft clamp-3">{story.summary}</p>}
        {!compact && (
        <div className="mt-auto flex flex-col gap-1 pt-2 text-xs text-ink-faint">
          <div className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap">
              {story.chapter_count ?? 0}{" "}
              {(story.chapter_count ?? 0) === 1 ? t("story", "chapterSingular") : t("story", "chapters")}
            </span>
            {minutes > 0 && (
              <span className="whitespace-nowrap">· ~{minutes} {t("story", "minRead")}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={story.status} />
            <span className="whitespace-nowrap">
              · {story.published_at ? timeAgo(story.published_at, locale) : formatDate(story.created_at, locale)}
            </span>
          </div>
        </div>
        )}
      </div>
    </Link>
  );
}

export function StoryRow({ story }: { story: Story }) {
  const { t, locale } = useApp();
  const minutes = readingMinutes(story.word_count ?? 0, story.language);
  return (
    <Link
      to={storyPath(story)}
      className="group flex h-full min-w-0 gap-4 overflow-hidden rounded-xl bg-white p-3 shadow-card transition-shadow hover:shadow-lift"
    >
      <Cover story={story} className="h-28 w-20 shrink-0 rounded-lg" thumb />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <LanguageBadge language={story.language} />
          <StatusBadge status={story.status} />
        </div>
        <h3 className="truncate font-serif text-lg font-semibold group-hover:text-river-dark">
          {story.title}
        </h3>
        <p className="text-sm text-ink-faint">
          {t("story", "by")} {story.original_author ?? story.author?.display_name} · {genreLabel(story.genre, locale)}
        </p>
        <p className="text-sm text-ink-soft clamp-2">{story.summary}</p>
        <p className="mt-auto text-xs text-ink-faint">
          {story.chapter_count ?? 0}{" "}
          {(story.chapter_count ?? 0) === 1 ? t("story", "chapterSingular") : t("story", "chapters")}
          {minutes > 0 ? ` · ~${minutes} ${t("story", "minRead")}` : ""}
          {story.published_at ? ` · ${timeAgo(story.published_at, locale)}` : ""}
        </p>
      </div>
    </Link>
  );
}
