import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useUsernameRedirect } from "../lib/use-username-redirect";
import { useStorySlugRedirect } from "../lib/use-story-slug-redirect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Avatar, Button, ButtonLink, EmptyState, Spinner } from "../components/ui";
import { CommentSkeleton, ReaderChapterSkeleton } from "../components/skeleton";
import { ReportDialog } from "../components/report-dialog";
import { PENDING_KEEP_KEY, QuoteStudio, type PendingKeepsake } from "../components/quote-studio";
import { normalizeExcerpt } from "../lib/keepsake-card";
import { readingMinutes, timeAgo, AppError, getAnonViewerId } from "../lib/utils";
import { usePageMeta, SHELL_TITLE } from "../lib/page-meta";
import type { Chapter, ReadingPosition, ReadingProgress, TiptapDoc, TiptapNode } from "../lib/types";

/** Offset below the sticky header so a restored block isn't hidden behind it. */
const RESTORE_PAD = 88;

/** Render Tiptap JSON as React (reader-safe subset). */
function renderNode(node: TiptapNode, key: number): React.ReactNode {
  const children = (node.content ?? []).map((c, i) => renderNode(c, i));
  const marks = node.marks ?? [];
  let text: React.ReactNode = node.text ?? null;
  for (const m of marks) {
    if (m.type === "bold") text = <strong key={m.type}>{text}</strong>;
    else if (m.type === "italic") text = <em key={m.type}>{text}</em>;
    else if (m.type === "underline") text = <u key={m.type}>{text}</u>;
    else if (m.type === "strike") text = <s key={m.type}>{text}</s>;
    else if (m.type === "code") text = <code key={m.type} className="rounded bg-ink/10 px-1">{text}</code>;
  }
  switch (node.type) {
    case "text": return <span key={key}>{text}</span>;
    case "paragraph": return <p key={key}>{children.length ? children : <br />}</p>;
    case "heading": {
      const level = Math.min(3, Math.max(1, (node.attrs?.level as number) || 1));
      const Tag = `h${level}` as "h1" | "h2" | "h3";
      return <Tag key={key}>{children}</Tag>;
    }
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "bulletList": return <ul key={key}>{children}</ul>;
    case "orderedList": return <ol key={key}>{children}</ol>;
    case "listItem": return <li key={key}>{children}</li>;
    case "horizontalRule": return <hr key={key} />;
    case "hardBreak": return <br key={key} />;
    default: return <span key={key}>{children}</span>;
  }
}

export function ChapterBody({ doc }: { doc: TiptapDoc }) {
  return (
    <div className="richtext">
      {(doc.content ?? []).map((n, i) => renderNode(n, i))}
    </div>
  );
}

type ReaderTheme = "light" | "warm" | "sepia" | "dark";
type ReaderWidth = "narrow" | "medium" | "wide";
type ReaderPrefs = { theme: ReaderTheme; fontSize: number; lineHeight: number; width: ReaderWidth };

const READER_KEY = "golpoghor-reader-prefs";

const FONT_SIZE_MAP: Record<string, number> = { sm: 17, md: 19, lg: 21, xl: 24 };
const LINE_HEIGHTS = [1.4, 1.6, 1.8, 2.0];
const snapLineHeight = (v: number) =>
  LINE_HEIGHTS.reduce((best, cur) => (Math.abs(cur - v) < Math.abs(best - v) ? cur : best), LINE_HEIGHTS[0]);

