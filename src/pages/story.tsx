import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useUsernameRedirect } from "../lib/use-username-redirect";
import { useStorySlugRedirect } from "../lib/use-story-slug-redirect";
import { genreLabel, genreSlugFor } from "../lib/genres";
import { subLabel } from "../lib/subcategories";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Spinner, StatusBadge, LanguageBadge } from "../components/ui";
import { AuthorHeroSkeleton, AuthorStoryCardSkeleton, ChapterRowSkeleton, KeepsakeCardSkeleton, MoreByAuthorSkeleton, StoryHeroSkeleton } from "../components/skeleton";
import { Cover } from "../components/story-card";
import { CARD_TEMPLATES, keepsakeAttribution } from "../lib/keepsake-card";
import { ReportDialog } from "../components/report-dialog";
import { formatDate, getAnonViewerId, readingMinutes, timeAgo } from "../lib/utils";
import { usePageMeta, useJsonLd, SHELL_TITLE } from "../lib/page-meta";
import type { TiptapNode } from "../lib/types";

// Long chapter lists collapse: only the first page shows until the
// reader asks for all of them (keeps 30–46-chapter stories from
// dominating the page; short stories are untouched).
const CONTENTS_PAGE_SIZE = 10;

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
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

function ChevronDownIcon({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
  const location = useLocation();
  const navigate = useNavigate();
  // Back out of the story must never return to its own reader: the
  // reader's bar back links here with state.fromReader, so a plain
  // history.back() from there would ping-pong reader ↔ story forever.
  // From the reader, back goes home; from anywhere else, normal
  // browser back is preserved.
  const goBack = () => {
    if ((location.state as { fromReader?: boolean } | null)?.fromReader) navigate("/");
    else window.history.back();
  };
  const { t, locale, dp, session } = useApp();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const [summaryHasOverflow, setSummaryHasOverflow] = useState(false);
  const [contentsExpanded, setContentsExpanded] = useState(false);
  const [contentsJumpVisible, setContentsJumpVisible] = useState(false);
  const [nearPageBottom, setNearPageBottom] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const storyQuery = useQuery({
    queryKey: ["story", username, slug],
    queryFn: () => dp.getStoryBySlug(username, slug),
  });
  const story = storyQuery.data;

  // Share: the phone's native sheet where available, otherwise copy
  // the story link and confirm it. A dismissed sheet (AbortError)
  // is silence, not a failure — no fallback, no message.
  const handleShare = async () => {
    if (!story) return;
    const url = window.location.href;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: story.title, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand("copy");
        ta.remove();
      } catch {
        copied = false;
      }
    }
    if (copied) setLinkCopied(true);
  };

  useEffect(() => {
    if (!linkCopied) return;
    const id = window.setTimeout(() => setLinkCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [linkCopied]);

  const storyAuthorName =
    story?.author?.display_name ?? story?.author?.username;
  // Genre landing page for the breadcrumb (story -> genre -> home trail):
  // unknown spellings fall back to the old filtered-Discover address.
  const genreSlug = story ? genreSlugFor(story.genre) : null;
  const genrePath = genreSlug
    ? `/genres/${genreSlug}`
    : story
      ? `/discover?genre=${encodeURIComponent(story.genre)}`
      : "/discover";
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
  // Book schema + BreadcrumbList in one @graph (useJsonLd keeps a single
  // page script, so the breadcrumb joins the Book object rather than
  // replacing it). The trail mirrors the visible breadcrumb exactly:
  // Home → genre → this story.
  useJsonLd(
    story
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
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
              dateModified: story.updated_at || undefined,
              publisher: {
                "@type": "Organization",
                name: "GolpoNeer",
                url: "https://golponeer.com/",
              },
              // Story-result extras: the cover as the story's image, and
              // the free-to-read signal. Both only for public stories —
              // a draft preview is neither public nor freely accessible,
              // and its thumb does not live in the public bucket.
              ...(story.status === "ongoing" || story.status === "complete"
                ? {
                    image:
                      dp.coverThumbPublicUrl(story.cover_path) || undefined,
                    isAccessibleForFree: true,
                  }
                : {}),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: t("nav", "home"),
                  item: "https://golponeer.com/",
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: genreLabel(story.genre, locale),
                  item: `https://golponeer.com${genrePath}`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: story.title,
                  item: `https://golponeer.com/stories/${story.author?.username ?? username}/${story.slug}`,
                },
              ],
            },
          ],
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
    queryKey: ["stories", { authorId: story?.author_id }, "more", story?.id],
    queryFn: async () => {
      // Rotation, not newest-only: up to 100 of the author's stories
      // come back newest-first, and this page shows the 4 after the
      // current story, wrapping to the top — so every story page
      // shows a different set and the older half of a catalogue is
      // not stuck behind the newest few. A draft preview is not in
      // the public list, so a missing current story starts at the top.
      const res = await dp.listStories({ authorId: story!.author_id, limit: 100 });
      const others = res.stories.filter((s) => s.id !== story!.id);
      if (others.length === 0) return [];
      const at = res.stories.findIndex((s) => s.id === story!.id);
      const start = at < 0 ? 0 : at;
      return Array.from({ length: Math.min(4, others.length) }, (_, i) => others[(start + i) % others.length]);
    },
    enabled: !!story,
  });

  const isOwner = !!session && !!story && session.user.id === story.author_id;

  // Count the view once per viewer per day (provider enforces dedup,
  // no-self-views and public-only). Signed-out visitors count too, via a
  // random per-browser id — no IP address, no identity.
  useEffect(() => {
    if (!story || isOwner) return;
    if (story.status !== "ongoing" && story.status !== "complete") return;
    dp.recordStoryView(story.id, session ? undefined : getAnonViewerId())
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

  const finishedQuery = useQuery({
    queryKey: ["finished", story?.id],
    queryFn: () => dp.isFinished(story!.id),
    enabled: !!story && !!session,
  });

  // Per-chapter finished marks for the Contents ticks. Hidden while the
  // query errors (e.g. before the finished_chapters migration is applied)
  // so a missing table never breaks the chapter list.
  const finishedChaptersQuery = useQuery({
    queryKey: ["finishedChapters", story?.id],
    queryFn: () => dp.getFinishedChapterIds(story!.id),
    enabled: !!story && !!session,
  });
  const finishedChapterIds = new Set(finishedChaptersQuery.data ?? []);

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
    queryClient.invalidateQueries({ queryKey: ["finished", story?.id] });
    queryClient.invalidateQueries({ queryKey: ["finishedChapters", story?.id] });
    queryClient.invalidateQueries({ queryKey: ["finishedStories"] });
    queryClient.invalidateQueries({ queryKey: ["inProgress"] });
  };

  const likeMutation = useMutation({ mutationFn: () => dp.toggleLike(story!.id), onSuccess: invalidate });
  const listMutation = useMutation({ mutationFn: () => dp.toggleReadingList(story!.id), onSuccess: invalidate });
  const finishedMutation = useMutation({ mutationFn: () => dp.toggleFinished(story!.id), onSuccess: invalidate });
  const chapterFinishedMutation = useMutation({
    mutationFn: ({ chapterId, finished }: { chapterId: string; finished: boolean }) =>
      dp.setChapterFinished(story!.id, chapterId, finished),
    onSuccess: invalidate,
  });
  const followMutation = useMutation({ mutationFn: () => dp.toggleFollow(story!.author_id), onSuccess: invalidate });

  // Heal once per story visit: if an auto story mark survived a new
  // chapter being published (or a chapter unmark), drop it so the
  // Finished button and shelf stay truthful. Never inserts, so a
  // manual story unmark is never undone by healing.
  const healedRef = useRef<string | null>(null);
  useEffect(() => {
    const list = chaptersQuery.data;
    if (!story || !session || !list || list.length === 0 || healedRef.current === story.id) return;
    healedRef.current = story.id;
    dp.healAutoFinished(story.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["finished", story.id] });
        queryClient.invalidateQueries({ queryKey: ["finishedStories"] });
        queryClient.invalidateQueries({ queryKey: ["inProgress"] });
      })
      .catch(() => {});
  }, [story?.id, session, chaptersQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setContentsExpanded(false);
  }, [story?.id]);

  // Near the bottom of the page the floating bars step aside so the
  // footer is never covered by them: within 300px of the document
  // end the Continue row, the jump button, and the status row all
  // hide; scrolling back up brings them back. (Space above the
  // footer cannot fix this — the footer always ends at the very
  // bottom of the screen, so only hiding the bars clears it.)
  // The measure also re-runs whenever the page height changes: on
  // mount the story is still loading, so the page is short and the
  // first measure wrongly says "near bottom" — without this, the bars
  // stay hidden until the first scroll or resize.
  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      setNearPageBottom(
        doc.scrollHeight - (window.scrollY + window.innerHeight) < 300
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, []);

  // Floating back-to-contents jump: visible only while the chapter
  // list is expanded AND the reader has scrolled a bit into it (the
  // Contents heading 300px above the viewport top). Tapping it
  // collapses the list and returns to the Contents top, which hides
  // it again; expanding and scrolling down brings it back. Collapsed
  // lists never show it — there is nothing long to escape from.
  useEffect(() => {
    const update = () => {
      const section = document.getElementById("story-contents");
      setContentsJumpVisible(
        contentsExpanded &&
        section != null &&
        section.getBoundingClientRect().top < -300
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [contentsExpanded]);
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

  // Slim floating status row (mobile/tablet only, above the Continue
  // bar): current chapter + gold progress bar + %, beside a separate
  // round jump icon. Both jump to the reader's chapter row inside
  // Contents (NOT into the chapter — Continue does that). Dismissal
  // rule by owner choice: the first tap anywhere (or the jump
  // itself) hides the row and records it in localStorage per
  // reader + story, so RELOADING the story page never brings it
  // back — but LEAVING the story inside the app forgets the
  // dismissal, so coming back shows it again. Mechanism: this
  // effect's cleanup removes the flag, and cleanup runs when the
  // story changes or the page unmounts (in-app leave) but NOT on a
  // full reload (the document is just destroyed, no cleanup runs).
  // Other stories still show theirs until dismissed there too.
  // Taps on the row itself jump first, then dismiss; the document
  // listener ignores those so the click still lands. Guests see
  // nothing — no progress to show. Colours deliberately avoid the
  // Continue bar: ink pill + gold fill, not river, not sage.
  const [statusBarVisible, setStatusBarVisible] = useState(true);
  const statusDismissKey = story?.id
    ? `gh:status-dismissed:${session?.user?.id ?? "anon"}:${story.id}`
    : null;
  const dismissStatusBar = () => {
    try {
      if (statusDismissKey) localStorage.setItem(statusDismissKey, "1");
    } catch {
      // Private mode etc: dismissal just lasts for this visit.
    }
    setStatusBarVisible(false);
  };
  useEffect(() => {
    if (!statusDismissKey) return;
    try {
      setStatusBarVisible(localStorage.getItem(statusDismissKey) !== "1");
    } catch {
      setStatusBarVisible(true);
    }
    // Leaving the story forgets the dismissal: cleanup runs on
    // unmount (in-app leave) and before re-running on a story
    // change, but never on a full reload — so a reload keeps the
    // row hidden while a return visit shows it again.
    return () => {
      try {
        localStorage.removeItem(statusDismissKey);
      } catch {
        // Ignore storage failures; the row just shows again.
      }
    };
  }, [statusDismissKey]);
  useEffect(() => {
    if (!statusBarVisible) return;
    const hide = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-status-row]")) return;
      dismissStatusBar();
    };
    document.addEventListener("pointerdown", hide);
    return () => document.removeEventListener("pointerdown", hide);
  }, [statusBarVisible, statusDismissKey]);
  if (storyQuery.isLoading) return <Layout><StoryHeroSkeleton /></Layout>;
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

  // Status row values (plain consts, so they live here after the early
  // returns; the state/effects above must stay above them): the
  // reader's chapter (first chapter when nothing saved yet) and its
  // own scroll % (0 when nothing saved). The jump lands on that
  // chapter's row inside Contents, expanding the collapsed list
  // first when the chapter is past the first page — the row only
  // exists after that re-render, so the scroll waits two frames
  // (same pattern as the reader's restore).
  const statusIndex = resumeIndex >= 0 ? resumeIndex : 0;
  const statusPct = resumePct ?? 0;
  const jumpToCurrentChapter = () => {
    if (chapters.length > CONTENTS_PAGE_SIZE && !contentsExpanded) setContentsExpanded(true);
    dismissStatusBar();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`contents-chapter-${statusIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

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
      {linkCopied && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-river px-4 py-2 text-sm font-medium text-white shadow-lift">
          {t("common", "linkCopied")}
        </div>
      )}
      <nav aria-label="Breadcrumb" className="mt-6 hidden items-center gap-1.5 text-sm text-ink-faint lg:flex">
        {/* Back + share pills ride the breadcrumb row at lg–xl only
            (iPad Pro sizes: touch tablets get the phone affordances).
            Below lg the band below carries them; at xl+ (desktop) the
            breadcrumb alone is enough — browser back covers going
            back, and the share button is still parked, so desktop
            gets no extra dead button. */}
        <button
          type="button"
          onClick={goBack}
          aria-label={t("common", "back")}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-sm lg:flex xl:hidden"
        >
          <ChevronLeftIcon />
        </button>
        <Link to="/" className="hover:text-river hover:underline">{t("nav", "home")}</Link>
        <span aria-hidden>/</span>
        <Link to={genrePath} className="hover:text-river hover:underline">
          {genreLabel(story.genre, locale)}
        </Link>
        <span aria-hidden>/</span>
        <span className="min-w-0 truncate font-semibold text-ink">{story.title}</span>
        <button
          type="button"
          onClick={handleShare}
          aria-label={t("common", "share")}
          title={t("common", "share")}
          className="ml-auto hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-sm lg:flex xl:hidden"
        >
          <ShareIcon />
        </button>
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
            onClick={goBack}
            aria-label={t("common", "back")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-sm"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={handleShare}
            aria-label={t("common", "share")}
            title={t("common", "share")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-sm"
          >
            <ShareIcon />
          </button>
        </div>
        <div className="relative flex justify-center px-4 pb-6 pt-2">
          <Cover story={story} thumb className="aspect-[3/4] w-48 rounded-xl shadow-lift sm:w-56" />
        </div>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 shadow-card sm:p-8 max-lg:rounded-none max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none">
        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <Cover story={story} thumb className="mx-auto hidden aspect-[3/4] w-48 rounded-xl shadow-lift sm:w-56 lg:mx-0 lg:block lg:w-full" />

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
            {/* Sub-categories link like free tags: tapping one filters
                Discover to stories carrying that sub. */}
            {(story.subcategories ?? []).map((sub) => (
              <Link key={sub} to={`/discover?sub=${encodeURIComponent(sub)}`}>
                <Badge tone="gold">#{subLabel(sub)}</Badge>
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
            {(story.subcategories ?? []).map((sub) => (
              <Link key={sub} to={`/discover?sub=${encodeURIComponent(sub)}`}>
                <Badge tone="gold">#{subLabel(sub)}</Badge>
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

          {/* Meta strip: full ink + medium weight (not faint) with
              river icons — these facts (length, read time, date) are
              important, so they read at the same strength as the
              summary instead of fading into the background. */}
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-ink max-lg:justify-center">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="text-river"><BookIcon /></span>{chapters.length} {chapters.length === 1 ? t("story", "chapterSingular") : t("story", "chapters")}</span>
            {totalMinutes > 0 && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="text-river"><ClockIcon /></span>~{totalMinutes} {t("story", "minRead")}</span>}
            {story.published_at && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="text-river"><CalendarIcon /></span>{t("story", "publishedOn")} {formatDate(story.published_at, locale)}</span>}
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
                <Button
                  variant={finishedQuery.data ? "secondary" : "outline"}
                  size="lg"
                  onClick={() => finishedMutation.mutate()}
                  disabled={finishedMutation.isPending}
                  aria-pressed={!!finishedQuery.data}
                >
                  {finishedQuery.data ? t("story", "markedFinished") : t("story", "markFinished")}
                </Button>
              </>
            ) : (
              <ButtonLink to={`/login?next=${encodeURIComponent(window.location.pathname)}`} variant="secondary" size="lg">
                {t("nav", "signIn")}
              </ButtonLink>
            )}
            {isOwner && (
              <ButtonLink to={`/write/stories/${story.id}`} variant="outline" size="lg">
                <PencilIcon />
                {t("common", "edit")}
              </ButtonLink>
            )}
          </div>
          {isOwner && (
            <div className="mt-3 lg:hidden">
              <ButtonLink to={`/write/stories/${story.id}`} variant="outline" size="lg">
                <PencilIcon />
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

          <section id="story-contents" className="scroll-mt-24">
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
            {chaptersQuery.isLoading ? (
              <ol className="mt-4 divide-y divide-ink/10 rounded-xl bg-white shadow-card">
                {[0, 1, 2, 3, 4].map((i) => <ChapterRowSkeleton key={i} />)}
              </ol>
            ) : chapters.length ? (
              <>
              <ol className="mt-4 divide-y divide-ink/10 rounded-xl bg-white shadow-card">
                {(contentsExpanded ? chapters : chapters.slice(0, CONTENTS_PAGE_SIZE)).map((c, i) => (
                  <li key={c.id} id={`contents-chapter-${i}`} className="scroll-mt-24">
                    <div className="flex items-center gap-1 pr-2">
                    <Link to={chapterStartUrl(c)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5 transition-colors hover:bg-sage/40">
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
                    {session && finishedChaptersQuery.data && (
                      <button
                        type="button"
                        aria-label={finishedChapterIds.has(c.id) ? t("story", "unmarkChapterFinished") : t("story", "markChapterFinished")}
                        aria-pressed={finishedChapterIds.has(c.id)}
                        onClick={() => chapterFinishedMutation.mutate({ chapterId: c.id, finished: !finishedChapterIds.has(c.id) })}
                        className={finishedChapterIds.has(c.id)
                          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-river text-white"
                          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink/30 text-transparent"}
                      >
                        <CheckIcon />
                      </button>
                    )}
                    </div>
                  </li>
                ))}
              </ol>
              {chapters.length > CONTENTS_PAGE_SIZE && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (contentsExpanded) {
                        setContentsExpanded(false);
                        // Collapse from the bottom of a long list:
                        // take the reader back to the top of Contents
                        // instead of leaving them to scroll all the way up.
                        document.getElementById("story-contents")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      } else {
                        setContentsExpanded(true);
                      }
                    }}
                  >
                    {contentsExpanded ? t("story", "showFewerChapters") : t("story", "showAllChapters")}
                    <span className={`transition-transform ${contentsExpanded ? "rotate-180" : ""}`}>
                      <ChevronDownIcon />
                    </span>
                  </Button>
                </div>
              )}
              </>
            ) : (
              <EmptyState title={t("story", "noChapters")} />
            )}
          </section>
        </div>

        {moreByAuthorQuery.isLoading ? (
          <MoreByAuthorSkeleton />
        ) : moreByAuthor.length > 0 && (
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
                  <Cover story={s} thumb small className="aspect-[3/4] w-14 shrink-0 rounded-lg" />
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

      {/* Mobile sticky action row (the mockup's bottom row):
          Start/Continue + Save + Like above the bottom nav. Same
          gating as the hero buttons — guests get Sign in instead of
          Save/Like — and the same label. The spacer below clears it
          so the last content never hides underneath. The bar is
          NARROW, not full-width: it hugs the buttons with a small
          frame (inset margins + tight padding), rounded corners and
          a soft shadow, in muted sage — a smooth premium tone, not
          a bright eye-catching slab. The buttons sit flat on it, so
          the bar carries the lift. */}
      {/* Slim floating status row, above the Continue bar and narrower
          than it (centred, capped width): ink pill with chapter +
          gold progress bar + %, plus a SEPARATE round jump icon with
          a gap between them — not attached like the Continue bar's
          buttons. Both share the ink background and both jump to the
          reader's chapter row in Contents. Dismissal: reload keeps
          it gone, leaving the story brings it back (see the effects
          above). Guests see nothing. */}
      {session && chapters.length > 0 && statusBarVisible && !nearPageBottom && (
        <div data-status-row className="fixed bottom-36 left-1/2 z-40 flex w-[calc(100%-4rem)] max-w-md -translate-x-1/2 items-center gap-2 md:bottom-24 lg:hidden">
          <button
            type="button"
            onClick={jumpToCurrentChapter}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-ink px-3.5 py-2.5 text-xs font-medium text-white shadow-lift"
          >
            <span className="shrink-0 whitespace-nowrap">{t("story", "chapter")} {statusIndex + 1}</span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-gold" style={{ width: `${statusPct}%` }} />
            </span>
            <span className="shrink-0 whitespace-nowrap">{statusPct}%</span>
          </button>
          <button
            type="button"
            onClick={jumpToCurrentChapter}
            aria-label={t("story", "tableOfContents")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-lift"
          >
            <ChevronDownIcon strokeWidth={3} />
          </button>
        </div>
      )}
      {contentsJumpVisible && !(session && statusBarVisible) && !nearPageBottom && (
        <button
          type="button"
          onClick={() => {
            setContentsExpanded(false);
            document.getElementById("story-contents")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          aria-label={t("story", "backToContents")}
          title={t("story", "backToContents")}
          className="fixed bottom-52 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-ink/10 bg-white text-ink shadow-lift md:bottom-40 lg:bottom-6 lg:right-6"
        >
          <span className="rotate-180">
            <ChevronDownIcon />
          </span>
        </button>
      )}
      {!nearPageBottom && (
      <div className="fixed inset-x-4 bottom-16 z-40 flex items-center gap-2 rounded-2xl border border-ink/10 bg-sage px-3 py-2 shadow-lift md:bottom-4 lg:hidden">
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
            <button
              type="button"
              onClick={() => finishedMutation.mutate()}
              disabled={finishedMutation.isPending}
              aria-pressed={!!finishedQuery.data}
              aria-label={finishedQuery.data ? t("story", "markedFinished") : t("story", "markFinished")}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ink/15 ${finishedQuery.data ? "bg-sage text-river" : "bg-white text-ink"}`}
            >
              <CheckIcon />
            </button>
          </>
        ) : (
          <ButtonLink to={`/login?next=${encodeURIComponent(window.location.pathname)}`} variant="secondary" size="lg">
            {t("nav", "signIn")}
          </ButtonLink>
        )}
      </div>
      )}
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
  const { t, dp, session, locale } = useApp();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  // Status tabs filter only the stories already loaded for this page —
  // no new query, no data change. The Keepsakes tab loads its own query
  // (the keeper's public cards) below.
  const [tab, setTab] = useState<"all" | "ongoing" | "complete" | "keepsakes">("all");

  const profileQuery = useQuery({
    queryKey: ["profile", "byUsername", username],
    queryFn: () => dp.getProfileByUsername(username),
  });
  const profile = profileQuery.data;

  const storiesQuery = useQuery({
    queryKey: ["stories", { authorId: profile?.id }],
    queryFn: () => dp.listStories({ authorId: profile!.id, limit: 50 }),
    enabled: !!profile,
  });

  const keepsakesQuery = useQuery({
    queryKey: ["public-keepsakes", "byKeeper", profile?.id],
    queryFn: () => dp.listPublicKeepsakesByKeeper(profile!.id, 50),
    enabled: !!profile,
  });

  // Author identity (search): an author with >= 1 public story gets the
  // full treatment — "Author" in the title, a generated description when
  // they wrote no bio, and jobTitle in the Person schema. Profiles with
  // no public stories keep today's plain title/bio/schema (they are not
  // in the sitemap either, so Google is not pointed at them as authors).
  // listStories without includeDrafts counts public stories only, so the
  // gate holds even on the author's own page.
  const publicCount = storiesQuery.data?.total ?? 0;
  const isAuthor = publicCount > 0;
  const stories = storiesQuery.data?.stories ?? [];
  const authorGenres = isAuthor
    ? [...new Set(stories.map((s) => s.genre))].slice(0, 3)
    : [];
  const authorDescription = profile?.bio
    ? profile.bio
    : isAuthor && authorGenres.length > 0
      ? `${profile?.display_name} is an author on GolpoNeer writing ${authorGenres.map((g) => genreLabel(g, "en")).join(", ")} stories. Read them free, no account needed.`
      : undefined;
  const avatar = profile ? dp.avatarUrl(profile.avatar_path) : null;

  usePageMeta({
    title: profile
      ? isAuthor
        ? `${profile.display_name} · Author on GolpoNeer`
        : `${profile.display_name} | GolpoNeer`
      : SHELL_TITLE,
    description: authorDescription,
    path: `/authors/${username}`,
  });
  useJsonLd(
    profile
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Person",
              name: profile.display_name,
              url: `https://golponeer.com/authors/${profile.username}`,
              description: profile.bio || undefined,
              ...(isAuthor ? { jobTitle: "Author" } : {}),
              ...(avatar ? { image: avatar } : {}),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: t("nav", "home"),
                  item: "https://golponeer.com/",
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: profile.display_name,
                  item: `https://golponeer.com/authors/${profile.username}`,
                },
              ],
            },
            // The author's stories, as a list, so search results can
            // associate the works with the author (and offer them as
            // sub-links under the author result). Only when the author
            // has public stories; an empty list would say nothing.
            ...(isAuthor
              ? [
                  {
                    "@type": "ItemList",
                    itemListElement: stories.map((s, i) => ({
                      "@type": "ListItem",
                      position: i + 1,
                      item: {
                        "@type": "Book",
                        name: s.title,
                        url: `https://golponeer.com/stories/${s.author?.username ?? username}/${s.slug}`,
                      },
                    })),
                  },
                ]
              : []),
          ],
        })
      : null
  );

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
  if (profileQuery.isLoading) return <Layout><AuthorHeroSkeleton /></Layout>;
  if (!profile) {
    if (profileRedirectPending) return <Layout><Spinner /></Layout>;
    return (
      <Layout>
        <EmptyState title={t("errors", "notFound")} action={<ButtonLink to="/discover">{t("discover", "title")}</ButtonLink>} />
      </Layout>
    );
  }

  const isSelf = session?.user.id === profile.id;
  const visibleStories = (storiesQuery.data?.stories ?? []).filter((s) => tab === "all" || s.status === tab);

  return (
    <Layout>
      {/* Banner + overlapping avatar, the reference's structure in the
          site's own palette (no illustration asset exists for the
          reference's pen-and-leaf pattern). */}
      <div className="-mx-4 bg-gradient-to-b from-sage-dark via-sage to-paper" aria-hidden>
        <div className="h-32 sm:h-40 lg:h-52" />
      </div>
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
        <div className="-mt-14 shrink-0 rounded-full ring-4 ring-gold sm:-mt-[72px] lg:-mt-[88px]">
          <Avatar name={profile.display_name} size="xl" src={dp.avatarUrl(profile.avatar_path)} />
        </div>
        <div className="min-w-0 flex-1 sm:pb-2">
          <h1 className="font-serif text-3xl font-bold sm:text-4xl">{profile.display_name}</h1>
          <p className="text-ink-faint">@{profile.username}</p>
          {profile.bio && <p className="mt-2 max-w-2xl whitespace-pre-line text-ink-soft">{profile.bio}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        {session && !isSelf && (
          <>
            <Button
              variant={followQuery.data?.following ? "secondary" : "primary"}
              onClick={() => followMutation.mutate()}
              disabled={followMutation.isPending}
            >
              {followQuery.data?.following ? t("story", "following") : `+ ${t("story", "follow")}`}
            </Button>
            <Button variant="ghost" onClick={() => setReportOpen(true)}>{t("story", "report")}</Button>
          </>
        )}
        <p className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm">
          <span><strong>{storiesQuery.data?.total ?? storiesQuery.data?.stories.length ?? 0}</strong> {t("story", "stories")}</span>
          <span aria-hidden>·</span>
          <span><strong>{followQuery.data?.count ?? 0}</strong> {t("story", "followers")}</span>
        </p>
      </div>

      <div className="mt-8 flex gap-6 overflow-x-auto overflow-y-hidden" role="tablist">
        {([
          { key: "all" as const, label: t("story", "allStories") },
          { key: "ongoing" as const, label: t("story", "ongoing") },
          { key: "complete" as const, label: t("story", "complete") },
          { key: "keepsakes" as const, label: t("story", "keepsakes") },
        ]).map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            className={`shrink-0 border-b-2 pb-2 font-medium ${tab === tb.key ? "border-river text-river" : "border-transparent text-ink-soft"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {/* Faint rule as its own line below the tabs: the old -mb-px
          overlap made the tab row 1px taller than its box and drew a
          miniature vertical scrollbar on desktop. */}
      <div className="h-px bg-ink/10" aria-hidden />
      {tab === "keepsakes" ? (
        keepsakesQuery.isLoading ? (
          <div className="mt-6 flex max-w-2xl flex-col gap-4">
            {[0, 1, 2].map((i) => <KeepsakeCardSkeleton key={i} />)}
          </div>
        ) : (keepsakesQuery.data ?? []).length ? (
          <div className="mt-6 flex max-w-2xl flex-col gap-4">
            {(keepsakesQuery.data ?? []).map((k) => {
              const attr = keepsakeAttribution(
                {
                  title: k.source_title,
                  author: { display_name: k.source_author_name },
                  original_author: k.source_original_author,
                  translator_name: k.source_translator_name,
                  adapter_name: k.source_adapter_name,
                },
                locale
              );
              const tpl = CARD_TEMPLATES[k.template];
              const excerpt = k.excerpt.length > 240 ? k.excerpt.slice(0, 240).trimEnd() + "…" : k.excerpt;
              return (
                <Link key={k.id} to={`/k/${k.slug}`} className="block min-w-0 rounded-xl p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6" style={{ backgroundColor: tpl.bg, color: tpl.ink }}>
                  <p className="whitespace-pre-line break-words font-serif text-lg leading-relaxed sm:text-xl">“{excerpt}”</p>
                  {k.echo && (
                    <p className="mt-4 whitespace-pre-line break-words border-l-2 pl-3 font-serif text-base italic leading-relaxed" style={{ borderColor: tpl.accent, color: tpl.faint }}>{k.echo}</p>
                  )}
                  <div className="mt-5 pt-3" style={{ borderTop: `1px solid ${tpl.rule}` }}>
                    <p className="break-words text-sm" style={{ color: tpl.faint }}>
                      {attr.title ? `${attr.title} · ${attr.author}` : attr.author}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: tpl.faint }}>
                      {t("keepsakes", "keptBy")} {k.keeper_name}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState title={t("story", "keepsakesEmpty")} />
          </div>
        )
      ) : storiesQuery.isLoading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <AuthorStoryCardSkeleton key={i} />)}
        </div>
      ) : visibleStories.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleStories.map((s) => {
            const minutes = readingMinutes(s.word_count ?? 0, s.language);
            const count = s.chapter_count ?? 0;
            return (
              <Link key={s.id} to={`/stories/${profile.username}/${s.slug}`} className="block h-full">
                <div className="flex h-full gap-3 rounded-xl bg-white p-3 shadow-card hover:shadow-lift">
                  <Cover story={s} className="aspect-[3/4] w-24 shrink-0 rounded-lg sm:w-28" thumb small />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={s.status} />
                      <Badge tone="sage">{genreLabel(s.genre, locale)}</Badge>
                    </div>
                    <h3 className="mt-2 font-serif font-semibold leading-snug clamp-2">{s.title}</h3>
                    {s.summary && <p className="mt-1 text-sm text-ink-soft clamp-2">{s.summary}</p>}
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                      <Badge tone="sage">{count} {count === 1 ? t("story", "chapterSingular") : t("story", "chapters")}</Badge>
                      {minutes > 0 && <Badge tone="sage">~{minutes} {t("story", "minRead")}</Badge>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
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
