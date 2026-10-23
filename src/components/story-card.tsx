import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Story } from "../lib/types";
import { useApp } from "../lib/app-context";
import { genreLabel } from "../lib/genres";
import { formatDate, readingMinutes, timeAgo } from "../lib/utils";
import { LanguageBadge, StatusBadge } from "./ui";

export function storyPath(s: Story): string {
  return `/stories/${s.author?.username ?? "unknown"}/${s.slug}`;
}

export function Cover({ story, className = "" }: { story: Story; className?: string }) {
  const { dp } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (story.cover_path) {
      dp.coverUrl(story.cover_path)
        .then((u) => { if (!cancelled) setUrl(u); })
        .catch(() => { if (!cancelled) setUrl(null); });
    } else {
      setUrl(null);
    }
    return () => { cancelled = true; };
  }, [dp, story.cover_path]);
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-river-soft font-serif text-5xl text-river ${className}`} aria-hidden>
        {story.language === "bn" ? "গ" : "G"}
      </div>
    );
  }
  return <img src={url} alt="" loading="lazy" className={`object-cover ${className}`} />;
}

export function StoryCard({ story }: { story: Story }) {
  const { t, locale } = useApp();
  // Shared estimate from the story's real published word count (see utils).
  const minutes = readingMinutes(story.word_count ?? 0, story.language);
  return (
    <Link
      to={storyPath(story)}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-card transition-shadow hover:shadow-lift"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-river-soft">
        <Cover story={story} className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" />
        <div className="absolute left-2 top-2 flex gap-1.5">
          <LanguageBadge language={story.language} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-serif text-lg font-semibold leading-snug clamp-2 group-hover:text-river-dark">
          {story.title}
        </h3>
        <p className="text-sm text-ink-faint">
          {t("story", "by")} {story.original_author ?? story.author?.display_name}
        </p>
        <p className="text-sm text-ink-soft clamp-3">{story.summary}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-ink-faint">
          <StatusBadge status={story.status} />
          <span>
            {story.chapter_count ?? 0} {t("story", "chapters")}
          </span>
          {minutes > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>
                ~{minutes} {t("story", "minRead")}
              </span>
            </>
          )}
        </div>
        <p className="text-xs text-ink-faint">
          {story.published_at ? timeAgo(story.published_at, locale) : formatDate(story.created_at, locale)}
        </p>
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
      <Cover story={story} className="h-28 w-20 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <LanguageBadge language={story.language} />
          <StatusBadge status={story.status} />
        </div>
        <h3 className="truncate font-serif text-lg font-semibold group-hover:text-river-dark">
          {story.title}
        </h3>
        <p className="text-sm text-ink-faint">
          {t("story", "by")} {story.author?.display_name} · {genreLabel(story.genre, locale)}
        </p>
        <p className="text-sm text-ink-soft clamp-2">{story.summary}</p>
        <p className="mt-auto text-xs text-ink-faint">
          {story.chapter_count ?? 0} {t("story", "chapters")}
          {minutes > 0 ? ` · ~${minutes} ${t("story", "minRead")}` : ""}
          {story.published_at ? ` · ${timeAgo(story.published_at, locale)}` : ""}
        </p>
      </div>
    </Link>
  );
}
