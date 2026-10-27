import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUsernameRedirect } from "../lib/use-username-redirect";
import { useStorySlugRedirect } from "../lib/use-story-slug-redirect";
import { genreLabel } from "../lib/genres";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Spinner, StatusBadge, LanguageBadge } from "../components/ui";
import { Cover } from "../components/story-card";
import { ReportDialog } from "../components/report-dialog";
import { formatDate, readingMinutes, timeAgo } from "../lib/utils";
import { usePageMeta, useJsonLd, SHELL_TITLE } from "../lib/page-meta";
import type { TiptapNode } from "../lib/types";

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export function StoryPage() {
  const { username = "", slug = "" } = useParams();
  const { t, locale, dp, session } = useApp();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const [summaryHasOverflow, setSummaryHasOverflow] = useState(false);

  const storyQuery = useQuery({
    queryKey: ["story", username, slug],
    queryFn: () => dp.getStoryBySlug(username, slug),
  });
  const story = storyQuery.data;

  const storyAuthorName =
    story?.author?.display_name ?? story?.author?.username;
  usePageMeta({
    title: story
      ? storyAuthorName
        ? `${story.title} — ${storyAuthorName} | GolpoNeer`
        : `${story.title} | GolpoNeer`
      : SHELL_TITLE,
    description: story?.summary,
    path: `/stories/${username}/${slug}`,
  });
  // Book schema: for originals the author is the publishing account (the
  // site byline); for classics/translations/adaptations the author is
  // the original author, with translator when present, and GolpoNeer as
  // publisher either way — matching the attribution shown on the page.
  const isClassic =
    !!story &&
    (story.origin_type ?? "original") !== "original" &&
    !!story.original_author;
  useJsonLd(
    story
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Book",
          name: story.title,
          author: isClassic
            ? { "@type": "Person", name: story.original_author }
            : {
                "@type": "Person",
                name: storyAuthorName,
                url: `https://golponeer.com/authors/${story.author?.username}`,
              },
          ...(story.translator_name
            ? {
                translator: {
                  "@type": "Person",
                  name: story.translator_name,
                },
              }
            : {}),
          inLanguage: story.language,
          url: `https://golponeer.com/stories/${story.author?.username ?? username}/${story.slug}`,
          description: story.summary || undefined,
          genre: story.genre || undefined,
          datePublished: story.published_at || undefined,
          publisher: {
            "@type": "Organization",
            name: "GolpoNeer",
            url: "https://golponeer.com/",
          },
        })
      : null
  );

  const chaptersQuery = useQuery({
    queryKey: ["chapters", story?.id, "published"],
    queryFn: () => dp.listChapters(story!.id, { publishedOnly: true }),
    enabled: !!story,
  });

  const firstChapterQuery = useQuery({
    queryKey: ["chapter", story?.id, "first"],
    queryFn: () => dp.getChapterBySlug(story!.id, chaptersQuery.data![0].slug, { publishedOnly: true }),
    enabled: !!story && (chaptersQuery.data?.length ?? 0) > 0,
  });

  const moreByAuthorQuery = useQuery({
    queryKey: ["stories", { authorId: story?.author_id }, "more"],
    queryFn: async () => {
      const res = await dp.listStories({ authorId: story!.author_id, limit: 4 });
      return res.stories.filter((s) => s.id !== story!.id).slice(0, 3);
    },
    enabled: !!story,
  });

  const isOwner = !!session && !!story && session.user.id === story.author_id;

  // Count the view once per reader per day (provider enforces dedup,
  // no-self-views and public-only; guests are not tracked).
  useEffect(() => {
    if (!story || !session || isOwner) return;
    if (story.status !== "ongoing" && story.status !== "complete") return;
    dp.recordStoryView(story.id)
      .then((counted) => {
        if (counted) queryClient.invalidateQueries({ queryKey: ["story", username, slug] });
      })
      .catch(() => {});
  }, [story?.id, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const progressQuery = useQuery({
    queryKey: ["progress", story?.id],
    queryFn: () => dp.getProgress(story!.id),
    enabled: !!story && !!session,
  });

  const likeQuery = useQuery({
    queryKey: ["like", story?.id],
    queryFn: async () => ({
      liked: await dp.hasLiked(story!.id),
      count: await dp.getLikeCount(story!.id),
    }),
    enabled: !!story,
  });

  const listQuery = useQuery({
    queryKey: ["readingList", "has", story?.id],
    queryFn: () => dp.isInReadingList(story!.id),
    enabled: !!story && !!session,
  });

  const followQuery = useQuery({
    queryKey: ["follow", story?.author_id],
    queryFn: async () => ({
      following: await dp.isFollowing(story!.author_id),
      count: await dp.getFollowerCount(story!.author_id),
    }),
    enabled: !!story && !!session,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["like", story?.id] });
    queryClient.invalidateQueries({ queryKey: ["readingList"] });
    queryClient.invalidateQueries({ queryKey: ["follow", story?.author_id] });
  };

  const likeMutation = useMutation({ mutationFn: () => dp.toggleLike(story!.id), onSuccess: invalidate });
  const listMutation = useMutation({ mutationFn: () => dp.toggleReadingList(story!.id), onSuccess: invalidate });
  const followMutation = useMutation({ mutationFn: () => dp.toggleFollow(story!.author_id), onSuccess: invalidate });

  const storyRedirectPending = useUsernameRedirect(
    username,
    !storyQuery.isLoading && !story,
    (next) => `/stories/${next}/${slug}`
  );
  const slugRedirectPending = useStorySlugRedirect(
    username,
    slug,
    !storyQuery.isLoading && !story && !storyRedirectPending,
    (nextUser, nextSlug) => `/stories/${nextUser}/${nextSlug}`
  );
  // The summary toggle resets when the story changes (client-side
  // navigation reuses this component), and the chevron only appears
  // when the text actually overflows the 3-line clamp — a short
  // summary fits entirely, so its chevron must not appear at all
  // (a dead chevron looks broken: Speckled Band's live summary is
  // a single short sentence, about 2 lines on a phone).
  // These effects MUST stay above the early returns below: hooks
  // called after an early return run on some renders and not others,
  // which crashes React (this exact mistake blanked the story page
  // in the first v3 build). While loading, summaryRef is null and
  // the measure effect returns safely.
  useEffect(() => {
    setSummaryExpanded(false);
    setSummaryHasOverflow(false);
  }, [story?.id]);
  useEffect(() => {
    if (summaryExpanded) return;
    const el = summaryRef.current;
    if (!el) return;
    const measure = () => {
      setSummaryHasOverflow((prev) => {
        const next = el.scrollHeight > el.clientHeight + 1;
        return prev === next ? prev : next;
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const fonts = document.fonts?.ready?.then(measure).catch(() => {});
    return () => {
      window.removeEventListener("resize", measure);
      void fonts;
    };
  }, [story?.id, story?.summary, summaryExpanded, locale]);

  if (storyQuery.isLoading) return <Layout><Spinner /></Layout>;
  if (!story) {
    if (storyRedirectPending || slugRedirectPending) return <Layout><Spinner /></Layout>;
    return (
      <Layout>
        <EmptyState
          title={t("errors", "notFound")}
          action={<ButtonLink to="/discover">{t("discover", "title")}</ButtonLink>}
        />
      </Layout>
    );
  }

  const chapters = chaptersQuery.data ?? [];
  const progress = progressQuery.data;
  const resumeChapter = progress?.chapter_id
    ? chapters.find((c) => c.id === progress.chapter_id) ?? chapters[0]
    : chapters[0];
  // One shared estimate: total published words through the shared formula,
  // so the story page always agrees with cards, rows and the library.
  const totalWords = story.word_count ?? chapters.reduce((a, c) => a + c.word_count, 0);
  const totalMinutes = readingMinutes(totalWords, story.language);

  const chapterUrl = (c: { slug: string }) => `/stories/${username}/${slug}/${c.slug}`;
  /** Chapter-list links restart the chapter from the top (manual restart);
   *  only Continue Reading resumes the saved position. */
  const chapterStartUrl = (c: { slug: string }) => `${chapterUrl(c)}?restart=1`;

  // Resume position for the Continue button and the chapter row: the
  // progress record stores only the current chapter + its scroll ratio.
  const resumeIndex = progress?.chapter_id
    ? chapters.findIndex((c) => c.id === progress.chapter_id)
    : -1;
  const resumePct =
    progress && resumeIndex >= 0 && progress.scroll_ratio > 0
      ? Math.round(progress.scroll_ratio * 100)
      : null;

  // Overall progress for the chapter-list bar (mobile): how far through
  // the whole story the saved position is, from the same progress
  // record — no new stored data. Guests and readers with no saved
  // position get no bar.
  const overallPct =
    progress && resumeIndex >= 0 && chapters.length > 0
      ? Math.round(((resumeIndex + (progress.scroll_ratio || 0)) / chapters.length) * 100)
      : null;

  // Shared Start/Continue label, plain by owner choice (2026-10-27):
  // no chapter/% on the button — the progress lives on the chapter
  // rows and the contents bar instead, so the button stays one line.
  // The hero button (desktop) and the sticky bottom row (mobile) show
  // the same text.
  const actionLabel = (
    <span className="text-[13px] sm:text-sm md:text-base">
      {progress ? t("story", "continueReading") : t("story", "startReading")}
    </span>
  );

  // Look Inside: plain text of the OPENING of chapter 1.
  // Chapter list items carry no bodies (V4-04), so this comes from the
  // separate first-chapter fetch above; anything else hides the section.
  // Imported classic chapters often open with a header block (Story: /
  // Original author: / Source: / Archived: / a rule of = signs) before
  // the prose starts — quoting that block looked like a label, not an
  // opening line (Speckled Band, 2026-10-26), so header-like leading
  // paragraphs are skipped until the first real paragraph. A chapter
  // that opens with its own title as a centered line (প্রভালয়, whose
  // first line repeats the chapter title) is skipped the same way.
  // The excerpt then runs up to 300 chars, joining short lines (verse)
  // so a poem shows its opening lines, not a single short line; a long
  // prose paragraph still fills the excerpt on its own, as before.
  const plainText = (node: TiptapNode): string =>
    node.text ?? (node.content ?? []).map(plainText).join("");
  const chapterTitle = firstChapterQuery.data?.title?.trim() ?? "";
  const isHeaderLine = (text: string): boolean => {
    const t = text.trim();
    if (!t) return true;
    if (chapterTitle && t.toLowerCase() === chapterTitle.toLowerCase()) return true;
    if (t.toLowerCase() === story.title.trim().toLowerCase()) return true;
    if (/^(story|original author|author|translator|adapted by|source|edition|archived|published|copyright)\s*:/i.test(t)) return true;
    if (/^[=\-_]{3,}$/.test(t)) return true;
    if (/^(chapter|part|section)\s+[\w\d]+$/i.test(t)) return true;
    return false;
  };
  const firstDoc = firstChapterQuery.data?.body_json;
  const excerptParas: string[] = [];
  let excerptStarted = false;
  for (const n of firstDoc?.content ?? []) {
    if (n.type !== "paragraph") {
      if (excerptStarted) break;
      continue;
    }
    const t = plainText(n).trim();
    if (!excerptStarted) {
      if (isHeaderLine(t)) continue;
      excerptStarted = true;
    }
    excerptParas.push(t);
    if (excerptParas.join(" ").length >= 300) break;
  }
  const firstParaRaw = excerptParas.join(" ").replace(/\s+/g, " ").trim();
  const firstPara = firstParaRaw.length > 300 ? `${firstParaRaw.slice(0, 300)}…` : firstParaRaw;

  const hasProvenance = !!(
    story.original_author ||
    story.original_title ||
    story.translator_name ||
    story.adapter_name ||
    story.edition_source ||
    story.publication_details
  );
  const moreByAuthor = moreByAuthorQuery.data ?? [];

  return (
    <Layout>
      <nav aria-label="Breadcrumb" className="mt-6 hidden items-center gap-1.5 text-sm text-ink-faint lg:flex">
        <Link to="/" className="hover:text-river hover:underline">{t("nav", "home")}</Link>
        <span aria-hidden>/</span>
        <Link to={`/discover?genre=${encodeURIComponent(story.genre)}`} className="hover:text-river hover:underline">
          {genreLabel(story.genre, locale)}
        </Link>
        <span aria-hidden>/</span>
        <span className="min-w-0 truncate font-semibold text-ink">{story.title}</span>
      </nav>

      {/* Mobile story-page band: full-bleed below lg, with back + share
          over a soft site-palette gradient and the cover centered on
          it. The blurred-photo backdrop went muddy with different
          covers, so the band is palette-only now — it looks the same
          good with every cover. The share button is placed but parked:
          sharing is a function, and function work waits. */}
      <div className="relative -mx-4 overflow-hidden rounded-b-3xl bg-gradient-to-b from-sage-dark via-sage to-paper lg:hidden">
        <div className="relative flex items-center justify-between px-4 pt-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label={t("common", "back")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-sm"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            aria-label={t("common", "share")}
            title={t("common", "share")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-sm"
          >
            <ShareIcon />
          </button>
        </div>
        <div className="relative flex justify-center px-4 pb-6 pt-2">
          <Cover story={story} className="aspect-[3/4] w-48 rounded-xl shadow-lift sm:w-56" />
        </div>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 shadow-card sm:p-8 max-lg:rounded-none max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none">
        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <Cover story={story} className="mx-auto hidden aspect-[3/4] w-48 rounded-xl shadow-lift sm:w-56 lg:mx-0 lg:block lg:w-full" />

        <div className="min-w-0">
          {/* Badges sit above the title on desktop (the mockup's order) but
              below the author on phones, where the title must sit directly
              under the cover — one block per layout, the other hidden. */}
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            <LanguageBadge language={story.language} />
            <StatusBadge status={story.status} />
            <Badge>{genreLabel(story.genre, locale)}</Badge>
            {story.tags.map((tag) => (
              <Link key={tag} to={`/discover?tag=${encodeURIComponent(tag)}`}>
                <Badge tone="gold">#{tag}</Badge>
              </Link>
            ))}
          </div>
          <h1 className="max-lg:text-center text-pretty font-serif text-[28px] font-bold leading-tight sm:text-5xl md:text-[52px] lg:mt-3 lg:text-pretty lg:text-[56px]">{story.title}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-3 max-lg:flex-nowrap max-lg:justify-center max-lg:gap-2">
            <Link
              to={`/authors/${story.author?.username}`}
              className="inline-flex items-center gap-2 text-ink-soft hover:text-river-dark max-lg:min-w-0 max-lg:rounded-full max-lg:border max-lg:border-ink/10 max-lg:bg-white max-lg:px-2.5 max-lg:py-1 max-lg:shadow-sm"
            >
              <Avatar name={story.author?.display_name ?? "?"} size="sm" src={dp.avatarUrl(story.author?.avatar_path ?? null)} />
              <span className="shrink-0 font-bold text-ink max-lg:text-sm">{story.author?.display_name}</span>
              <span className="text-sm text-ink-faint max-lg:min-w-0 max-lg:truncate max-lg:text-xs">@{story.author?.username}</span>
            </Link>
            {session && !isOwner && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                aria-pressed={!!followQuery.data?.following}
              >
                {followQuery.data?.following ? t("story", "following") : `+ ${t("story", "follow")}`}
              </Button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 lg:hidden">
            <LanguageBadge language={story.language} />
            <StatusBadge status={story.status} />
            <Badge>{genreLabel(story.genre, locale)}</Badge>
            {story.tags.map((tag) => (
              <Link key={tag} to={`/discover?tag=${encodeURIComponent(tag)}`}>
                <Badge tone="gold">#{tag}</Badge>
              </Link>
            ))}
          </div>

          {story.summary && (
            <div className="mt-4">
              {summaryHasOverflow && (
                <button
                  type="button"
                  onClick={() => setSummaryExpanded((v) => !v)}
                  aria-expanded={summaryExpanded}
                  className="mb-2 flex w-full items-center justify-between lg:hidden"
                >
                  <span className="text-sm font-bold text-ink">{t("story", "summaryHeading")}</span>
                  <span className={`transition-transform ${summaryExpanded ? "rotate-180" : ""}`}>
                    <ChevronDownIcon />
                  </span>
                </button>
              )}
              <p ref={summaryRef} className={`whitespace-pre-line leading-relaxed text-ink ${summaryExpanded ? "" : "max-lg:line-clamp-3"}`}>{story.summary}</p>
            </div>
          )}

          {/* V4-28 attribution as Edition & Provenance boxes: only credits
              that exist are shown; the whole section hides for stories
              with no attribution data. */}
          {hasProvenance && (
            <div className="mt-6">
              <p className="text-sm font-bold text-ink">{t("story", "editionProvenance")}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(story.original_author || story.original_title || story.translator_name || story.adapter_name || story.edition_source) && (
                  <dl className="space-y-1 rounded-xl bg-white px-4 py-3 text-sm text-ink shadow-sm lg:bg-paper lg:shadow-none">
                    {story.original_author && (
                      <div className="flex gap-2"><dt className="shrink-0 font-medium text-ink">{t("story", "originalAuthor")}:</dt><dd>{story.original_author}</dd></div>
                    )}
                    {story.original_title && story.original_title !== story.title && (
                      <div className="flex gap-2"><dt className="shrink-0 font-medium text-ink">{t("story", "originalTitle")}:</dt><dd>{story.original_title}</dd></div>
                    )}
                    {story.translator_name && (
                      <div className="flex gap-2"><dt className="shrink-0 font-medium text-ink">{t("story", "translatedBy")}:</dt><dd>{story.translator_name}</dd></div>
                    )}
                    {story.adapter_name && (
                      <div className="flex gap-2"><dt className="shrink-0 font-medium text-ink">{t("story", "adaptedBy")}:</dt><dd>{story.adapter_name}</dd></div>
                    )}
                    {story.edition_source && (
                      <div className="flex gap-2"><dt className="shrink-0 font-medium text-ink">{t("story", "editionSource")}:</dt><dd>{story.edition_source}</dd></div>
                    )}
                  </dl>
                )}
                {story.publication_details && (
                  <dl className="space-y-1 rounded-xl bg-white px-4 py-3 text-sm text-ink shadow-sm lg:bg-paper lg:shadow-none">
                    <div className="flex gap-2"><dt className="shrink-0 font-medium text-ink">{t("story", "publicationDetails")}:</dt><dd>{story.publication_details}</dd></div>
                  </dl>
                )}
              </div>
            </div>
          )}

          {story.content_notice && (
            <p className="mt-3 rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay-dark">
              <strong>{t("story", "contentNotice")}:</strong> {story.content_notice}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-faint max-lg:justify-center">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><BookIcon />{chapters.length} {chapters.length === 1 ? t("story", "chapterSingular") : t("story", "chapters")}</span>
            {totalMinutes > 0 && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><ClockIcon />~{totalMinutes} {t("story", "minRead")}</span>}
            {story.published_at && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarIcon />{t("story", "publishedOn")} {formatDate(story.published_at, locale)}</span>}
          </div>

          <div className="mt-6 hidden flex-wrap gap-2 lg:flex">
            {chapters.length > 0 && (
              <ButtonLink to={chapterUrl(resumeChapter)} size="lg" className="flex-wrap">
                {actionLabel}
              </ButtonLink>
            )}
            {session ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => listMutation.mutate()}
                  disabled={listMutation.isPending}
                  aria-pressed={!!listQuery.data}
                >
                  <BookmarkIcon filled={!!listQuery.data} />
                  {listQuery.data ? t("story", "saved") : t("story", "saveToLibrary")}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => likeMutation.mutate()}
                  disabled={likeMutation.isPending}
                  aria-pressed={!!likeQuery.data?.liked}
                >
                  <HeartIcon filled={!!likeQuery.data?.liked} />
                  {likeQuery.data?.liked ? t("story", "liked") : t("story", "like")}
                </Button>
              </>
            ) : (
              <ButtonLink to={`/login?next=${encodeURIComponent(window.location.pathname)}`} variant="secondary" size="lg">
                {t("nav", "signIn")}
              </ButtonLink>
            )}
            {isOwner && (
              <ButtonLink to={`/write/stories/${story.id}`} variant="ghost" size="lg">
                {t("common", "edit")}
              </ButtonLink>
            )}
          </div>
          {isOwner && (
            <div className="mt-3 lg:hidden">
              <ButtonLink to={`/write/stories/${story.id}`} variant="ghost" size="lg">
                {t("common", "edit")}
              </ButtonLink>
            </div>
          )}

          {!isOwner && session && (
            <button
              onClick={() => setReportOpen(true)}
              className="mt-3 text-sm text-ink-faint underline hover:text-clay"
            >
              {t("story", "report")}
            </button>
          )}
        </div>
        </div>
      </section>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-10">
          {firstPara && chapters.length > 0 && (
            <section>
              <h2 className="font-serif text-2xl font-bold">{t("story", "lookInside")}</h2>
              <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />
              <blockquote className="mt-4 rounded-xl bg-white p-5 shadow-card">
                <p className="font-serif text-lg leading-relaxed text-ink">“{firstPara}”</p>
                <footer className="mt-3 text-sm text-ink-faint">
                  {t("story", "chapter")} 1 · {chapters[0].title}
                </footer>
              </blockquote>
            </section>
          )}

          <section>
            <h2 className="font-serif text-2xl font-bold">
              {t("story", "tableOfContents")} ({chapters.length})
            </h2>
            <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />
            {overallPct != null && (
              <div className="mt-3 lg:hidden" role="progressbar" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100} aria-label={t("story", "readingProgress")}>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${overallPct}%` }} />
                </div>
              </div>
            )}
            {chaptersQuery.isLoading ? <Spinner /> : chapters.length ? (
              <ol className="mt-4 divide-y divide-ink/10 rounded-xl bg-white shadow-card">
                {chapters.map((c, i) => (
                  <li key={c.id}>
                    <Link to={chapterStartUrl(c)} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-sage/40">
                      <span className="w-8 shrink-0 text-center font-serif text-lg text-ink-faint">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{c.title}</span>
                        <span className="text-xs text-ink-faint">
                          {c.published_at ? timeAgo(c.published_at, locale) : ""}
                          {readingMinutes(c.word_count, story.language) > 0 ? ` · ${readingMinutes(c.word_count, story.language)} ${t("story", "minRead")}` : ""}
                          {progress?.chapter_id === c.id && resumePct != null ? ` · ${resumePct}%` : ""}
                        </span>
                        {progress?.chapter_id === c.id && resumePct != null && (
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sage">
                            <span className="block h-full rounded-full bg-river" style={{ width: `${resumePct}%` }} />
                          </span>
                        )}
                      </div>
                      {progress?.chapter_id === c.id && (
                        <Badge tone="river">{t("library", "resume")}</Badge>
                      )}
                      <span aria-hidden className="text-ink-faint">→</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title={t("story", "noChapters")} />
            )}
          </section>
        </div>

        {moreByAuthor.length > 0 && (
          <aside>
            <h2 className="font-serif text-2xl font-bold">{t("story", "moreByAuthor")}</h2>
            <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />
            <div className="mt-4 flex flex-col gap-3">
              {moreByAuthor.map((s) => (
                <Link
                  key={s.id}
                  to={`/stories/${s.author?.username ?? username}/${s.slug}`}
                  className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card transition-shadow hover:shadow-lift"
                >
                  <Cover story={s} thumb className="aspect-[3/4] w-14 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug clamp-2">{s.title}</span>
                    <span className="mt-1 block text-xs text-ink-faint">
                      <LanguageBadge language={s.language} />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile sticky action row (the mockup's bottom row): gold
          Start/Continue + Save + Like above the bottom nav. Same
          gating as the hero buttons — guests get Sign in instead of
          Save/Like — and the same label. The spacer below clears it
          so the last content never hides underneath. */}
      <div className="fixed inset-x-0 bottom-14 z-40 flex items-center gap-2 border-t border-ink/10 bg-white px-4 py-3 md:bottom-0 lg:hidden">
        {chapters.length > 0 && (
          <ButtonLink to={chapterUrl(resumeChapter)} variant="primary" size="lg" className="min-w-0 flex-1">
            {actionLabel}
          </ButtonLink>
        )}
        {session ? (
          <>
            <button
              type="button"
              onClick={() => listMutation.mutate()}
              disabled={listMutation.isPending}
              aria-pressed={!!listQuery.data}
              aria-label={listQuery.data ? t("story", "saved") : t("story", "saveToLibrary")}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ink/15 bg-white text-ink"
            >
              <BookmarkIcon filled={!!listQuery.data} />
            </button>
            <button
              type="button"
              onClick={() => likeMutation.mutate()}
              disabled={likeMutation.isPending}
              aria-pressed={!!likeQuery.data?.liked}
              aria-label={likeQuery.data?.liked ? t("story", "liked") : t("story", "like")}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ink/15 bg-white text-ink"
            >
              <HeartIcon filled={!!likeQuery.data?.liked} />
            </button>
          </>
        ) : (
          <ButtonLink to={`/login?next=${encodeURIComponent(window.location.pathname)}`} variant="secondary" size="lg">
            {t("nav", "signIn")}
          </ButtonLink>
        )}
      </div>
      <div className="h-24 lg:hidden" aria-hidden />

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="story"
        targetId={story.id}
        targetLabel={story.title}
      />
    </Layout>
  );
}

export function AuthorPage() {
  const { username = "" } = useParams();
  const { t, dp, session } = useApp();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", "byUsername", username],
    queryFn: () => dp.getProfileByUsername(username),
  });
  const profile = profileQuery.data;

  usePageMeta({
    title: profile ? `${profile.display_name} | GolpoNeer` : SHELL_TITLE,
    description: profile?.bio,
    path: `/authors/${username}`,
  });
  useJsonLd(
    profile
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          name: profile.display_name,
          url: `https://golponeer.com/authors/${profile.username}`,
          description: profile.bio || undefined,
        })
      : null
  );

  const storiesQuery = useQuery({
    queryKey: ["stories", { authorId: profile?.id }],
    queryFn: () => dp.listStories({ authorId: profile!.id, limit: 50 }),
    enabled: !!profile,
  });

  const followQuery = useQuery({
    queryKey: ["follow", profile?.id],
    queryFn: async () => ({
      following: await dp.isFollowing(profile!.id),
      count: await dp.getFollowerCount(profile!.id),
    }),
    // Count must load for guests and for the author too: isFollowing is
    // guest-safe (false with no session) and follows are public-read,
    // so the old session-and-not-self gate only ever produced "0".
    enabled: !!profile,
  });

  const followMutation = useMutation({
    mutationFn: () => dp.toggleFollow(profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["follow", profile?.id] }),
  });

  const profileRedirectPending = useUsernameRedirect(
    username,
    !profileQuery.isLoading && !profile,
    (next) => `/authors/${next}`
  );
  if (profileQuery.isLoading) return <Layout><Spinner /></Layout>;
  if (!profile) {
    if (profileRedirectPending) return <Layout><Spinner /></Layout>;
    return (
      <Layout>
        <EmptyState title={t("errors", "notFound")} action={<ButtonLink to="/discover">{t("discover", "title")}</ButtonLink>} />
      </Layout>
    );
  }

  const isSelf = session?.user.id === profile.id;

  return (
    <Layout>
      <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar name={profile.display_name} size="lg" src={dp.avatarUrl(profile.avatar_path)} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-bold">{profile.display_name}</h1>
          <p className="text-ink-faint">@{profile.username}</p>
          {profile.bio && <p className="mt-2 max-w-2xl whitespace-pre-line text-ink-soft">{profile.bio}</p>}
        </div>
        {session && !isSelf && (
          <div className="flex gap-2">
            <Button
              variant={followQuery.data?.following ? "secondary" : "primary"}
              onClick={() => followMutation.mutate()}
              disabled={followMutation.isPending}
            >
              {followQuery.data?.following ? t("story", "following") : t("story", "follow")}
            </Button>
            <Button variant="ghost" onClick={() => setReportOpen(true)}>{t("story", "report")}</Button>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm text-ink-faint">
        {followQuery.data?.count ?? 0} {t("story", "followers")}
      </p>

      <h2 className="mb-4 mt-8 font-serif text-2xl font-bold">{t("story", "stories")}</h2>
      {storiesQuery.isLoading ? <Spinner /> : storiesQuery.data?.stories.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {storiesQuery.data.stories.map((s) => (
            <Link key={s.id} to={`/stories/${profile.username}/${s.slug}`} className="block h-full">
              <div className="h-full rounded-xl bg-white p-4 shadow-card hover:shadow-lift">
                <div className="flex items-center gap-2">
                  <LanguageBadge language={s.language} />
                  <StatusBadge status={s.status} />
                </div>
                <h3 className="mt-2 font-serif text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-soft clamp-2">{s.summary}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title={t("discover", "noResults")} />
      )}

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="profile"
        targetId={profile.id}
        targetLabel={profile.display_name}
      />
    </Layout>
  );
}
