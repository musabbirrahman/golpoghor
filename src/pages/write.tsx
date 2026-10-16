import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import {
  Badge, Button, ButtonLink, Card, EmptyState, FieldError, Input, Label, Modal,
  Select, Spinner, StatusBadge, Textarea, LanguageBadge,
} from "../components/ui";
import { Cover } from "../components/story-card";
import { AppError, slugify, timeAgo } from "../lib/utils";
import type { AppealTarget, StoryLanguage } from "../lib/types";

function RequireAuthor({ children }: { children: React.ReactNode }) {
  const { t, session, sessionLoading } = useApp();
  if (sessionLoading) return <Layout><Spinner /></Layout>;
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
  return <>{children}</>;
}

export function WriteDashboard() {
  const { t, dp } = useApp();
  const storiesQuery = useQuery({
    queryKey: ["myStories"],
    queryFn: () => dp.listStories({ includeDrafts: true, limit: 100 }),
  });

  return (
    <RequireAuthor>
      <Layout>
        <div className="mt-6 flex items-center justify-between">
          <h1 className="font-serif text-3xl font-bold">{t("write", "dashboard")}</h1>
          <ButtonLink to="/write/stories/new">+ {t("write", "newStory")}</ButtonLink>
        </div>

        <div className="mt-6">
          {storiesQuery.isLoading ? <Spinner /> : storiesQuery.data?.stories.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {storiesQuery.data.stories.map((s) => (
                <Link key={s.id} to={`/write/stories/${s.id}`} className="block">
                  <Card className="flex gap-4 p-4 transition-shadow hover:shadow-lift">
                    <Cover story={s} className="h-24 w-16 shrink-0 rounded-lg" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={s.status} />
                        <LanguageBadge language={s.language} />
                      </div>
                      <h3 className="mt-1.5 truncate font-serif text-lg font-semibold">{s.title}</h3>
                      <p className="text-sm text-ink-faint">
                        {s.chapter_count ?? 0} {t("story", "chapters")}
                      </p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title={t("write", "noStories")}
              action={<ButtonLink to="/write/stories/new">+ {t("write", "newStory")}</ButtonLink>}
            />
          )}
        </div>
      </Layout>
    </RequireAuthor>
  );
}

const GENRES = ["general", "সমকালীন", "ছোটগল্প", "রোমান্স", "রহস্য", "ফ্যান্টাসি", "হরর", "ইতিহাস", "কবিতা", "Mystery", "Romance", "Fantasy", "Horror", "History", "Poetry", "Contemporary"];

/** Shared published-chapter count (same cache key as ChapterListCard). */
function usePublishedChapterCount(storyId: string): number | undefined {
  const { dp } = useApp();
  const q = useQuery({
    queryKey: ["chapters", storyId, "all"],
    queryFn: () => dp.listChapters(storyId, { publishedOnly: false }),
  });
  const chapters = q.data;
  return chapters === undefined ? undefined : chapters.filter((c) => c.status === "published").length;
}

/** Explains the publish gate when the story has no published chapter yet. */
function PublishGateNotice({ storyId }: { storyId: string }) {
  const { t } = useApp();
  const count = usePublishedChapterCount(storyId);
  if (count === undefined || count > 0) return null;
  return (
    <div className="mt-3 rounded-lg bg-gold-soft px-3 py-2 text-sm text-ink-soft">
      <strong>{t("write", "needChapterFirst")}</strong>{" "}
      <a href={`/write/stories/${storyId}/chapters/new`} className="font-medium text-river underline">
        + {t("write", "newChapter")}
      </a>
    </div>
  );
}

/** Publish button disabled until a chapter is published (data layer blocks it too). */
function PublishStoryButton({ storyId, onPublish, label }: { storyId: string; onPublish: () => void; label: string }) {
  const { t } = useApp();
  const count = usePublishedChapterCount(storyId);
  const blocked = count === 0;
  return (
    <Button onClick={onPublish} disabled={blocked} title={blocked ? t("write", "needChapterFirst") : undefined}>
      {label}
    </Button>
  );
}

export function StoryFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t, dp } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const storyQuery = useQuery({
    queryKey: ["story", "edit", id],
    queryFn: () => dp.getStory(id!),
    enabled: !isNew,
  });
  const story = storyQuery.data;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [summary, setSummary] = useState("");
  const [language, setLanguage] = useState<StoryLanguage>("bn");
  const [genre, setGenre] = useState("general");
  const [tags, setTags] = useState("");
  const [notice, setNotice] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "delete" | "publish" | "unpublish" | "complete">(null);

  // hydrate once
  if (!isNew && story && !initialized) {
    setTitle(story.title);
    setSlug(story.slug);
    setSlugTouched(true);
    setSummary(story.summary);
    setLanguage(story.language);
    setGenre(story.genre);
    setTags(story.tags.join(", "));
    setNotice(story.content_notice);
    setInitialized(true);
  }

  const errText = (err: unknown) =>
    err instanceof AppError ? t("errors", err.code) : err ? t("errors", "generic") : null;

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = {
        title,
        slug: slugify(slug || title),
        summary,
        language,
        genre,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
        content_notice: notice,
      };
      if (isNew) {
        const created = await dp.createStory(input);
        queryClient.invalidateQueries({ queryKey: ["myStories"] });
        navigate(`/write/stories/${created.id}`, { replace: true });
      } else {
        await dp.updateStory(id!, input);
        queryClient.invalidateQueries({ queryKey: ["myStories"] });
        queryClient.invalidateQueries({ queryKey: ["story", "edit", id] });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
      }
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  const [savedFlash, setSavedFlash] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async (status: "ongoing" | "complete" | "draft") => {
      await dp.updateStory(id!, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", "edit", id] });
      queryClient.invalidateQueries({ queryKey: ["myStories"] });
      setConfirmAction(null);
    },
    onError: (err) => setError(errText(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => dp.deleteStory(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myStories"] });
      navigate("/write", { replace: true });
    },
    onError: (err) => setError(errText(err)),
  });

  async function onCoverFile(f: File) {
    setUploading(true);
    setError(null);
    try {
      const path = await dp.uploadCover(f);
      await dp.updateStory(id!, { cover_path: path });
      queryClient.invalidateQueries({ queryKey: ["story", "edit", id] });
    } catch (err) {
      setError(errText(err));
    } finally {
      setUploading(false);
    }
  }

  if (!isNew && storyQuery.isLoading) return <RequireAuthor><Layout><Spinner /></Layout></RequireAuthor>;
  if (!isNew && !story) {
    return (
      <RequireAuthor>
        <Layout><EmptyState title={t("errors", "notFound")} action={<ButtonLink to="/write">{t("common", "back")}</ButtonLink>} /></Layout>
      </RequireAuthor>
    );
  }

  const coverUrl = story ? dp.coverUrl(story.cover_path) : null;

  return (
    <RequireAuthor>
      <Layout>
        <div className="mx-auto mt-6 max-w-2xl">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl font-bold">{isNew ? t("write", "newStory") : t("write", "editStory")}</h1>
            {!isNew && story && <StatusBadge status={story.status} />}
          </div>

          <form onSubmit={save} className="mt-6 flex flex-col gap-4 rounded-xl bg-white p-6 shadow-card">
            <div>
              <Label htmlFor="sf-title">{t("write", "title")}</Label>
              <Input id="sf-title" required value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }} maxLength={200} />
            </div>
            <div>
              <Label htmlFor="sf-slug">Slug</Label>
              <Input id="sf-slug" value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                placeholder={slugify(title) || "my-story"} maxLength={220} />
            </div>
            <div>
              <Label htmlFor="sf-summary">{t("write", "summary")}</Label>
              <Textarea id="sf-summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sf-lang">{t("write", "language")}</Label>
                <Select id="sf-lang" value={language} onChange={(e) => setLanguage(e.target.value as StoryLanguage)}>
                  <option value="bn">{t("discover", "bangla")}</option>
                  <option value="en">{t("discover", "english")}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="sf-genre">{t("write", "genre")}</Label>
                <Select id="sf-genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
                  {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="sf-tags">{t("write", "tags")}</Label>
              <Input id="sf-tags" value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder={t("write", "tagsHint")} />
            </div>
            <div>
              <Label htmlFor="sf-notice">{t("write", "contentNotice")}</Label>
              <Input id="sf-notice" value={notice} onChange={(e) => setNotice(e.target.value)} maxLength={500} />
            </div>

            {!isNew && (
              <div>
                <Label>{t("write", "coverImage")}</Label>
                <div className="flex items-center gap-4">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-24 w-18 rounded-lg object-cover" style={{ width: 72 }} />
                  ) : (
                    <div className="flex h-24 w-[72px] items-center justify-center rounded-lg bg-sage text-ink-faint">—</div>
                  )}
                  <label className="cursor-pointer rounded-lg bg-sage px-4 py-2 text-sm font-medium hover:bg-sage-dark">
                    {uploading ? t("common", "loading") : t("write", "coverImage")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onCoverFile(f);
                      }}
                    />
                  </label>
                </div>
                <p className="mt-1 text-xs text-ink-faint">JPG / PNG / WebP, 2 MB পর্যন্ত</p>
              </div>
            )}

            <FieldError message={error} />
            {savedFlash && <p className="text-sm text-river" role="status">{t("settings", "saved")}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>{busy ? t("common", "loading") : t("write", "save")}</Button>
            </div>
          </form>

          {!isNew && story && (
            <>
              <ChapterListCard storyId={story.id} />

              <Card className="mt-6 p-6">
                <h2 className="font-serif text-xl font-bold">{t("write", "publish")}</h2>
                <p className="mt-1 text-sm text-ink-faint">
                  {t("write", "storyStatus")}: <StatusBadge status={story.status} />
                </p>
                <PublishGateNotice storyId={story.id} />
                <div className="mt-4 flex flex-wrap gap-2">
                  {story.status === "draft" && (
                    <PublishStoryButton storyId={story.id} onPublish={() => setConfirmAction("publish")} label={t("write", "publishStory")} />
                  )}
                  {story.status === "ongoing" && (
                    <>
                      <Button variant="secondary" onClick={() => setConfirmAction("complete")}>{t("write", "markComplete")}</Button>
                      <Button variant="ghost" onClick={() => setConfirmAction("unpublish")}>{t("write", "unpublish")}</Button>
                    </>
                  )}
                  {story.status === "complete" && (
                    <Button variant="ghost" onClick={() => setConfirmAction("unpublish")}>{t("write", "unpublish")}</Button>
                  )}
                  {(story.status === "ongoing" || story.status === "complete") && (
                    <ButtonLink to={`/stories/${story.author?.username}/${story.slug}`} variant="secondary">
                      {t("write", "preview")}
                    </ButtonLink>
                  )}
                </div>
                {story.status === "hidden" && (
                  <AppealSection targetType="story" targetId={story.id} />
                )}
                <div className="mt-6 border-t border-ink/10 pt-4">
                  <Button variant="danger" size="sm" onClick={() => setConfirmAction("delete")}>
                    {t("write", "deleteStory")}
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>

        <Modal
          open={confirmAction !== null}
          onClose={() => setConfirmAction(null)}
          title={
            confirmAction === "delete" ? t("write", "deleteStory")
            : confirmAction === "publish" ? t("write", "publishStory")
            : confirmAction === "complete" ? t("write", "markComplete")
            : t("write", "unpublish")
          }
        >
          <p className="text-sm text-ink-soft">{t("write", "deleteConfirm")}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>{t("common", "cancel")}</Button>
            <Button
              variant={confirmAction === "delete" ? "danger" : "primary"}
              disabled={statusMutation.isPending || deleteMutation.isPending}
              onClick={() => {
                if (confirmAction === "delete") deleteMutation.mutate();
                else if (confirmAction === "publish") statusMutation.mutate("ongoing");
                else if (confirmAction === "complete") statusMutation.mutate("complete");
                else if (confirmAction === "unpublish") statusMutation.mutate("draft");
              }}
            >
              {t("common", "confirm")}
            </Button>
          </div>
        </Modal>
      </Layout>
    </RequireAuthor>
  );
}

/**
 * Writer-facing appeal UI for hidden content: explains the moderation status,
 * shows pending/decided appeals, and lets the writer request a review.
 */
export function AppealSection({ targetType, targetId, compact = false }: {
  targetType: AppealTarget;
  targetId: string;
  compact?: boolean;
}) {
  const { t, locale, dp } = useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const appealsQuery = useQuery({
    queryKey: ["myAppeals"],
    queryFn: () => dp.listMyAppeals(),
    select: (all) =>
      all
        .filter((a) => a.target_type === targetType && a.target_id === targetId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  });
  const appeals = appealsQuery.data ?? [];
  const pending = appeals.find((a) => a.status === "pending");
  const latest = appeals[0];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["myAppeals"] });
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await dp.createAppeal(targetType, targetId, reason);
      setOpen(false);
      setReason("");
      setFlash(true);
      setTimeout(() => setFlash(false), 4000);
      refresh();
    } catch (e) {
      setError(e instanceof AppError ? t("errors", e.code) : t("errors", "generic"));
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = pending ? (
    <Badge tone="gold">{t("appeals", "pending")}</Badge>
  ) : latest ? (
    <Badge tone={latest.status === "approved" ? "sage" : "clay"}>{t("appeals", latest.status)}</Badge>
  ) : null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {statusBadge}
        {!pending && (
          <button
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-river underline hover:opacity-80"
          >
            {t("appeals", "requestReview")}
          </button>
        )}
        <AppealModal
          open={open} onClose={() => setOpen(false)} reason={reason} setReason={setReason}
          busy={busy} error={error} onSubmit={submit}
        />
      </span>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-clay/30 bg-clay-soft/40 p-4">
      <p className="text-sm font-semibold">{t("appeals", "hiddenNotice")}</p>
      <p className="mt-1 text-sm text-ink-soft">{t("appeals", "hiddenExplained")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {statusBadge}
        {pending && <span className="text-xs text-ink-faint">{t("appeals", "appealPending")}</span>}
        {latest && latest.status !== "pending" && latest.decision_note && (
          <span className="text-xs text-ink-soft">
            {t("appeals", "decidedNote")}: {latest.decision_note}
          </span>
        )}
        {!pending && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {t("appeals", "requestReview")}
          </Button>
        )}
      </div>
      {latest && !pending && (
        <p className="mt-1 text-xs text-ink-faint">
          {timeAgo(latest.created_at, locale)}
        </p>
      )}
      {flash && <p className="mt-2 text-sm text-river" role="status">{t("appeals", "submitted")}</p>}
      <AppealModal
        open={open} onClose={() => setOpen(false)} reason={reason} setReason={setReason}
        busy={busy} error={error} onSubmit={submit}
      />
    </div>
  );
}