// Old saved prefs used stepped sizes (sm/md/lg/xl) and named spacings;
// migrate them so existing readers keep (nearly) the look they chose.
function loadPrefs(): ReaderPrefs {
  const fallback: ReaderPrefs = { theme: "light", fontSize: 19, lineHeight: 1.8, width: "medium" };
  try {
    const raw = localStorage.getItem(READER_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Record<string, unknown>>;
    if (!saved || typeof saved !== "object") return fallback;
    const theme = (["light", "warm", "sepia", "dark"] as ReaderTheme[]).includes(saved.theme as ReaderTheme)
      ? (saved.theme as ReaderTheme)
      : fallback.theme;
    const fontSize =
      typeof saved.fontSize === "number"
        ? Math.min(24, Math.max(17, Math.round(saved.fontSize)))
        : typeof saved.fontSize === "string" && FONT_SIZE_MAP[saved.fontSize] !== undefined
          ? FONT_SIZE_MAP[saved.fontSize]
          : fallback.fontSize;
    const lineHeight =
      typeof saved.lineHeight === "number"
        ? snapLineHeight(saved.lineHeight)
        : typeof saved.lineSpacing === "number"
          ? snapLineHeight(saved.lineSpacing)
          : typeof saved.lineSpacing === "string"
            ? snapLineHeight({ normal: 1.6, relaxed: 1.85, loose: 2.2 }[saved.lineSpacing] ?? fallback.lineHeight)
            : fallback.lineHeight;
    const width = (["narrow", "medium", "wide"] as ReaderWidth[]).includes(saved.width as ReaderWidth)
      ? (saved.width as ReaderWidth)
      : fallback.width;
    return { theme, fontSize, lineHeight, width };
  } catch { /* ignore */ }
  return fallback;
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ReaderSettings({
  prefs,
  setPrefs,
  open,
  onOpenChange,
}: {
  prefs: ReaderPrefs;
  setPrefs: (p: ReaderPrefs) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useApp();
  const settingsRef = useRef<HTMLDivElement | null>(null);
  // Tapping anywhere outside the button + panel closes it. (The old
  // backdrop div could not do this: the bar's backdrop-blur made the
  // bar a containing block, shrinking the "full-screen" backdrop to
  // the bar itself — so taps on the article never reached it.)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);
  const row = "flex items-center justify-between gap-3 py-2";
  const segBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-river text-white" : "bg-sage text-ink hover:bg-sage-dark"}`;
  // Adjusting stays in the panel (a slider cannot work if every change
  // closes it); the panel closes on outside tap or the Aa toggle.
  const update = (p: ReaderPrefs) => {
    setPrefs(p);
  };
  return (
    <div ref={settingsRef} className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={t("reader", "theme")}
        className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium hover:bg-sage"
      >
        Aa
      </button>
      {open && (
        <>
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-4 shadow-lift">
            <div>
              <span className="text-sm font-medium">{t("reader", "theme")}</span>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {([
                  { key: "light", bg: "#ffffff", label: t("reader", "themeLight") },
                  { key: "warm", bg: "#F7F3E9", label: t("reader", "themeWarm") },
                  { key: "sepia", bg: "#f4ecd8", label: t("reader", "themeSepia") },
                  { key: "dark", bg: "#1c2422", label: t("reader", "themeDark") },
                ] as const).map((th) => (
                  <button key={th.key} onClick={() => update({ ...prefs, theme: th.key })} className="flex flex-col items-center gap-1">
                    <span
                      className={`relative block h-12 w-full rounded-lg border ${prefs.theme === th.key ? "border-gold ring-2 ring-gold" : "border-ink/15"}`}
                      style={{ backgroundColor: th.bg }}
                    >
                      {prefs.theme === th.key && (
                        <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-white">✓</span>
                      )}
                    </span>
                    <span className="text-xs">{th.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("reader", "fontSize")}</span>
                <span className="text-sm font-medium">{prefs.fontSize}px</span>
              </div>
              <input
                type="range"
                min={17}
                max={24}
                step={1}
                value={prefs.fontSize}
                onChange={(e) => update({ ...prefs, fontSize: Number(e.target.value) })}
                aria-label={t("reader", "fontSize")}
                className="mt-2 w-full accent-gold"
              />
              <div className="flex justify-between text-xs text-ink-faint">
                <span>17px</span>
                <span>24px</span>
              </div>
            </div>
            <div className={row}>
              <span className="text-sm font-medium">{t("reader", "lineSpacing")}</span>
              <div className="flex gap-1">
                {[1.4, 1.6, 1.8, 2.0].map((v) => (
                  <button key={v} className={segBtn(prefs.lineHeight === v)} onClick={() => update({ ...prefs, lineHeight: v })}>
                    {v.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className={row}>
              <span className="text-sm font-medium">{t("reader", "readingWidth")}</span>
              <div className="flex gap-1">
                {(["narrow", "medium", "wide"] as ReaderWidth[]).map((w) => (
                  <button key={w} className={segBtn(prefs.width === w)} onClick={() => update({ ...prefs, width: w })}>
                    {t("reader", w === "narrow" ? "widthNarrow" : w === "medium" ? "widthMedium" : "widthWide")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Theme colours shared by the article card and the comment cards, so
// the comments follow the article instead of staying white boxes.
// Every theme carries the same 1px border box (visible only on warm,
// where paper-on-paper needs an edge) — without it, switching to warm
// narrowed the text column by 2px and rewrapped every line below.
function themeBgText(theme: ReaderTheme) {
  return theme === "dark"
    ? "bg-[#1c2422] text-[#e8e4d8]"
    : theme === "sepia"
      ? "bg-[#f4ecd8] text-[#43382e]"
      : theme === "warm"
        ? "bg-paper text-ink"
        : "bg-white text-ink";
}
function themeCardCls(theme: ReaderTheme) {
  return `${themeBgText(theme)} border ${theme === "warm" ? "border-ink/10" : "border-transparent"}`;
}
function themeFaintCls(theme: ReaderTheme) {
  return theme === "dark" ? "text-[#e8e4d8]/70" : "text-ink-faint";
}

function Comments({ chapterId, className, theme }: { chapterId: string; className?: string; theme: ReaderTheme }) {
  const { t, locale, dp, session, profile } = useApp();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const commentsQuery = useQuery({
    queryKey: ["comments", chapterId],
    queryFn: () => dp.listComments(chapterId),
  });

  const createMutation = useMutation({
    mutationFn: () => dp.createComment(chapterId, body),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["comments", chapterId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dp.deleteComment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", chapterId] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => dp.updateComment(id, text),
    onSuccess: () => {
      setEditId(null);
      queryClient.invalidateQueries({ queryKey: ["comments", chapterId] });
    },
  });

  const err =
    createMutation.error instanceof AppError
      ? t("errors", createMutation.error.code)
      : createMutation.error
        ? t("errors", "generic")
        : updateMutation.error instanceof AppError
          ? t("errors", updateMutation.error.code)
          : updateMutation.error
            ? t("errors", "generic")
            : null;

  return (
    <section className={`mx-3 sm:mx-auto mt-12 ${className ?? "max-w-reader"}`} aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="font-serif text-2xl font-bold">
        {t("comments", "title")} ({commentsQuery.data?.length ?? 0})
      </h2>
      <div className="mt-2 h-0.5 w-10 bg-gold" aria-hidden />

      {session ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) createMutation.mutate();
          }}
        >
          <label htmlFor="comment-body" className="sr-only">{t("comments", "placeholder")}</label>
          <textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("comments", "placeholder")}
            rows={3}
            maxLength={2000}
            className={`w-full rounded-xl border border-ink/15 px-4 py-3 focus:border-river focus:outline-none focus:ring-1 focus:ring-river ${themeBgText(theme)}`}
          />
          {err && <p className="mt-1 text-sm text-clay" role="alert">{err}</p>}
          <div className="mt-2 flex justify-end">
            <Button type="submit" disabled={createMutation.isPending || !body.trim()}>
              {t("comments", "post")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 rounded-xl bg-sage px-4 py-3 text-sm">
          <Link to={`/login?next=${encodeURIComponent(window.location.pathname)}`} className="font-medium text-river hover:underline">
            {t("comments", "signInToComment")}
          </Link>
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {commentsQuery.isLoading ? (
          <>
            {[0, 1, 2].map((i) => <CommentSkeleton key={i} />)}
          </>
        ) : commentsQuery.data?.length ? (
          commentsQuery.data.map((c) => (
            <article key={c.id} className={`rounded-xl p-4 shadow-card ${themeCardCls(theme)}`}>
              <div className="flex items-center gap-2">
                <Avatar name={c.author?.display_name ?? "?"} size="sm" src={dp.avatarUrl(c.author?.avatar_path ?? null)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.author?.display_name}</p>
                  <p className={`text-xs ${themeFaintCls(theme)}`}>{timeAgo(c.created_at, locale)}{c.edited_at ? ` · ${t("comments", "edited")}` : ""}</p>
                </div>
                {(c.author_id === profile?.id) && (
                  <>
                    <button
                      onClick={() => { setEditId(c.id); setEditBody(c.body); }}
                      className={`text-xs underline hover:text-clay ${themeFaintCls(theme)}`}
                    >
                      {t("comments", "edit")}
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className={`text-xs underline hover:text-clay ${themeFaintCls(theme)}`}
                    >
                      {t("comments", "delete")}
                    </button>
                  </>
                )}
                {session && c.author_id !== profile?.id && (
                  <button
                    onClick={() => setReportId(c.id)}
                    className={`text-xs underline hover:text-clay ${themeFaintCls(theme)}`}
                  >
                    {t("story", "report")}
                  </button>
                )}
              </div>
              {editId === c.id ? (
                <form
                  className="mt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editBody.trim()) updateMutation.mutate({ id: c.id, text: editBody });
                  }}
                >
                  <label htmlFor={`comment-edit-${c.id}`} className="sr-only">{t("comments", "edit")}</label>
                  <textarea
                    id={`comment-edit-${c.id}`}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className={`w-full rounded-xl border border-ink/15 px-4 py-3 focus:border-river focus:outline-none focus:ring-1 focus:ring-river ${themeBgText(theme)}`}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" type="button" onClick={() => setEditId(null)} className={theme === "dark" ? "!text-[#e8e4d8]/80 hover:!bg-white/10 hover:!text-white" : undefined}>
                      {t("common", "cancel")}
                    </Button>
                    <Button size="sm" type="submit" disabled={updateMutation.isPending || !editBody.trim()}>
                      {t("comments", "save")}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="mt-2 whitespace-pre-line text-[15px]">{c.body}</p>
              )}
            </article>
          ))
        ) : (
          <p className="text-sm text-ink-faint">{t("comments", "empty")}</p>
        )}
      </div>

      <ReportDialog
        open={!!reportId}
        onClose={() => setReportId(null)}
        targetType="comment"
        targetId={reportId ?? ""}
        targetLabel={t("comments", "title")}
      />
    </section>
  );
}

export function ReaderPage() {
  const { username = "", slug = "", chapterSlug = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restart = searchParams.get("restart") === "1";
  const { t, dp, session, isModerator } = useApp();
  const queryClient = useQueryClient();
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The bar is not permanent: it slides away while scrolling down
  // (reading) and returns on any upward scroll, so it never traps
  // the reader. While the settings panel is open it stays visible.
  const lastScrollY = useRef(0);
  const [barHidden, setBarHidden] = useState(false);
  // Back-to-top shares the bar's scroll logic exactly: it only
  // appears on an upward scroll past 120px, and hides again on any
  // downward scroll — same rule, same threshold as the bar.
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastScrollY.current && y > 120) setBarHidden(true);
      else if (y < lastScrollY.current) setBarHidden(false);
      if (y > lastScrollY.current || y <= 120) setShowTop(false);
      else if (y < lastScrollY.current) setShowTop(true);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Custom chapter menu (replacing the native select, which looked
  // default and whose picker took over the phone screen): an anchored
  // panel, trigger-width, capped height with a scroll for long
  // stories. Like the settings panel, it forces the bar visible.
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  const chapterMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chapterMenuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (chapterMenuRef.current && !chapterMenuRef.current.contains(e.target as Node)) setChapterMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChapterMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [chapterMenuOpen]);
  const [reportOpen, setReportOpen] = useState(false);
  // Quote Studio (V4-27b): a passage selection inside the chapter body
  // surfaces a floating button; the modal overlays the reader, so opening
  // it never navigates away or loses the reading position.
  const [studio, setStudio] = useState<{
    excerpt: string;
    template?: PendingKeepsake["template"];
    echo?: string;
  } | null>(null);
  const [studioBtn, setStudioBtn] = useState<{ top: number; left: number } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const endMarkRef = useRef<HTMLParagraphElement | null>(null);
  /** Saves are blocked until the restore decision for this chapter has settled,
   *  so loading/initial state can never overwrite a valid saved position. */
  const readyRef = useRef(false);
  const restoredForRef = useRef<string | null>(null);
  /** Latest position measured while the chapter DOM was alive. Unmount and
   *  hide handlers persist THIS value — by cleanup time the refs/DOM are
   *  already gone, so measuring then would save garbage. */
  const lastPositionRef = useRef<ReadingPosition | null>(null);
  /** True once the user has actually scrolled in this chapter. Guards the
   *  unmount/hide save: on a ?restart=1 visit the restore effect plants
   *  a 0 position, and saving it unseen would overwrite real progress. */
  const scrolledRef = useRef(false);
  // Chapters already auto-marked finished in this reader session, so one
  // long scroll to the bottom marks once instead of firing per scroll event.
  const markedRef = useRef<string | null>(null);

  const setPrefs = (p: typeof prefs) => {
    setPrefsState(p);
    try {
      localStorage.setItem(READER_KEY, JSON.stringify(p));
    } catch { /* ignore */ }
  };

  const storyQuery = useQuery({
    queryKey: ["story", username, slug],
    queryFn: () => dp.getStoryBySlug(username, slug),
  });
  const story = storyQuery.data;

  // Owners and moderators may open hidden chapters (queue links,
  // previews); ordinary readers still see published chapters only.
  // The flag is part of the key so a moderator never reads a reader's
  // published-only cache entry (or vice versa).
  const canViewHidden = isModerator || session?.user.id === story?.author_id;
  const chaptersQuery = useQuery({
    queryKey: ["chapters", story?.id, canViewHidden ? "all" : "published"],
    queryFn: () => dp.listChapters(story!.id, { publishedOnly: !canViewHidden }),
    enabled: !!story,
  });
  // Prev/Next stay on published chapters: for authors/moderators the
  // query returns all statuses, and an unfiltered list would offer a
  // "Next" step into an unpublished draft. The current chapter is kept
  // so direct links to hidden chapters still load (and still resolve
  // chapterMeta, which gates the chapter query).
  const chapters = useMemo(
    () => (chaptersQuery.data ?? []).filter((c) => c.status === "published" || c.slug === chapterSlug),
    [chaptersQuery.data, chapterSlug]
  );
  const index = chapters.findIndex((c) => c.slug === chapterSlug);
  const chapterMeta = index >= 0 ? chapters[index] : undefined;
  const prev = index > 0 ? chapters[index - 1] : undefined;
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined;

  // The chapter list is light (V4-04) — the open chapter's full body loads
  // on its own, one chapter at a time.
  const chapterQuery = useQuery({
    queryKey: ["chapter", story?.id, chapterSlug, canViewHidden ? "all" : "published"],
    queryFn: () => dp.getChapterBySlug(story!.id, chapterSlug, { publishedOnly: !canViewHidden }),
    enabled: !!story && !!chapterMeta,
  });
  const chapter: Chapter | undefined = chapterQuery.data ?? undefined;

  const storyPath = `/stories/${username}/${slug}`;
  const chapterUrl = (c: { slug: string }) => `${storyPath}/${c.slug}`;

  usePageMeta({
    title:
      story && chapter
        ? `${chapter.title} — ${story.title} | GolpoNeer`
        : SHELL_TITLE,
    description: story?.summary,
    path: story && chapter ? `${storyPath}/${chapter.slug}` : storyPath,
  });

  // The reader's own progress for this story (shared cache with the story page).
  const progressQuery = useQuery({
    queryKey: ["progress", story?.id],
    queryFn: () => dp.getProgress(story!.id),
    enabled: !!story && !!session,
  });

  /** How far through the CHAPTER the reader is (0 at its top, 1 when its
   *  end reaches the viewport bottom), measured on the article element.
   *  The page keeps growing below the chapter (comments, footer), so a
   *  page-based ratio stops at ~75% on a fully read chapter and the
   *  end-of-chapter auto-mark never fires. For a chapter shorter than
   *  the viewport, the fraction is how much of it is on screen. */
  const articleFraction = (): number | null => {
    const article = articleRef.current;
    if (!article || !article.isConnected) return null;
    const r = article.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.height > vh) return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
    return Math.min(1, Math.max(0, (vh - r.top) / Math.max(1, r.height)));
  };

  /** Capture the current position: a content-block anchor (preferred) plus
   *  the chapter fraction (for the % displays and the fallback restore).
   *  Returns null when the chapter body is not live DOM (route
   *  transition/teardown) — such measurements are garbage and must never
   *  be persisted. */
  const capturePosition = (): ReadingPosition | null => {
    const root = bodyRef.current;
    if (!root || !root.isConnected) return null;
    const el = document.documentElement;
    const ratio = articleFraction() ?? el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    const blocks = root.querySelectorAll(":scope > .richtext > *");
    let blockIndex: number | null = null;
    let blockOffset: number | null = null;
    if (blocks.length) {
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].getBoundingClientRect();
        if (r.bottom > 0) {
          blockIndex = i;
          blockOffset = r.height > 0 ? Math.min(1, Math.max(0, -r.top / r.height)) : 0;
          break;
        }
      }
    }
    return { scrollRatio: ratio, blockIndex, blockOffset };
  };

  /** Persist the latest measured position. Blocked until restore has settled.
   *  Also refreshes the shared progress cache so the story page's
   *  Continue/Start button reflects the save immediately. */
  const saveNow = (cap: number) => {
    if (!story || !chapter || !session || !readyRef.current) return;
    const pos = lastPositionRef.current;
    if (!pos) return;
    const ratio = Math.min(cap, pos.scrollRatio);
    dp.saveProgress(story.id, chapter.id, { ...pos, scrollRatio: ratio })
      .then(() => {
        const nextProgress: ReadingProgress = {
          user_id: session.user.id,
          story_id: story.id,
          chapter_id: chapter.id,
          scroll_ratio: ratio,
          block_index: pos.blockIndex ?? null,
          block_offset: pos.blockOffset ?? null,
          updated_at: new Date().toISOString(),
        };
        queryClient.setQueryData<ReadingProgress | null>(["progress", story.id], nextProgress);
      })
      .catch(() => {});
  };

  /** Automatic chapter finish: the reader has reached the end of a
   *  published chapter when the "End of chapter" mark is on screen, or
   *  the chapter fraction is >= 0.99 (same moment the gold bar hits
   *  100%). Measured on the chapter, never the page — comments below
   *  the chapter must not move the goalposts. The reader can still
   *  unmark it by hand in Contents (accidental scrolls). Draft previews
   *  never auto-mark. */
  const markIfAtEnd = (ratio: number, allowEndMark = true) => {
    if (!story || !chapter || !session) return;
    if (chapter.status !== "published") return;
    // At teardown the end-mark ref may already point at the NEXT chapter
    // (refs update before effect cleanup runs), so cleanup passes
    // allowEndMark=false and marks on the ratio alone.
    const endVisible = allowEndMark && endMarkRef.current
      ? endMarkRef.current.getBoundingClientRect().top <= window.innerHeight + 20
      : false;
    if (!endVisible && ratio < 0.99) return;
    if (markedRef.current === chapter.id) return;
    markedRef.current = chapter.id;
    dp.setChapterFinished(story.id, chapter.id, true)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["finishedChapters", story.id] });
        queryClient.invalidateQueries({ queryKey: ["finished", story.id] });
        queryClient.invalidateQueries({ queryKey: ["finishedStories"] });
        queryClient.invalidateQueries({ queryKey: ["inProgress"] });
      })
      .catch(() => {});
  };

  // Restore the saved position once this chapter has rendered, or start at
  // the top when there is nothing to restore (or the user restarted manually).
  useEffect(() => {
    if (!story || !chapter) return;
    if (restoredForRef.current === chapter.id) return;
    // Wait for the saved position to load before deciding there is none —
    // otherwise a cold-cache visit would mark the chapter "restored" at the
    // top and the real restore would never run.
    if (session && progressQuery.isLoading) return;
    readyRef.current = false;
    const progress = progressQuery.data;
    const canRestore =
      !!session &&
      !restart &&
      progress?.chapter_id === chapter.id &&
      (progress.block_index != null || progress.scroll_ratio > 0.01);
    if (!canRestore) {
      window.scrollTo({ top: 0 });
      lastPositionRef.current = { scrollRatio: 0, blockIndex: 0, blockOffset: 0 };
      readyRef.current = true;
      restoredForRef.current = chapter.id;
      return;
    }
    let cancelled = false;
    let raf = 0;
    const restore = () => {
      if (cancelled) return;
      const blocks = bodyRef.current?.querySelectorAll(":scope > .richtext > *");
      const idx = progress.block_index;
      if (blocks && idx != null && idx >= 0 && idx < blocks.length) {
        // Block anchor: fraction-based offset survives font-size/layout changes.
        const block = blocks[idx] as HTMLElement;
        const r = block.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, progress.block_offset ?? 0));
        const target = r.top + window.scrollY + frac * r.height - RESTORE_PAD;
        window.scrollTo({ top: Math.max(0, target) });
      } else {
        // Fallback: the saved fraction is chapter-based (see
        // capturePosition), so map it back through the article's own
        // geometry, not the page's — otherwise comments below the
        // chapter would push the landing spot past the chapter end.
        const article = articleRef.current;
        if (article) {
          const r = article.getBoundingClientRect();
          const target = r.top + window.scrollY + progress.scroll_ratio * Math.max(1, r.height - window.innerHeight);
          window.scrollTo({ top: Math.max(0, target) });
        } else {
          const el = document.documentElement;
          window.scrollTo({ top: Math.max(0, progress.scroll_ratio * (el.scrollHeight - el.clientHeight)) });
        }
      }
      readyRef.current = true;
      restoredForRef.current = chapter.id;
      lastPositionRef.current = {
        scrollRatio: progress.scroll_ratio,
        blockIndex: progress.block_index,
        blockOffset: progress.block_offset,
      };
    };
    // Wait for layout and fonts so the anchor lands in the right place.
    const start = () => {
      raf = requestAnimationFrame(() => requestAnimationFrame(restore));
    };
    if (document.fonts?.ready) {
      Promise.race([document.fonts.ready, new Promise((res) => setTimeout(res, 1200))]).then(start);
    } else {
      start();
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [story?.id, chapter?.id, session, restart, progressQuery.data, progressQuery.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reading progress: measure on every scroll (cheap), persist throttled;
  // also persist when the page is hidden or the reader unmounts — using the
  // last measured position, never a fresh measurement at teardown time.
  useEffect(() => {
    if (!story || !chapter || !session) return;
    // Fresh chapter visit: allow auto-mark again (the reader may have
    // unmarked this chapter in Contents and come back to re-read it).
    markedRef.current = null;
    scrolledRef.current = false;
    const scheduleSave = () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveNow(0.99), 800);
    };
    const onScroll = () => {
      if (!readyRef.current) return;
      const pos = capturePosition();
      if (!pos) return; // transition/teardown measurement — ignore
      lastPositionRef.current = pos;
      scrolledRef.current = true;
      markIfAtEnd(pos.scrollRatio);
      scheduleSave();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden" && (!restart || scrolledRef.current)) saveNow(1);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHidden);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      // Leaving at the bottom (e.g. restored at the end, then closed)
      // counts as having reached the end too. Ratio only here — see
      // markIfAtEnd on why the end-mark must not be consulted at teardown.
      if (lastPositionRef.current) markIfAtEnd(lastPositionRef.current.scrollRatio, false);
      if (!restart || scrolledRef.current) saveNow(1);
    };
  }, [story, chapter, session, dp, restart]);

  // Count the story view + the chapter view once per viewer per day
  // (dedup + exclusions in provider). Signed-out visitors count too, via
  // a random per-browser id — no IP address, no identity.
  useEffect(() => {
    if (!story || !chapter) return;
    if (session && session.user.id === story.author_id) return;
    if (story.status !== "ongoing" && story.status !== "complete") return;
    if (chapter.status !== "published") return;
    const anonId = session ? undefined : getAnonViewerId();
    dp.recordStoryView(story.id, anonId).catch(() => {});
    dp.recordChapterView(chapter.id, anonId).catch(() => {});
  }, [story?.id, chapter?.id, chapter?.status, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2 dwell: measure active reading seconds for this chapter.
  // Active = tab visible + scroll/touch/keypress within the last 60s.
  // The accumulator grows 1s per interval tick (never wall-clock
  // deltas, so a timer waking from sleep cannot add a jump). Sends
  // use Snapshot-and-Drain: the amount is zeroed synchronously
  // before the call and restored only if the call throws — a false
  // return (at-cap) still counts as sent. Hardening (Argon recheck):
  // the accumulator is effect-local and a cancelled flag blocks
  // restore after cleanup, so a failed flush can never restore its
  // seconds into the next chapter's tracker.
  useEffect(() => {
    if (!story || !chapter) return;
    if (session && session.user.id === story.author_id) return;
    if (story.status !== "ongoing" && story.status !== "complete") return;
    if (chapter.status !== "published") return;
    const anonId = session ? undefined : getAnonViewerId();
    const chapterId = chapter.id;
    let accum = 0;
    let lastActive = Date.now();
    let cancelled = false;
    const onActivity = () => {
      lastActive = Date.now();
    };
    const flushDwell = () => {
      if (accum <= 0) return;
      const toSend = Math.min(accum, 60);
      accum = 0;
      dp.recordChapterDwell(chapterId, toSend, anonId).catch(() => {
        if (!cancelled) accum = Math.min(accum + toSend, 60);
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushDwell();
    };
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    let ticks = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActive <= 60_000) {
        accum += 1;
      }
      ticks += 1;
      if (ticks % 30 === 0) flushDwell();
    }, 1000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      flushDwell(); // chapter change / unmount: send what's left
      cancelled = true;
    };
  }, [story?.id, chapter?.id, chapter?.status, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quote Studio selection: any non-collapsed selection inside the chapter
  // body shows the floating button. The button is deliberately NOT hidden
  // on collapsed selections: tapping it (and mobile selection handles)
  // collapses the selection first, which used to unmount the button
  // before the tap could land. It hides on a tap anywhere else, and
  // re-pins under the selection on scroll instead of vanishing.
  const btnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!story || !chapter) return;
    const positionFromSelection = (): { top: number; left: number } | null => {
      const sel = window.getSelection();
      const root = bodyRef.current;
      if (!sel || sel.isCollapsed || !root || !root.contains(sel.anchorNode)) return null;
      if (sel.toString().trim().length < 1) return null;
      try {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        return {
          top: Math.min(r.bottom + 8, window.innerHeight - 56),
          left: Math.min(Math.max(r.left + r.width / 2, 84), window.innerWidth - 84),
        };
      } catch {
        return null;
      }
    };
    const onSelect = () => {
      if (studio) return;
      const pos = positionFromSelection();
      if (pos) setStudioBtn(pos);
      else if (window.getSelection() && !window.getSelection()!.isCollapsed) setStudioBtn(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (studio) return;
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      setStudioBtn(null);
    };
    const onScroll = () => {
      if (studio) return;
      setStudioBtn(positionFromSelection());
    };
    document.addEventListener("selectionchange", onSelect);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", onSelect);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [story, chapter, studio]);

  // Signed-out selection survives sign-in: the studio stashes the draft in
  // sessionStorage before routing to /login; on return, reopen it here.
  useEffect(() => {
    if (!story || !chapter || !session) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_KEEP_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as PendingKeepsake;
      if (pending.storyId === story.id && pending.chapterId === chapter.id) {
        setStudio({ excerpt: pending.excerpt, template: pending.template, echo: pending.echo });
        sessionStorage.removeItem(PENDING_KEEP_KEY);
      }
    } catch {
      /* corrupt stash — ignore */
    }
  }, [story, chapter, session]);

  // Top progress bar: how far the reader has scrolled THROUGH the
  // chapter (0% at the top, 100% when the chapter's end reaches the
  // viewport bottom), written straight to the bar's DOM node so
  // scrolling never re-renders the page.
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const update = () => {
      const bar = progressBarRef.current;
      if (!bar) return;
      const ratio = articleFraction() ?? 0;
      bar.style.width = `${Math.round(ratio * 100)}%`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [chapter?.id]);

  // The theme changes ONLY the reading card — the page background
  // stays the site's paper (v1 also tinted the page, which the owner
  // rejected). Warm Paper's card matches the page, so it alone gets
  // a faint border to keep its edge. The comment cards share this
  // helper, so they follow the article theme exactly.
  const cardCls = themeCardCls(prefs.theme);
  // Every theme carries the same 1px border box (visible only on warm,
  // where paper-on-paper needs an edge). Without it, switching to warm
  // narrowed the text column by 2px and rewrapped every line below.
  const widthCls =
    prefs.width === "narrow"
      ? "max-w-[36rem]"
      : prefs.width === "wide"
        ? "max-w-[52rem]"
        : "max-w-reader";
  // On phones every column width is wider than the screen, so the
  // width setting was a no-op there — and the card had TWO padding
  // layers (page margins outside, card padding inside) eating the
  // width. So on phones the card goes full-bleed with square corners
  // and only ONE padding layer inside it, which the width setting
  // controls (narrow = roomy margins, wide = nearly the full screen).
  // Desktop keeps the max-width columns and the floating card.
  const wrapPadCls = prefs.width === "narrow" ? "px-0 sm:px-5" : prefs.width === "wide" ? "px-0 sm:px-2" : "px-0 sm:px-4";
  const artPadCls = prefs.width === "narrow" ? "px-8" : prefs.width === "wide" ? "px-2" : "px-5";
  // The floating keepsake button must stay visible on every reader
  // theme: it takes the theme's text colour as its background and the
  // theme's background as its text (dark page → light button, and
  // vice versa). A fixed dark button vanished on the dark theme.
  const studioBtnCls =
    prefs.theme === "dark"
      ? "bg-[#e8e4d8] text-[#1c2422]"
      : prefs.theme === "sepia"
        ? "bg-[#43382e] text-[#f4ecd8]"
        : "bg-ink text-paper";


  const storyRedirectPending = useUsernameRedirect(
    username,
    !storyQuery.isLoading && !story,
    (next) => `/stories/${next}/${slug}/${chapterSlug}`
  );
  const slugRedirectPending = useStorySlugRedirect(
    username,
    slug,
    !storyQuery.isLoading && !story && !storyRedirectPending,
    (nextUser, nextSlug) => `/stories/${nextUser}/${nextSlug}/${chapterSlug}${window.location.search}`
  );
  if (storyQuery.isLoading || chaptersQuery.isLoading || chapterQuery.isLoading) return <Layout><ReaderChapterSkeleton /></Layout>;
  if (!story || !chapter) {
    if (!story && (storyRedirectPending || slugRedirectPending)) return <Layout><Spinner /></Layout>;
    return (
      <Layout>
        <EmptyState title={t("errors", "notFound")} action={<ButtonLink to="/discover">{t("discover", "title")}</ButtonLink>} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={`-mx-4 min-h-screen ${wrapPadCls} pt-4 pb-8 bg-paper`}>
        {/* Gold progress bar pinned to the viewport top */}
        <div className="fixed inset-x-0 top-0 z-50 h-1 bg-ink/10" aria-hidden="true">
          <div ref={progressBarRef} className="h-full bg-gold" style={{ width: "0%" }} />
        </div>

        {/* Floating reader bar: back + title + chapter jump + settings.
            It replaces the site header on reading pages (Layout skips
            Header on chapter routes). On phones the title hides — the
            article eyebrow just below still names the story. */}
        <div className={`sticky top-3 z-40 mx-3 sm:mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-ink/10 bg-sage px-2 py-1.5 shadow-lift transition-all duration-300 ${barHidden && !settingsOpen && !chapterMenuOpen ? "-translate-y-[130%] opacity-0 pointer-events-none" : ""}`}>
          <Link
            to={storyPath}
            state={{ fromReader: true }}
            aria-label={t("common", "back")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white text-ink shadow-sm"
          >
            <ChevronLeftIcon className="h-[18px] w-[18px]" />
          </Link>
          <span className="hidden min-w-0 flex-1 truncate font-medium sm:block">{story.title}</span>
          <div ref={chapterMenuRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setChapterMenuOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={chapterMenuOpen}
              className="flex w-full items-center gap-2 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-left text-sm font-medium"
            >
              <span className="min-w-0 flex-1 truncate">
                {t("story", "chapter")} {index + 1}: {chapter.title}
              </span>
              <ChevronDownIcon className={`h-[18px] w-[18px] shrink-0 transition-transform ${chapterMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {chapterMenuOpen && (
              <div role="listbox" aria-label={t("story", "chapter")} className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-ink/10 bg-white p-1 shadow-lift">
                {chapters.map((c, i) => {
                  const current = c.slug === chapter.slug;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={current}
                      onClick={() => {
                        setChapterMenuOpen(false);
                        if (!current) navigate(chapterUrl(c));
                      }}
                      className={`flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-sm ${current ? "bg-sage font-semibold text-river" : "hover:bg-sage"}`}
                    >
                      <span className="shrink-0 text-ink-faint">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {current && <span className="shrink-0">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <ReaderSettings prefs={prefs} setPrefs={setPrefs} open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>

        <div className={`mx-auto mt-6 ${widthCls}`}>
        <article ref={articleRef} className={`rounded-none sm:rounded-2xl py-8 shadow-card sm:px-10 sm:py-12 ${artPadCls} ${cardCls}`}>
          <header className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
              {t("story", "chapter")} {index + 1} · {story.title}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">{chapter.title}</h1>
            <p className="mt-2 text-sm opacity-60">
              {t("story", "by")} {story.original_author ?? story.author?.display_name}
              {readingMinutes(chapter.word_count, story.language) > 0
                ? ` · ${readingMinutes(chapter.word_count, story.language)} ${t("story", "minRead")}`
                : ""}
            </p>
            <div className="mx-auto mt-4 flex items-center justify-center gap-2 text-gold" aria-hidden="true">
              <span className="h-px w-12 bg-gold" />
              <span>❦</span>
              <span className="h-px w-12 bg-gold" />
            </div>
          </header>

          <div ref={bodyRef} style={{ fontSize: `${prefs.fontSize}px`, lineHeight: prefs.lineHeight }}>
            <ChapterBody doc={chapter.body_json} />
          </div>

          <footer className="mt-10 border-t border-current/10 pt-6 text-center opacity-80">
            <p ref={endMarkRef} className="font-serif italic">❦ {t("reader", "endOfChapter")} ❦</p>
            {session && (
              <button onClick={() => setReportOpen(true)} className="mt-3 text-sm underline hover:opacity-100">
                {t("story", "report")}
              </button>
            )}
          </footer>
        </article>

        {/* Chapter navigation cards (the bar's back button + chapter
            dropdown already cover the return-to-story route, so the
            old centre Contents link goes away with the row). */}
        <nav className="mx-3 sm:mx-0 mt-6 grid gap-3 sm:grid-cols-2" aria-label={t("reader", "contents")}>
          {prev ? (
            <Link to={chapterUrl(prev)} className="rounded-xl bg-white p-4 shadow-card transition-shadow hover:shadow-lift">
              <span className="block text-xs font-medium text-ink-faint">{t("reader", "previous")}</span>
              <span className="mt-1 block truncate font-semibold">← {prev.title}</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link to={chapterUrl(next)} className="rounded-xl bg-gold-soft p-4 text-right shadow-card transition-shadow hover:shadow-lift">
              <span className="block text-xs font-medium text-ink-faint">{t("reader", "next")}</span>
              <span className="mt-1 block truncate font-semibold">{next.title} →</span>
            </Link>
          ) : <span />}
        </nav>

        {!next && (
          <p className="mx-3 sm:mx-0 mt-6 rounded-xl bg-sage px-4 py-3 text-center text-sm text-ink-soft">
            {t("reader", "storyEnd")}
          </p>
        )}
        </div>

        <Comments chapterId={chapter.id} className={widthCls} theme={prefs.theme} />
      </div>

      {studioBtn && !studio && (
        <button
          ref={btnRef}
          onClick={() => {
            const text = window.getSelection()?.toString() ?? "";
            setStudio({ excerpt: normalizeExcerpt(text) });
            setStudioBtn(null);
            // Clear the reader selection: on mobile Chrome/Android the
            // OS selection toolbar (Translate/Copy/search bar) stays up
            // as long as a selection exists, and would overlay the studio.
            window.getSelection()?.removeAllRanges();
          }}
          className={`fixed z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lift ${studioBtnCls}`}
          style={{ top: studioBtn.top, left: studioBtn.left }}
        >
          ❦ {t("keepsakes", "makeKeepsake")}
        </button>
      )}

      {studio && (
        <QuoteStudio
          open
          onClose={() => setStudio(null)}
          story={story}
          chapterId={chapter.id}
          initialExcerpt={studio.excerpt}
          initialTemplate={studio.template}
          initialEcho={studio.echo}
          returnTo={window.location.pathname}
          filenameBase={slug}
        />
      )}

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="chapter"
        targetId={chapter.id}
        targetLabel={chapter.title}
      />

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t("reader", "backToTop")}
          title={t("reader", "backToTop")}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-ink/10 bg-white text-ink shadow-lift"
        >
          <ChevronDownIcon className="h-5 w-5 rotate-180" />
        </button>
      )}
    </Layout>
  );
}
