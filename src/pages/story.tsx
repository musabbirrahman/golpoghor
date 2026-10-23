import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUsernameRedirect } from "../lib/use-username-redirect";
import { genreLabel } from "../lib/genres";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Spinner, StatusBadge, LanguageBadge } from "../components/ui";
import { Cover } from "../components/story-card";
import { ReportDialog } from "../components/report-dialog";
import { formatDate, readingMinutes, timeAgo } from "../lib/utils";

export function StoryPage() {
  const { username = "", slug = "" } = useParams();
  const { t, locale, dp, session } = useApp();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);

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
  if (storyQuery.isLoading) return <Layout><Spinner /></Layout>;
  if (!story) {
    if (storyRedirectPending) return <Layout><Spinner /></Layout>;
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

  return (
    <Layout>
      <div className="mt-6 grid gap-8 md:grid-cols-[220px_1fr]">
        <Cover story={story} className="aspect-[3/4] w-full rounded-xl shadow-lift" />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <LanguageBadge language={story.language} />
            <StatusBadge status={story.status} />
            <Badge>{genreLabel(story.genre, locale)}</Badge>
            {story.tags.map((tag) => (
              <Link key={tag} to={`/discover?tag=${encodeURIComponent(tag)}`}>
                <Badge tone="gold">#{tag}</Badge>
              </Link>
            ))}
          </div>

          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight">{story.title}</h1>

          <Link
            to={`/authors/${story.author?.username}`}
            className="mt-2 inline-flex items-center gap-2 text-ink-soft hover:text-river-dark"
          >
            <Avatar name={story.author?.display_name ?? "?"} size="sm" src={dp.avatarUrl(story.author?.avatar_path ?? null)} />
            <span className="font-medium">{story.author?.display_name}</span>
            <span className="text-sm text-ink-faint">@{story.author?.username}</span>
          </Link>

          <p className="mt-4 max-w-2xl whitespace-pre-line text-ink-soft">{story.summary}</p>

          {/* V4-28 attribution: only credits that exist are shown. */}
          {(story.original_author || story.original_title || story.translator_name || story.adapter_name || story.edition_source || story.publication_details) && (
            <dl className="mt-4 max-w-2xl space-y-1 text-sm text-ink-soft">
              {story.original_author && (
                <div className="flex gap-2"><dt className="shrink-0 text-ink-faint">{t("story", "originalAuthor")}:</dt><dd>{story.original_author}</dd></div>
              )}
              {story.original_title && story.original_title !== story.title && (
                <div className="flex gap-2"><dt className="shrink-0 text-ink-faint">{t("story", "originalTitle")}:</dt><dd>{story.original_title}</dd></div>
              )}
              {story.translator_name && (
                <div className="flex gap-2"><dt className="shrink-0 text-ink-faint">{t("story", "translatedBy")}:</dt><dd>{story.translator_name}</dd></div>
              )}
              {story.adapter_name && (
                <div className="flex gap-2"><dt className="shrink-0 text-ink-faint">{t("story", "adaptedBy")}:</dt><dd>{story.adapter_name}</dd></div>
              )}
              {story.edition_source && (
                <div className="flex gap-2"><dt className="shrink-0 text-ink-faint">{t("story", "editionSource")}:</dt><dd>{story.edition_source}</dd></div>
              )}
              {story.publication_details && (
                <div className="flex gap-2"><dt className="shrink-0 text-ink-faint">{t("story", "publicationDetails")}:</dt><dd>{story.publication_details}</dd></div>
              )}
            </dl>
          )}

          {story.content_notice && (
            <p className="mt-3 max-w-2xl rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay-dark">
              <strong>{t("story", "contentNotice")}:</strong> {story.content_notice}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-faint">
            <span>{chapters.length} {chapters.length === 1 ? t("story", "chapterSingular") : t("story", "chapters")}</span>
            {totalMinutes > 0 && <span>~{totalMinutes} {t("story", "minRead")}</span>}
            {story.published_at && <span>{t("story", "publishedOn")} {formatDate(story.published_at, locale)}</span>}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {chapters.length > 0 && (
              <ButtonLink to={chapterUrl(resumeChapter)} size="lg">
                {progress ? t("story", "continueReading") : t("story", "startReading")}
              </ButtonLink>
            )}
            {session ? (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => listMutation.mutate()}
                  disabled={listMutation.isPending}
                  aria-pressed={!!listQuery.data}
                >
                  {listQuery.data ? `✓ ${t("story", "saved")}` : t("story", "saveToLibrary")}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => likeMutation.mutate()}
                  disabled={likeMutation.isPending}
                  aria-pressed={!!likeQuery.data?.liked}
                >
                  {likeQuery.data?.liked ? t("story", "liked") : `♥ ${t("story", "like")}`}
                </Button>
                {!isOwner && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending}
                  >
                    {followQuery.data?.following ? t("story", "following") : t("story", "follow")}
                    {followQuery.data ? ` (${followQuery.data.count})` : ""}
                  </Button>
                )}
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

      <section className="mt-10 max-w-3xl">
        <h2 className="mb-4 font-serif text-2xl font-bold">
          {t("write", "chapters")} ({chapters.length})
        </h2>
        {chaptersQuery.isLoading ? <Spinner /> : chapters.length ? (
          <ol className="divide-y divide-ink/10 rounded-xl bg-white shadow-card">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <Link to={chapterStartUrl(c)} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-sage/40">
                  <span className="w-8 shrink-0 text-center font-serif text-lg text-ink-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.title}</span>
                    <span className="text-xs text-ink-faint">
                      {c.published_at ? timeAgo(c.published_at, locale) : ""}
                      {readingMinutes(c.word_count, story.language) > 0 ? ` · ${readingMinutes(c.word_count, story.language)} ${t("story", "minRead")}` : ""}
                    </span>
                  </span>
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
    enabled: !!profile && !!session && session.user.id !== profile.id,
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