function AppealModal({ open, onClose, reason, setReason, busy, error, onSubmit }: {
  open: boolean;
  onClose: () => void;
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const { t } = useApp();
  return (
    <Modal open={open} onClose={onClose} title={t("appeals", "requestReview")}>
      <label className="block text-sm font-medium text-ink-soft" htmlFor="appeal-reason">
        {t("appeals", "reason")}
      </label>
      <Textarea
        id="appeal-reason"
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("appeals", "reasonPlaceholder")}
        maxLength={1000}
      />
      {error && <p className="mt-2 text-sm text-clay" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t("common", "cancel")}</Button>
        <Button disabled={busy || !reason.trim()} onClick={onSubmit}>
          {busy ? t("common", "loading") : t("appeals", "submit")}
        </Button>
      </div>
    </Modal>
  );
}

function ChapterListCard({ storyId }: { storyId: string }) {
  const { t, dp } = useApp();
  const chaptersQuery = useQuery({
    queryKey: ["chapters", storyId, "all"],
    queryFn: () => dp.listChapters(storyId, { publishedOnly: false }),
  });
  const chapters = chaptersQuery.data ?? [];

  return (
    <Card className="mt-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold">{t("write", "chapters")} ({chapters.length})</h2>
        <ButtonLink to={`/write/stories/${storyId}/chapters/new`} size="sm">+ {t("write", "newChapter")}</ButtonLink>
      </div>
      <div className="mt-4">
        {chaptersQuery.isLoading ? <Spinner /> : chapters.length ? (
          <ol className="divide-y divide-ink/10">
            {chapters.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="w-6 text-center font-serif text-ink-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                <StatusBadge status={c.status} />
                {c.status === "hidden" && (
                  <AppealSection targetType="chapter" targetId={c.id} compact />
                )}
                <Link to={`/write/chapters/${c.id}`} className="text-sm font-medium text-river hover:underline">
                  {t("common", "edit")}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-faint">{t("story", "noChapters")}</p>
        )}
      </div>
    </Card>
  );
}
