import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Button, ButtonLink, EmptyState, Modal, Spinner, StatusBadge } from "../components/ui";
import { ChapterBody } from "./reader";
import { AppError, countWords, docToText, emptyDoc, isPlaceholderChapterSlug, slugify, timeAgo } from "../lib/utils";
import type { Chapter, Story, TiptapDoc } from "../lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (active: boolean) =>
    `rounded-md px-2.5 py-1.5 text-sm font-medium ${active ? "bg-river text-white" : "text-ink-soft hover:bg-sage"}`;
  const items: { label: string; action: () => void; active: boolean; title: string }[] = [
    { label: "B", action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), title: "Bold" },
    { label: "I", action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), title: "Italic" },
    { label: "H2", action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }), title: "Heading" },
    { label: "❝", action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote"), title: "Quote" },
    { label: "•", action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList"), title: "Bullet list" },
    { label: "1.", action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList"), title: "Numbered list" },
    { label: "↩", action: () => editor.chain().focus().undo().run(), active: false, title: "Undo" },
    { label: "↪", action: () => editor.chain().focus().redo().run(), active: false, title: "Redo" },
  ];
  return (
    <div className="flex flex-wrap gap-1 border-b border-ink/15 px-3 py-1.5" role="toolbar" aria-label="Formatting">
      {items.map((it) => (
        <button key={it.title} type="button" title={it.title} aria-label={it.title} onClick={it.action} className={btn(it.active)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Warns when unpublishing would leave the story with no published chapter. */
function LastChapterWarning({ storyId, chapterId }: { storyId: string; chapterId: string }) {
  const { t, dp } = useApp();
  const q = useQuery({
    queryKey: ["chapters", storyId, "published"],
    queryFn: () => dp.listChapters(storyId, { publishedOnly: true }),
  });
  const others = (q.data ?? []).filter((c) => c.id !== chapterId).length;
  if (q.isLoading || others > 0) return null;
  return (
    <p className="mt-3 rounded-lg bg-gold-soft px-3 py-2 text-sm text-ink-soft">
      ⚠ {t("write", "lastChapterWarning")}
    </p>
  );
}

export function ChapterEditorPage() {
  const { storyId, chapterId } = useParams();
  const isNew = !chapterId;
  const { t, locale, dp, session, sessionLoading } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "publish" | "unpublish" | "delete">(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [liveWords, setLiveWords] = useState(0);

  // Serialize saves: each save waits for the previous one, newest doc always wins.
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const dirtyRef = useRef(false);
  const chapterRef = useRef<Chapter | null>(null);
  const titleRef = useRef("");
  chapterRef.current = chapter;
  titleRef.current = title;
  // Always call the LATEST save implementation (avoids stale closures from
  // the editor's onUpdate, which is bound once at editor creation).
  const saveNowRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const existingQuery = useQuery({
    queryKey: ["chapter", "edit", chapterId],
    queryFn: () => dp.getChapter(chapterId!),
    enabled: !isNew,
  });

  // On the canonical /write/chapters/:chapterId route there is no :storyId
  // param — resolve the story through the chapter instead.
  const storyIdResolved = storyId ?? existingQuery.data?.story_id;
  const storyQuery = useQuery({
    queryKey: ["story", "edit", storyIdResolved],
    queryFn: () => dp.getStory(storyIdResolved!),
    enabled: !!storyIdResolved,
  });
  const story: Story | null = storyQuery.data ?? null;

  // Owner gate: the editor is the author's surface only. `denied` is false
  // while anything is still loading (the loading return below covers that
  // window), so a non-owner never sees the editor, its hydration never
  // runs, and no autosave can fire for them. Signed-out users get the
  // sign-in state instead. Moderators are denied here too — their hide
  // powers live on the admin surface, not in this editor.
  const denied = !!story && !!session && session.user.id !== story.author_id;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: "এখানে লিখুন… / Start writing…" }),
    ],
    content: emptyDoc(),
    editorProps: {
      attributes: { class: "tiptap richtext min-h-[320px] px-5 py-4 text-[19px] leading-[1.85] focus:outline-none" },
    },
    onUpdate: ({ editor }) => {
      setLiveWords(countWords(docToText(editor.getJSON() as TiptapDoc)));
      dirtyRef.current = true;
      scheduleSave();
    },
  });

  // Hydrate editor once, and re-hydrate if fresher server data arrives
  // while the user has no unsaved edits (never clobber in-progress work).
  useEffect(() => {
    if (denied || isNew || !existingQuery.data || !editor) return;
    const c = existingQuery.data;
    if (initialized && (dirtyRef.current || chapterRef.current?.updated_at === c.updated_at)) return;
    setChapter(c);
    setTitle(c.title);
    editor.commands.setContent(c.body_json);
    setLiveWords(c.word_count);
    setSavedAt(c.updated_at);
    setSaveState("saved");
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingQuery.data, editor, isNew, initialized, denied]);

  const doSave = useCallback(async () => {
    if (!story || !editor || denied) return;
    dirtyRef.current = false;
    setSaveState("saving");
    setError(null);
    try {
      const doc = editor.getJSON() as TiptapDoc;
      const chTitle = titleRef.current.trim() || (locale === "bn" ? "শিরোনামহীন অধ্যায়" : "Untitled chapter");
      if (!chapterRef.current) {
        const created = await dp.createChapter(story.id, { title: chTitle, body: doc });
        setChapter(created);
        setSavedAt(created.updated_at);
        queryClient.setQueryData(["chapter", "edit", created.id], created);
        queryClient.invalidateQueries({ queryKey: ["chapters", story.id] });
        // The /write dashboard count comes from ["myStories"] — without
        // this, a new chapter left the dashboard one behind until reload
        // (15s staleTime serves the cached list on nav-back).
        queryClient.invalidateQueries({ queryKey: ["myStories"] });
        // Move to the canonical URL WITHOUT a router navigation: navigate()
        // would flip isNew, re-run the hydrate effect and reset the editor
        // to the pre-save snapshot, dropping keystrokes typed during the
        // create round-trip. replaceState only changes the URL bar.
        window.history.replaceState(null, "", `/write/chapters/${created.id}`);
      } else {
        const cur = chapterRef.current!;
        // The slug is NOT renamed here: autosave must never rename, or a
        // half-typed title would lock the URL. A placeholder slug is
        // replaced with the title slug once, at publish (runAction).
        const updated = await dp.updateChapter(cur.id, {
          title: chTitle,
          body: doc,
        });
        setChapter(updated);
        setSavedAt(updated.updated_at);
        // Keep the single-chapter cache fresh so reopening the editor
        // never shows pre-save content.
        queryClient.setQueryData(["chapter", "edit", cur.id], updated);
        queryClient.invalidateQueries({ queryKey: ["chapters", story.id] });
        // Keep the /write dashboard count fresh (see create branch).
        queryClient.invalidateQueries({ queryKey: ["myStories"] });
      }
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof AppError ? t("errors", err.code) : t("errors", "generic"));
      dirtyRef.current = true; // retry will pick it up
    }
  }, [story, editor, dp, locale, queryClient, t, denied]);

  const saveNow = useCallback(() => {
    saveChain.current = saveChain.current.then(doSave);
    return saveChain.current;
  }, [doSave]);
  saveNowRef.current = saveNow;

  const debounceRef = useRef<number | null>(null);
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => saveNowRef.current(), 1200);
  }, []);

  // Save on blur + warn about unsaved changes.
  useEffect(() => {
    const onBlur = () => {
      if (dirtyRef.current) saveNow();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      // SPA navigation doesn't blur the window, so flush any pending
      // autosave here — otherwise the last <1.2s of typing is silently lost.
      if (dirtyRef.current) {
        saveNowRef.current();
      }
    };
  }, [saveNow]);

  async function runAction(action: "publish" | "unpublish" | "delete") {    if (!chapter) return;
    setError(null);
    try {
      if (action === "delete") {
        await dp.deleteChapter(chapter.id);
        queryClient.invalidateQueries({ queryKey: ["chapters", story?.id] });
        // Chapter count on public cards/shelves must update too.
        queryClient.invalidateQueries({ queryKey: ["stories"] });
        // And the /write dashboard count (["myStories"]) as well.
        queryClient.invalidateQueries({ queryKey: ["myStories"] });
        navigate(`/write/stories/${story?.id}`);
        return;
      }
      if (action === "publish") {
        const text = docToText(editor?.getJSON() as TiptapDoc);
        if (!title.trim() || !text.trim()) {
          setError(t("errors", "emptyChapter"));
          setConfirmAction(null);
          return;
        }
        await saveNow();
        // First publish gives a placeholder slug its real title slug.
        // Autosave never renames (see doSave), so this is the only rename,
        // and it uses the saved title — never a half-typed one.
        const curTitle = titleRef.current.trim();
        const renameSlug =
          isPlaceholderChapterSlug(chapter.slug) &&
          curTitle &&
          curTitle !== "Untitled chapter" &&
          curTitle !== "শিরোনামহীন অধ্যায়";
        const updated = await dp.updateChapter(chapter.id, {
          status: "published",
          ...(renameSlug ? { slug: slugify(curTitle) } : {}),
        });
        setChapter(updated);
      } else {
        const updated = await dp.updateChapter(chapter.id, { status: "unpublished" });
        setChapter(updated);
      }
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ["chapters", story?.id] });
      // Publishing/unpublishing changes the public chapter count (and can
      // hide a story that lost its last published chapter) — refresh lists.
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      // And the /write dashboard count (["myStories"]) as well.
      queryClient.invalidateQueries({ queryKey: ["myStories"] });
    } catch (err) {
      setError(err instanceof AppError ? t("errors", err.code) : t("errors", "generic"));
      setConfirmAction(null);
    }
  }

  if (sessionLoading || storyQuery.isLoading || (!isNew && existingQuery.isLoading)) {
    return <Layout><Spinner /></Layout>;
  }
  if (!story || (!isNew && !existingQuery.data)) {
    return (
      <Layout>
        <EmptyState title={t("errors", "notFound")} action={<ButtonLink to="/write">{t("common", "back")}</ButtonLink>} />
      </Layout>
    );
  }
  if (!session) {
    return (
      <Layout>
        <EmptyState
          title={t("errors", "signInRequired")}
          action={<ButtonLink to={`/login?next=${encodeURIComponent(window.location.pathname)}`}>{t("nav", "signIn")}</ButtonLink>}
        />
      </Layout>
    );
  }
  if (denied) {
    return (
      <Layout>
        <EmptyState
          title={t("errors", "notOwner")}
          action={<ButtonLink to="/">{t("nav", "home")}</ButtonLink>}
        />
      </Layout>
    );
  }

  const saveLabel =
    saveState === "saving" ? t("write", "saving")
    : saveState === "error" ? t("write", "saveFailed")
    : saveState === "saved" && savedAt ? `${t("write", "savedAt")} ${timeAgo(savedAt, locale)}`
    : dirtyRef.current ? t("write", "unsavedChanges")
    : "";

  return (
    <Layout>
      <div className="mx-auto mt-6 max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/write/stories/${story.id}`} className="text-sm text-river hover:underline">
              ← {story.title}
            </Link>
            <h1 className="mt-1 font-serif text-2xl font-bold">{isNew ? t("write", "newChapter") : (title || t("write", "chapterTitle"))}</h1>
          </div>
          <div className="flex items-center gap-2">
            {chapter && <StatusBadge status={chapter.status} />}
            <span
              className={`text-sm ${saveState === "error" ? "text-clay" : "text-ink-faint"}`}
              role="status"
              aria-live="polite"
            >
              {saveLabel}
            </span>
            {saveState === "error" && (
              <Button size="sm" variant="secondary" onClick={saveNow}>{t("common", "retry")}</Button>
            )}
          </div>
        </div>
        <div className="mt-2 h-0.5 w-10 bg-gold" />

        {error && <p className="mt-3 rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay-dark" role="alert">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={preview ? "secondary" : "ghost"} size="sm" onClick={() => setPreview((v) => !v)}>
            {t("write", "preview")}
          </Button>
          {chapter && chapter.status !== "published" && (
            <Button size="sm" onClick={() => setConfirmAction("publish")}>{t("write", "publish")}</Button>
          )}
          {chapter && chapter.status === "published" && (
            <Button size="sm" variant="secondary" onClick={() => setConfirmAction("unpublish")}>{t("write", "unpublish")}</Button>
          )}
          {chapter && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmAction("delete")}>
              {t("common", "delete")}
            </Button>
          )}
          <span className="ml-auto self-center text-sm text-ink-faint">
            {liveWords} {t("write", "wordCount")}
          </span>
        </div>

        {preview ? (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-gold bg-white px-5 py-8 leading-[1.85] sm:px-10">
            <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-gold">
              {t("write", "preview")} — {t("write", "draft")}
            </p>
            <h2 className="mb-6 text-center font-serif text-3xl font-bold">{title || "…"}</h2>
            <ChapterBody doc={(editor?.getJSON() as TiptapDoc) ?? emptyDoc()} />
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-ink/15 bg-white shadow-card focus-within:border-river">
            <label htmlFor="chapter-title" className="sr-only">{t("write", "chapterTitle")}</label>
            <input
              id="chapter-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); dirtyRef.current = true; scheduleSave(); }}
              placeholder={t("write", "chapterTitle")}
              className="w-full rounded-t-xl border-b border-ink/15 bg-white px-5 py-3 font-serif text-2xl font-semibold focus:border-river focus:outline-none"
            />
            <Toolbar editor={editor} />
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction === "publish" ? t("write", "publish") : confirmAction === "unpublish" ? t("write", "unpublish") : t("common", "delete")}
      >
        <p className="text-sm text-ink-soft">
          {confirmAction === "publish" ? t("write", "publishConfirm") : t("write", "deleteConfirm")}
        </p>
        {confirmAction === "unpublish" && chapter?.status === "published" &&
          (story?.status === "ongoing" || story?.status === "complete") && (
          <LastChapterWarning storyId={story.id} chapterId={chapter.id} />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmAction(null)}>{t("common", "cancel")}</Button>
          <Button
            variant={confirmAction === "delete" ? "danger" : "primary"}
            onClick={() => confirmAction && runAction(confirmAction)}
          >
            {t("common", "confirm")}
          </Button>
        </div>
      </Modal>
    </Layout>
  );
}
