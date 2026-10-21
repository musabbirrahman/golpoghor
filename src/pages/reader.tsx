import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useUsernameRedirect } from "../lib/use-username-redirect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Avatar, Button, ButtonLink, EmptyState, Spinner } from "../components/ui";
import { ReportDialog } from "../components/report-dialog";
import { PENDING_KEEP_KEY, QuoteStudio, type PendingKeepsake } from "../components/quote-studio";
import { normalizeExcerpt } from "../lib/keepsake-card";
import { readingMinutes, timeAgo, AppError } from "../lib/utils";
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

type ReaderTheme = "light" | "sepia" | "dark";
type FontSize = "sm" | "md" | "lg" | "xl";
type LineSpacing = "normal" | "relaxed" | "loose";

const READER_KEY = "golpoghor-reader-prefs";

function loadPrefs(): { theme: ReaderTheme; fontSize: FontSize; lineSpacing: LineSpacing } {
  try {
    const raw = localStorage.getItem(READER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { theme: "light", fontSize: "md", lineSpacing: "relaxed" };
}

function ReaderSettings({
  prefs,
  setPrefs,
}: {
  prefs: { theme: ReaderTheme; fontSize: FontSize; lineSpacing: LineSpacing };
  setPrefs: (p: { theme: ReaderTheme; fontSize: FontSize; lineSpacing: LineSpacing }) => void;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const row = "flex items-center justify-between gap-3 py-2";
  const segBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-river text-white" : "bg-sage text-ink hover:bg-sage-dark"}`;
  const pick = (p: { theme: ReaderTheme; fontSize: FontSize; lineSpacing: LineSpacing }) => {
    setPrefs(p);
    setOpen(false);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("reader", "theme")}
        className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm font-medium hover:bg-sage"
      >
        Aa
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl bg-white p-4 shadow-lift">
            <div className={row}>
              <span className="text-sm font-medium">{t("reader", "theme")}</span>
              <div className="flex gap-1">
                {(["light", "sepia", "dark"] as ReaderTheme[]).map((th) => (
                  <button key={th} className={segBtn(prefs.theme === th)} onClick={() => pick({ ...prefs, theme: th })}>
                    {t("reader", th === "light" ? "themeLight" : th === "sepia" ? "themeSepia" : "themeDark")}
                  </button>
                ))}
              </div>
            </div>
            <div className={row}>
              <span className="text-sm font-medium">{t("reader", "fontSize")}</span>
              <div className="flex gap-1" role="group" aria-label={t("reader", "fontSize")}>
                {(["sm", "md", "lg", "xl"] as FontSize[]).map((s) => (
                  <button key={s} className={segBtn(prefs.fontSize === s)} onClick={() => pick({ ...prefs, fontSize: s })} aria-label={s}>
                    A
                  </button>
                ))}
              </div>
            </div>
            <div className={row}>
              <span className="text-sm font-medium">{t("reader", "lineSpacing")}</span>
              <div className="flex gap-1">
                {(["normal", "relaxed", "loose"] as LineSpacing[]).map((s) => (
                  <button key={s} className={segBtn(prefs.lineSpacing === s)} onClick={() => pick({ ...prefs, lineSpacing: s })}>
                    {s === "normal" ? "1.6" : s === "relaxed" ? "1.85" : "2.2"}
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

function Comments({ chapterId }: { chapterId: string }) {
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
    <section className="mx-auto mt-12 max-w-reader" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="font-serif text-2xl font-bold">
        {t("comments", "title")} ({commentsQuery.data?.length ?? 0})
      </h2>

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
            className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 focus:border-river focus:outline-none focus:ring-1 focus:ring-river"
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
          <Spinner />
        ) : commentsQuery.data?.length ? (
          commentsQuery.data.map((c) => (
            <article key={c.id} className="rounded-xl bg-white p-4 shadow-card">
              <div className="flex items-center gap-2">
                <Avatar name={c.author?.display_name ?? "?"} size="sm" src={dp.avatarUrl(c.author?.avatar_path ?? null)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.author?.display_name}</p>
                  <p className="text-xs text-ink-faint">{timeAgo(c.created_at, locale)}{c.edited_at ? ` · ${t("comments", "edited")}` : ""}</p>
                </div>
                {(c.author_id === profile?.id) && (
                  <>
                    <button
                      onClick={() => { setEditId(c.id); setEditBody(c.body); }}
                      className="text-xs text-ink-faint underline hover:text-clay"
                    >
                      {t("comments", "edit")}
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="text-xs text-ink-faint underline hover:text-clay"
                    >
                      {t("comments", "delete")}
                    </button>
                  </>
                )}
                {session && c.author_id !== profile?.id && (
                  <button
                    onClick={() => setReportId(c.id)}
                    className="text-xs text-ink-faint underline hover:text-clay"
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
                    className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 focus:border-river focus:outline-none focus:ring-1 focus:ring-river"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" type="button" onClick={() => setEditId(null)}>
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
  const [searchParams] = useSearchParams();
  const restart = searchParams.get("restart") === "1";
  const { t, dp, session } = useApp();
  const queryClient = useQueryClient();
  const [prefs, setPrefsState] = useState(loadPrefs);
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
  /** Saves are blocked until the restore decision for this chapter has settled,
   *  so loading/initial state can never overwrite a valid saved position. */
  const readyRef = useRef(false);
  const restoredForRef = useRef<string | null>(null);
  /** Latest position measured while the chapter DOM was alive. Unmount and
   *  hide handlers persist THIS value — by cleanup time the refs/DOM are
   *  already gone, so measuring then would save garbage. */
  const lastPositionRef = useRef<ReadingPosition | null>(null);

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

  const chaptersQuery = useQuery({
    queryKey: ["chapters", story?.id, "published"],
    queryFn: () => dp.listChapters(story!.id, { publishedOnly: true }),
    enabled: !!story,
  });
  const chapters = useMemo(() => chaptersQuery.data ?? [], [chaptersQuery.data]);
  const index = chapters.findIndex((c) => c.slug === chapterSlug);
  const chapterMeta = index >= 0 ? chapters[index] : undefined;
  const prev = index > 0 ? chapters[index - 1] : undefined;
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined;

  // The chapter list is light (V4-04) — the open chapter's full body loads
  // on its own, one chapter at a time.
  const chapterQuery = useQuery({
    queryKey: ["chapter", story?.id, chapterSlug],
    queryFn: () => dp.getChapterBySlug(story!.id, chapterSlug, { publishedOnly: true }),
    enabled: !!story && !!chapterMeta,
  });
  const chapter: Chapter | undefined = chapterQuery.data ?? undefined;

  const storyPath = `/stories/${username}/${slug}`;
  const chapterUrl = (c: { slug: string }) => `${storyPath}/${c.slug}`;

  // The reader's own progress for this story (shared cache with the story page).
  const progressQuery = useQuery({
    queryKey: ["progress", story?.id],
    queryFn: () => dp.getProgress(story!.id),
    enabled: !!story && !!session,
  });

  /** Capture the current position: a content-block anchor (preferred) plus the
   *  whole-document scroll ratio as a fallback. Returns null when the chapter
   *  body is not live DOM (route transition/teardown) — such measurements are
   *  garbage and must never be persisted. */
  const capturePosition = (): ReadingPosition | null => {
    const root = bodyRef.current;
    if (!root || !root.isConnected) return null;
    const el = document.documentElement;
    const ratio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
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
        // Fallback: whole-document ratio.
        const el = document.documentElement;
        window.scrollTo({ top: Math.max(0, progress.scroll_ratio * (el.scrollHeight - el.clientHeight)) });
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
    const scheduleSave = () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveNow(0.99), 800);
    };
    const onScroll = () => {
      if (!readyRef.current) return;
      const pos = capturePosition();
      if (!pos) return; // transition/teardown measurement — ignore
      lastPositionRef.current = pos;
      scheduleSave();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") saveNow(1);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHidden);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveNow(1);
    };
  }, [story, chapter, session, dp]);

  // Count the story view once per reader per day (dedup + exclusions in provider).
  useEffect(() => {
    if (!story || !chapter || !session) return;
    if (session.user.id === story.author_id) return;
    dp.recordStoryView(story.id).catch(() => {});
  }, [story?.id, chapter?.id, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const themeCls =
    prefs.theme === "dark"
      ? "bg-[#1c2422] text-[#e8e4d8]"
      : prefs.theme === "sepia"
        ? "bg-[#f4ecd8] text-[#43382e]"
        : "bg-white text-ink";
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
  const fontCls = { sm: "text-[17px]", md: "text-[19px]", lg: "text-[21px]", xl: "text-[24px]" }[prefs.fontSize];
  const leadingCls = { normal: "leading-[1.6]", relaxed: "leading-[1.85]", loose: "leading-[2.2]" }[prefs.lineSpacing];

  const storyRedirectPending = useUsernameRedirect(
    username,
    !storyQuery.isLoading && !story,
    (next) => `/stories/${next}/${slug}/${chapterSlug}`
  );
  if (storyQuery.isLoading || chaptersQuery.isLoading || chapterQuery.isLoading) return <Layout><Spinner /></Layout>;
  if (!story || !chapter) {
    if (!story && storyRedirectPending) return <Layout><Spinner /></Layout>;
    return (
      <Layout>
        <EmptyState title={t("errors", "notFound")} action={<ButtonLink to="/discover">{t("discover", "title")}</ButtonLink>} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-reader">
        {/* Breadcrumb + settings */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-ink-faint">
            <Link to={storyPath} className="truncate font-medium text-river hover:underline">{story.title}</Link>
          </nav>
          <ReaderSettings prefs={prefs} setPrefs={setPrefs} />
        </div>

        <article className={`mt-4 rounded-2xl px-5 py-8 shadow-card sm:px-10 sm:py-12 ${themeCls}`}>
          <header className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
              {t("story", "chapter")} {index + 1} · {story.title}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">{chapter.title}</h1>
            <p className="mt-2 text-sm opacity-60">
              {t("story", "by")} {story.author?.display_name}
              {readingMinutes(chapter.word_count, story.language) > 0
                ? ` · ${readingMinutes(chapter.word_count, story.language)} ${t("story", "minRead")}`
                : ""}
            </p>
            <div className="mx-auto mt-4 h-px w-16 bg-gold" aria-hidden />
          </header>

          <div ref={bodyRef} className={`${fontCls} ${leadingCls}`}>
            <ChapterBody doc={chapter.body_json} />
          </div>

          <footer className="mt-10 border-t border-current/10 pt-6 text-center opacity-80">
            <p className="font-serif italic">❦ {t("reader", "endOfChapter")} ❦</p>
            {session && (
              <button onClick={() => setReportOpen(true)} className="mt-3 text-sm underline hover:opacity-100">
                {t("story", "report")}
              </button>
            )}
          </footer>
        </article>

        {/* Chapter navigation */}
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t("reader", "contents")}>
          {prev ? (
            <ButtonLink to={chapterUrl(prev)} variant="secondary">← {t("reader", "previous")}</ButtonLink>
          ) : <span />}
          <Link to={storyPath} className="text-sm font-medium text-river hover:underline">{t("reader", "contents")}</Link>
          {next ? (
            <ButtonLink to={chapterUrl(next)} variant="secondary">{t("reader", "next")} →</ButtonLink>
          ) : <span />}
        </nav>

        {!next && (
          <p className="mt-6 rounded-xl bg-sage px-4 py-3 text-center text-sm text-ink-soft">
            {t("reader", "storyEnd")}
          </p>
        )}
      </div>

      <Comments chapterId={chapter.id} />

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
    </Layout>
  );
}
