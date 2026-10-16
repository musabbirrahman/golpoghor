/**
 * Supabase-backed DataProvider. Requires VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY. Never uses the service-role key (browser code
 * only ever sees the anon key; RLS enforces authorization).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Appeal,
  AppealStatus,
  AppealTarget,
  AppNotification,
  Chapter,
  Comment,
  ModerationEvent,
  NotificationPrefs,
  NotificationType,
  Profile,
  ReadingProgress,
  Report,
  ReportStatus,
  ReportTarget,
  Session,
  Story,
} from "../types";
import type {
  ChapterInput,
  DataProvider,
  StoryFilters,
  StoryInput,
} from "../data-provider";
import { resolveNotificationPrefs } from "../data-provider";
import { AppError, countWords, docToText, slugify } from "../utils";

function mapAppeal(row: any): Appeal {
  const { author, ...rest } = row ?? {};
  return { ...rest, author: author ?? undefined };
}

const AUTHOR_JOIN = "author:profiles!stories_author_id_fkey(*)";
const STORY_JOIN = `*, ${AUTHOR_JOIN}`;

function mapStory(row: any): Story {
  const { author, ...rest } = row ?? {};
  return { ...rest, author: author ?? undefined };
}
function mapChapter(row: any): Chapter {
  const { story, ...rest } = row ?? {};
  return { ...rest, story: story ? mapStory(story) : undefined };
}
function mapComment(row: any): Comment {
  const { author, ...rest } = row ?? {};
  return { ...rest, author: author ?? undefined };
}
function mapEvent(row: any): ModerationEvent {
  const { moderator, ...rest } = row ?? {};
  return { ...rest, moderator: moderator ?? undefined };
}

function toAppError(e: any, fallbackCode = "generic"): AppError {
  const msg = e?.message ?? "Unknown error";
  if (e?.code === "23505") {
    if (/username/i.test(msg)) return new AppError("usernameTaken", msg);
    return new AppError("conflict", msg);
  }
  return new AppError(e?.code ?? fallbackCode, msg);
}

export class SupabaseProvider implements DataProvider {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;
  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }

  // ------------------------------------------------------------- auth
  async getSession(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { user: { id: u.id, email: u.email ?? "" } } : null;
  }

  onAuthChange(cb: (s: Session | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user;
      cb(u ? { user: { id: u.id, email: u.email ?? "" } } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  /** Ensure a profile row exists for the signed-in user (first login after signup). */
  private async ensureProfile(userId: string, email: string): Promise<void> {
    const { data } = await this.sb.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (data) return;
    const { data: u } = await this.sb.auth.getUser();
    const meta = (u?.user?.user_metadata ?? {}) as Record<string, string>;
    const username =
      (meta.username as string) ||
      email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) ||
      `reader_${userId.slice(0, 8)}`;
    const { error } = await this.sb.from("profiles").insert({
      id: userId,
      username,
      display_name: (meta.display_name as string) || username,
      locale: "bn",
      role: "reader",
    });
    if (error && error.code !== "23505") throw toAppError(error);
    if (error && error.code === "23505") {
      // username collided — retry with a suffix
      const alt = `${username}_${userId.slice(0, 4)}`;
      const { error: e2 } = await this.sb.from("profiles").insert({
        id: userId,
        username: alt,
        display_name: (meta.display_name as string) || alt,
        locale: "bn",
        role: "reader",
      });
      if (e2) throw toAppError(e2);
    }
  }

  async signUp(input: { email: string; password: string; username: string; displayName: string }) {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new AppError("invalidUsername", "Invalid username");
    if (input.password.length < 6) throw new AppError("weakPassword", "Password too short");
    const { data: taken } = await this.sb.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken) throw new AppError("usernameTaken", "This username is taken.");

    const { data, error } = await this.sb.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { username, display_name: input.displayName.trim() || username } },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message))
        throw new AppError("emailTaken", error.message);
      throw toAppError(error);
    }
    const user = data.user;
    const needsEmailConfirmation = !data.session;
    if (user && data.session) {
      try {
        await this.ensureProfile(user.id, input.email);
      } catch {
        /* profile will be created on first sign-in */
      }
    }
    return { needsEmailConfirmation };
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new AppError("signInFailed", error.message);
    if (data.user) {
      try {
        await this.ensureProfile(data.user.id, email);
      } catch {
        /* non-fatal */
      }
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    if (error) throw toAppError(error);
  }

  async resetPassword(email: string): Promise<void> {
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw toAppError(error);
  }

  async updatePassword(newPassword: string): Promise<void> {
    if (newPassword.length < 6) throw new AppError("weakPassword", "Password too short");
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) throw toAppError(error);
  }

  // ---------------------------------------------------------- profiles
  async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await this.sb.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw toAppError(error);
    return (data as Profile) ?? null;
  }

  async getProfileByUsername(username: string): Promise<Profile | null> {
    const { data, error } = await this.sb
      .from("profiles")
      .select("*")
      .eq("username", username.toLowerCase())
      .maybeSingle();
    if (error) throw toAppError(error);
    return (data as Profile) ?? null;
  }

  async updateProfile(
    id: string,
    patch: Partial<Pick<Profile, "display_name" | "bio" | "locale" | "notification_prefs">>
  ): Promise<Profile> {
    const { data, error } = await this.sb.from("profiles").update(patch).eq("id", id).select().single();
    if (error) throw toAppError(error);
    return data as Profile;
  }

  // ----------------------------------------------------------- stories
  async listStories(f: StoryFilters): Promise<{ stories: Story[]; total: number }> {
    const limit = f.limit ?? 24;
    const offset = f.offset ?? 0;
    let q = this.sb.from("stories").select(STORY_JOIN, { count: "exact" });

    if (f.includeDrafts) {
      // owner dashboard: RLS restricts to own rows anyway
      const session = await this.getSession();
      if (session) q = q.eq("author_id", session.user.id);
    } else {
      q = q.in("status", ["ongoing", "complete"]);
    }
    if (f.authorId) q = q.eq("author_id", f.authorId);
    if (f.language) q = q.eq("language", f.language);
    if (f.genre) q = q.eq("genre", f.genre);
    if (f.tag) q = q.contains("tags", [f.tag]);
    if (f.q) {
      const term = f.q.trim().replace(/[%_]/g, "");
      if (term) {
        // author username match expands the search
        const { data: authors } = await this.sb
          .from("profiles")
          .select("id")
          .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
          .limit(20);
        const authorIds = (authors ?? []).map((a: any) => a.id);
        const ors = [`title.ilike.%${term}%`, `summary.ilike.%${term}%`];
        if (authorIds.length) ors.push(`author_id.in.(${authorIds.join(",")})`);
        q = q.or(ors.join(","));
      }
    }
    if (f.sort === "most_viewed") {
      // tracked view counts first, newest first as tie-breaker
      q = q.order("view_count", { ascending: false }).order("published_at", { ascending: false, nullsFirst: false });
    } else if (f.sort === "popular") {
      q = q.order("view_count", { ascending: false });
    } else {
      q = q.order("published_at", { ascending: false, nullsFirst: false });
    }
    q = q.range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw toAppError(error);
    const stories = (data ?? []).map(mapStory);
    await this.attachCounts(stories);
    return { stories, total: count ?? stories.length };
  }

  private async attachCounts(stories: Story[]): Promise<void> {
    if (!stories.length) return;
    const ids = stories.map((s) => s.id);
    const [{ data: ch }, { data: likes }] = await Promise.all([
      this.sb.from("chapters").select("story_id").in("story_id", ids).eq("status", "published"),
      this.sb.from("likes").select("story_id").in("story_id", ids),
    ]);
    const chCount = new Map<string, number>();
    for (const c of ch ?? []) chCount.set(c.story_id, (chCount.get(c.story_id) ?? 0) + 1);
    const likeCount = new Map<string, number>();
    for (const l of likes ?? []) likeCount.set(l.story_id, (likeCount.get(l.story_id) ?? 0) + 1);
    for (const s of stories) {
      s.chapter_count = chCount.get(s.id) ?? 0;
      s.like_count = likeCount.get(s.id) ?? 0;
    }
  }

  async getStory(id: string): Promise<Story | null> {
    const { data, error } = await this.sb.from("stories").select(STORY_JOIN).eq("id", id).maybeSingle();
    if (error) throw toAppError(error);
    if (!data) return null;
    const story = mapStory(data);
    await this.attachCounts([story]);
    return story;
  }

  async getStoryBySlug(authorUsername: string, slug: string): Promise<Story | null> {
    const profile = await this.getProfileByUsername(authorUsername);
    if (!profile) return null;
    const { data, error } = await this.sb
      .from("stories")
      .select(STORY_JOIN)
      .eq("author_id", profile.id)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw toAppError(error);
    if (!data) return null;
    const story = mapStory(data);
    const session = await this.getSession();
    const isOwner = session?.user.id === story.author_id;
    // RLS already hides drafts from non-owners; double-guard here too.
    if (!isOwner && (story.status === "draft" || story.status === "hidden")) return null;
    await this.attachCounts([story]);
    return story;
  }

  async createStory(input: StoryInput): Promise<Story> {
    const session = await this.getSession();
    if (!session) throw new AppError("signInRequired", "Sign in required");
    const slug = slugify(input.slug || input.title);
    const { data, error } = await this.sb
      .from("stories")
      .insert({
        author_id: session.user.id,
        title: input.title.trim(),
        slug,
        summary: input.summary.trim(),
        language: input.language,
        genre: input.genre.trim() || "general",
        tags: input.tags,
        content_notice: (input.content_notice ?? "").trim(),
        status: "draft",
      })
      .select(STORY_JOIN)
      .single();
    if (error) throw toAppError(error);
    return mapStory(data);
  }

  /** Publishing gate: entering ongoing/complete needs a published chapter. */
  private async publishedChapterCount(storyId: string): Promise<number> {
    const { count, error } = await this.sb
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("story_id", storyId)
      .eq("status", "published");
    if (error) throw toAppError(error);
    return count ?? 0;
  }

  private async requirePublishable(storyId: string): Promise<void> {
    if ((await this.publishedChapterCount(storyId)) === 0)
      throw new AppError("noPublishedChapters", "Publish at least one chapter first");
  }

  private async currentStoryStatus(id: string): Promise<Story["status"] | null> {
    const { data } = await this.sb.from("stories").select("status").eq("id", id).maybeSingle();
    return (data as { status: Story["status"] } | null)?.status ?? null;
  }

  async updateStory(id: string, patch: Partial<StoryInput & { status: Story["status"]; cover_path: string | null }>): Promise<Story> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title.trim();
    if (patch.slug !== undefined) body.slug = slugify(patch.slug || patch.title || "");
    if (patch.summary !== undefined) body.summary = patch.summary.trim();
    if (patch.language !== undefined) body.language = patch.language;
    if (patch.genre !== undefined) body.genre = patch.genre.trim() || "general";
    if (patch.tags !== undefined) body.tags = patch.tags;
    if (patch.content_notice !== undefined) body.content_notice = patch.content_notice.trim();
    if (patch.status !== undefined) {
      const enteringPublic =
        (patch.status === "ongoing" || patch.status === "complete") &&
        !["ongoing", "complete"].includes((await this.currentStoryStatus(id)) ?? "");
      if (enteringPublic) await this.requirePublishable(id);
      body.status = patch.status;
      if ((patch.status === "ongoing" || patch.status === "complete") && !body.published_at) {
        body.published_at = new Date().toISOString();
      }
    }
    if (patch.cover_path !== undefined) body.cover_path = patch.cover_path;
    const { data, error } = await this.sb.from("stories").update(body).eq("id", id).select(STORY_JOIN).single();
    if (error) throw toAppError(error);
    return mapStory(data);
  }

  async deleteStory(id: string): Promise<void> {
    const { error } = await this.sb.from("stories").delete().eq("id", id);
    if (error) throw toAppError(error);
  }

  async listGenres(): Promise<string[]> {
    const { data, error } = await this.sb
      .from("stories")
      .select("genre")
      .in("status", ["ongoing", "complete"])
      .limit(500);
    if (error) throw toAppError(error);
    return [...new Set((data ?? []).map((r: any) => r.genre as string))].sort();
  }

  // ---------------------------------------------------------- chapters
  async listChapters(storyId: string, opts?: { publishedOnly?: boolean }): Promise<Chapter[]> {
    let q = this.sb.from("chapters").select("*").eq("story_id", storyId).order("position");
    if (opts?.publishedOnly !== false) q = q.eq("status", "published");
    const { data, error } = await q;
    if (error) throw toAppError(error);
    return (data ?? []) as Chapter[];
  }

  async getChapterBySlug(storyId: string, slug: string, opts?: { publishedOnly?: boolean }): Promise<Chapter | null> {
    let q = this.sb.from("chapters").select("*").eq("story_id", storyId).eq("slug", slug);
    if (opts?.publishedOnly !== false) q = q.eq("status", "published");
    const { data, error } = await q.maybeSingle();
    if (error) throw toAppError(error);
    return (data as Chapter) ?? null;
  }

  async getChapter(id: string): Promise<Chapter | null> {
    const { data, error } = await this.sb
      .from("chapters")
      .select(`*, story:stories!chapters_story_id_fkey(${STORY_JOIN})`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toAppError(error);
    return data ? mapChapter(data) : null;
  }

  async createChapter(storyId: string, input: ChapterInput): Promise<Chapter> {
    const existing = await this.listChapters(storyId, { publishedOnly: false });
    const text = docToText(input.body);
    const { data, error } = await this.sb
      .from("chapters")
      .insert({
        story_id: storyId,
        title: input.title.trim(),
        slug: slugify(input.slug || input.title),
        body_json: input.body,
        body_text: text,
        position: existing.length,
        word_count: countWords(text),
        status: "draft",
      })
      .select()
      .single();
    if (error) throw toAppError(error);
    return data as Chapter;
  }

  async updateChapter(id: string, patch: Partial<ChapterInput & { status: Chapter["status"] }>): Promise<Chapter> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title.trim();
    if (patch.slug !== undefined) body.slug = slugify(patch.slug || patch.title || "");
    if (patch.body !== undefined) {
      body.body_json = patch.body;
      const text = docToText(patch.body);
      body.body_text = text;
      body.word_count = countWords(text);
    }
    let prevStatus: string | null = null;
    if (patch.status !== undefined) {
      const { data: prev } = await this.sb.from("chapters").select("status").eq("id", id).maybeSingle();
      prevStatus = (prev as { status: string } | null)?.status ?? null;
      body.status = patch.status;
      if (patch.status === "published") body.published_at = new Date().toISOString();
    }
    const { data, error } = await this.sb.from("chapters").update(body).eq("id", id).select().single();
    if (error) throw toAppError(error);
    const chapter = data as Chapter;
    if (patch.status === "published" && prevStatus !== "published") {
      await this.notifyNewChapter(chapter.story_id, chapter).catch(() => {});
    }
    return chapter;
  }

  async deleteChapter(id: string): Promise<void> {
    const { error } = await this.sb.from("chapters").delete().eq("id", id);
    if (error) throw toAppError(error);
  }

  // ------------------------------------------------------------ social
  private async uid(): Promise<string> {
    const s = await this.getSession();
    if (!s) throw new AppError("signInRequired", "Sign in required");
    return s.user.id;
  }

  async isFollowing(authorId: string): Promise<boolean> {
    const me = await this.getSession();
    if (!me) return false;
    const { data } = await this.sb
      .from("follows")
      .select("author_id")
      .eq("follower_id", me.user.id)
      .eq("author_id", authorId)
      .maybeSingle();
    return !!data;
  }

  async toggleFollow(authorId: string): Promise<boolean> {
    const me = await this.uid();
    if (me === authorId) throw new AppError("generic", "You cannot follow yourself");
    const { data } = await this.sb
      .from("follows")
      .select("author_id")
      .eq("follower_id", me)
      .eq("author_id", authorId)
      .maybeSingle();
    if (data) {
      const { error } = await this.sb.from("follows").delete().eq("follower_id", me).eq("author_id", authorId);
      if (error) throw toAppError(error);
      return false;
    }
    const { error } = await this.sb.from("follows").insert({ follower_id: me, author_id: authorId });
    if (error) throw toAppError(error);
    return true;
  }

  async getFollowerCount(authorId: string): Promise<number> {
    const { count, error } = await this.sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("author_id", authorId);
    if (error) throw toAppError(error);
    return count ?? 0;
  }

  async getFollowing(userId: string): Promise<Profile[]> {
    const { data, error } = await this.sb
      .from("follows")
      .select("author:profiles!follows_author_id_fkey(*)")
      .eq("follower_id", userId);
    if (error) throw toAppError(error);
    return (data ?? []).map((r: any) => r.author as Profile);
  }

  async hasLiked(storyId: string): Promise<boolean> {
    const me = await this.getSession();
    if (!me) return false;
    const { data } = await this.sb.from("likes").select("story_id").eq("user_id", me.user.id).eq("story_id", storyId).maybeSingle();
    return !!data;
  }

  async toggleLike(storyId: string): Promise<boolean> {
    const me = await this.uid();
    const { data } = await this.sb.from("likes").select("story_id").eq("user_id", me).eq("story_id", storyId).maybeSingle();
    if (data) {
      const { error } = await this.sb.from("likes").delete().eq("user_id", me).eq("story_id", storyId);
      if (error) throw toAppError(error);
      return false;
    }
    const { error } = await this.sb.from("likes").insert({ user_id: me, story_id: storyId });
    if (error) throw toAppError(error);
    return true;
  }

  async getLikeCount(storyId: string): Promise<number> {
    const { count, error } = await this.sb.from("likes").select("story_id", { count: "exact", head: true }).eq("story_id", storyId);
    if (error) throw toAppError(error);
    return count ?? 0;
  }

  async isInReadingList(storyId: string): Promise<boolean> {
    const me = await this.getSession();
    if (!me) return false;
    const { data } = await this.sb.from("reading_list").select("story_id").eq("user_id", me.user.id).eq("story_id", storyId).maybeSingle();
    return !!data;
  }

  async toggleReadingList(storyId: string): Promise<boolean> {
    const me = await this.uid();
    const { data } = await this.sb.from("reading_list").select("story_id").eq("user_id", me).eq("story_id", storyId).maybeSingle();
    if (data) {
      const { error } = await this.sb.from("reading_list").delete().eq("user_id", me).eq("story_id", storyId);
      if (error) throw toAppError(error);
      return false;
    }
    const { error } = await this.sb.from("reading_list").insert({ user_id: me, story_id: storyId });
    if (error) throw toAppError(error);
    return true;
  }

  async getReadingList(): Promise<Story[]> {
    const me = await this.uid();
    const { data, error } = await this.sb
      .from("reading_list")
      .select(`story:stories!reading_list_story_id_fkey(${STORY_JOIN})`)
      .eq("user_id", me)
      .order("created_at", { ascending: false });
    if (error) throw toAppError(error);
    const stories = (data ?? []).map((r: any) => mapStory(r.story)).filter(Boolean);
    await this.attachCounts(stories);
    return stories;
  }

  async getProgress(storyId: string): Promise<ReadingProgress | null> {
    const me = await this.getSession();
    if (!me) return null;
    const { data, error } = await this.sb
      .from("reading_progress")
      .select("*")
      .eq("user_id", me.user.id)
      .eq("story_id", storyId)
      .maybeSingle();
    if (error) throw toAppError(error);
    return (data as ReadingProgress) ?? null;
  }

  async saveProgress(storyId: string, chapterId: string | null, scrollRatio: number): Promise<void> {
    const me = await this.getSession();
    if (!me) return; // guests don't get progress
    const { error } = await this.sb.from("reading_progress").upsert(
      { user_id: me.user.id, story_id: storyId, chapter_id: chapterId, scroll_ratio: Math.min(1, Math.max(0, scrollRatio)), updated_at: new Date().toISOString() },
      { onConflict: "user_id,story_id" }
    );
    if (error) throw toAppError(error);
  }

  async getInProgressStories(): Promise<{ story: Story; progress: ReadingProgress }[]> {
    const me = await this.uid();
    const { data, error } = await this.sb
      .from("reading_progress")
      .select(`*, story:stories!reading_progress_story_id_fkey(${STORY_JOIN})`)
      .eq("user_id", me)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw toAppError(error);
    const out: { story: Story; progress: ReadingProgress }[] = [];
    for (const r of data ?? []) {
      if (!r.story) continue;
      const { story, ...prog } = r;
      out.push({ story: mapStory(story), progress: prog as ReadingProgress });
    }
    await this.attachCounts(out.map((o) => o.story));
    return out;
  }

  // ---------------------------------------------------------- comments
  async listComments(chapterId: string): Promise<Comment[]> {
    const { data, error } = await this.sb
      .from("comments")
      .select("*, author:profiles!comments_author_id_fkey(*)")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: true });
    if (error) throw toAppError(error);
    return (data ?? []).map(mapComment);
  }

  async createComment(chapterId: string, body: string): Promise<Comment> {
    const me = await this.uid();
    const text = body.trim();
    if (!text) throw new AppError("generic", "Comment is empty");
    if (text.length > 2000) throw new AppError("generic", "Comment too long");
    const { data, error } = await this.sb
      .from("comments")
      .insert({ chapter_id: chapterId, author_id: me, body: text, status: "visible" })
      .select("*, author:profiles!comments_author_id_fkey(*)")
      .single();
    if (error) throw toAppError(error);
    return mapComment(data);
  }

  async deleteComment(id: string): Promise<void> {
    const { error } = await this.sb.from("comments").delete().eq("id", id);
    if (error) throw toAppError(error);
  }

  // ------------------------------------------- notification helpers
  private async prefsOf(userId: string): Promise<Required<NotificationPrefs>> {
    const { data } = await this.sb
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();
    return resolveNotificationPrefs((data as { notification_prefs?: NotificationPrefs } | null)?.notification_prefs);
  }

  private async pushNotification(
    userId: string,
    type: NotificationType,
    data: Record<string, string>,
    link: string | null
  ): Promise<void> {
    // Creation goes through the hardened SECURITY DEFINER function
    // (migration 20261016140001); clients can no longer insert rows directly.
    const { error } = await this.sb.rpc("notify_user", {
      p_user_id: userId,
      p_type: type,
      p_data: data,
      p_link: link,
    });
    if (error) throw toAppError(error);
  }

  /** Best-effort: notification failures must never break the main action. */
  private async tryNotify(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch {
      /* notifications are auxiliary */
    }
  }

  private async moderatorIds(): Promise<string[]> {
    const { data } = await this.sb.from("profiles").select("id").in("role", ["moderator", "admin"]);
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  private async notifyModerators(
    type: Extract<NotificationType, "report_received" | "appeal_submitted">,
    data: Record<string, string>,
    link: string | null
  ): Promise<void> {
    const ids = await this.moderatorIds();
    for (const id of ids) {
      if (!(await this.prefsOf(id)).moderator_alerts) continue;
      await this.pushNotification(id, type, data, link);
    }
  }

  private async notifyNewChapter(storyId: string, chapter: Chapter): Promise<void> {
    const { data: story } = await this.sb
      .from("stories")
      .select(`id, slug, title, author_id, author:profiles!stories_author_id_fkey(username, display_name)`)
      .eq("id", storyId)
      .maybeSingle();
    if (!story) return;
    const st = story as any;
    const { data: follows } = await this.sb.from("follows").select("follower_id").eq("author_id", st.author_id);
    const link = `/stories/${st.author?.username}/${st.slug}/${chapter.slug}`;
    for (const f of (follows ?? []) as { follower_id: string }[]) {
      if (f.follower_id === st.author_id) continue;
      if (!(await this.prefsOf(f.follower_id)).new_chapter) continue;
      await this.pushNotification(f.follower_id, "new_chapter", {
        authorName: st.author?.display_name ?? "",
        authorUsername: st.author?.username ?? "",
        storyId: st.id ?? "",
        storyTitle: st.title ?? "",
        storySlug: st.slug ?? "",
        chapterTitle: chapter.title,
        chapterSlug: chapter.slug,
      }, link);
    }
  }

  private async notifyContentAuthor(
    kind: Extract<NotificationType, "content_hidden" | "content_restored">,
    targetType: ReportTarget,
    targetId: string,
    authorId: string,
    extra: Record<string, string> = {}
  ): Promise<void> {
    if (!(await this.prefsOf(authorId)).moderation_updates) return;
    const t = await this.resolveReportTarget(targetType, targetId).catch(() => null);
    await this.pushNotification(authorId, kind, { targetType, targetLabel: t?.label ?? targetType, ...extra }, t?.url ?? null);
  }

  // ----------------------------------------------------------- reports
  async createReport(targetType: ReportTarget, targetId: string, reason: string, details: string): Promise<Report> {
    const me = await this.uid();
    const { data, error } = await this.sb
      .from("reports")
      .insert({ reporter_id: me, target_type: targetType, target_id: targetId, reason: reason.trim().slice(0, 120), details: details.trim().slice(0, 2000), status: "open" })
      .select()
      .single();
    if (error) throw toAppError(error);
    const report = data as Report;
    await this.tryNotify(async () => {
      const target = await this.resolveReportTarget(targetType, targetId).catch(() => null);
      await this.notifyModerators("report_received", {
        targetType,
        reason: report.reason,
        targetLabel: target?.label ?? "",
      }, "/admin/reports");
    });
    return report;
  }

  async listReports(status?: ReportStatus): Promise<Report[]> {
    let q = this.sb.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw toAppError(error);
    return (data ?? []) as Report[];
  }

  async updateReport(id: string, status: ReportStatus): Promise<Report> {
    const me = await this.uid();
    const patch: Record<string, unknown> = { status };
    if (status === "resolved" || status === "dismissed") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = me;
    }
    const { data, error } = await this.sb.from("reports").update(patch).eq("id", id).select().single();
    if (error) throw toAppError(error);
    const report = data as Report;
    if (status === "in_review" || status === "resolved" || status === "dismissed") {
      await this.tryNotify(async () => {
        if (!(await this.prefsOf(report.reporter_id)).report_updates) return;
        const target = await this.resolveReportTarget(report.target_type, report.target_id).catch(() => null);
        await this.pushNotification(report.reporter_id, "report_update", {
          targetLabel: target?.label ?? report.target_type,
          status,
        }, target?.url ?? null);
      });
    }
    return report;
  }

  // -------------------------------------------------------- moderation
  async listModerationEvents(targetType?: ReportTarget, targetId?: string): Promise<ModerationEvent[]> {
    let q = this.sb
      .from("moderation_events")
      .select("*, moderator:profiles!moderation_events_moderator_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (targetType) q = q.eq("target_type", targetType);
    if (targetId) q = q.eq("target_id", targetId);
    const { data, error } = await q;
    if (error) throw toAppError(error);
    return (data ?? []).map(mapEvent);
  }

  async logModerationEvent(action: string, targetType: ReportTarget, targetId: string, details: Record<string, unknown>): Promise<ModerationEvent> {
    const me = await this.uid();
    const { data, error } = await this.sb
      .from("moderation_events")
      .insert({ moderator_id: me, action, target_type: targetType, target_id: targetId, details })
      .select()
      .single();
    if (error) throw toAppError(error);
    return data as ModerationEvent;
  }

  async moderateStory(id: string, status: "hidden" | "ongoing" | "complete"): Promise<void> {
    const me = await this.uid();
    const before = await this.getStory(id);
    const enteringPublic =
      (status === "ongoing" || status === "complete") &&
      before?.status !== "ongoing" && before?.status !== "complete";
    if (enteringPublic) await this.requirePublishable(id);
    const { error } = await this.sb.from("stories").update({ status }).eq("id", id);
    if (error) throw toAppError(error);
    await this.logModerationEvent(status === "hidden" ? "hide_story" : "restore_story", "story", id, { from: before?.status ?? null, to: status, by: me });
    if (status === "hidden" && before?.author_id) {
      await this.tryNotify(() => this.notifyContentAuthor("content_hidden", "story", id, before.author_id));
    }
  }

  async moderateChapter(id: string, status: "hidden" | "published"): Promise<void> {
    const me = await this.uid();
    const before = await this.getChapter(id);
    const { error } = await this.sb.from("chapters").update({ status }).eq("id", id);
    if (error) throw toAppError(error);
    await this.logModerationEvent(status === "hidden" ? "hide_chapter" : "restore_chapter", "chapter", id, { to: status, by: me });
    if (status === "hidden" && before?.story?.author_id) {
      const storyGonePublic =
        (before.story.status === "ongoing" || before.story.status === "complete") &&
        (await this.publishedChapterCount(before.story.id)) === 0;
      await this.tryNotify(() => this.notifyContentAuthor(
        "content_hidden", "chapter", id, before.story!.author_id,
        storyGonePublic ? { storyHidden: "true" } : {}
      ));
    }
  }

  async moderateComment(id: string, status: "hidden" | "removed" | "visible"): Promise<void> {
    const me = await this.uid();
    const { data: before } = await this.sb.from("comments").select("author_id").eq("id", id).maybeSingle();
    const { error } = await this.sb.from("comments").update({ status }).eq("id", id);
    if (error) throw toAppError(error);
    await this.logModerationEvent("moderate_comment", "comment", id, { to: status, by: me });
    const authorId = (before as { author_id: string } | null)?.author_id;
    if (status === "hidden" && authorId) {
      await this.tryNotify(() => this.notifyContentAuthor("content_hidden", "comment", id, authorId));
    }
  }

  /** Pre-hide status from the audit trail (for restoring stories). */
  private async preHideStatus(targetId: string): Promise<"ongoing" | "complete"> {
    const { data } = await this.sb
      .from("moderation_events")
      .select("details")
      .eq("action", "hide_story")
      .eq("target_id", targetId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const from = (data as { details?: { from?: string } } | null)?.details?.from;
    return from === "complete" ? "complete" : "ongoing";
  }

  async restoreStory(id: string): Promise<void> {
    const me = await this.uid();
    const before = await this.getStory(id);
    if (!before) throw new AppError("notFound", "Story not found");
    if (before.status !== "hidden") throw new AppError("generic", "Story is not hidden");
    const to = await this.preHideStatus(id);
    await this.requirePublishable(id);
    const { error } = await this.sb.from("stories").update({ status: to }).eq("id", id);
    if (error) throw toAppError(error);
    await this.logModerationEvent("restore_story", "story", id, { from: "hidden", to, by: me });
    await this.tryNotify(() => this.notifyContentAuthor("content_restored", "story", id, before.author_id));
  }

  async restoreChapter(id: string): Promise<void> {
    const me = await this.uid();
    const before = await this.getChapter(id);
    if (!before) throw new AppError("notFound", "Chapter not found");
    if (before.status !== "hidden") throw new AppError("generic", "Chapter is not hidden");
    const { error } = await this.sb.from("chapters").update({ status: "published" }).eq("id", id);
    if (error) throw toAppError(error);
    await this.logModerationEvent("restore_chapter", "chapter", id, { from: "hidden", to: "published", by: me });
    if (before.story?.author_id) {
      await this.tryNotify(() => this.notifyContentAuthor("content_restored", "chapter", id, before.story!.author_id));
    }
  }

  async restoreComment(id: string): Promise<void> {
    const me = await this.uid();
    const { data: before } = await this.sb.from("comments").select("status, author_id").eq("id", id).maybeSingle();
    const row = before as { status: string; author_id: string } | null;
    if (!row) throw new AppError("notFound", "Comment not found");
    if (row.status !== "hidden") throw new AppError("generic", "Comment is not hidden");
    const { error } = await this.sb.from("comments").update({ status: "visible" }).eq("id", id);
    if (error) throw toAppError(error);
    await this.logModerationEvent("moderate_comment", "comment", id, { from: "hidden", to: "visible", by: me });
    await this.tryNotify(() => this.notifyContentAuthor("content_restored", "comment", id, row.author_id));
  }

  // ------------------------------------------------------------ appeals
  private async appealTargetOwner(
    targetType: AppealTarget,
    targetId: string
  ): Promise<{ ownerId: string; hidden: boolean }> {
    if (targetType === "story") {
      const { data } = await this.sb.from("stories").select("author_id, status").eq("id", targetId).maybeSingle();
      const s = data as { author_id: string; status: string } | null;
      return { ownerId: s?.author_id ?? "", hidden: s?.status === "hidden" };
    }
    const { data } = await this.sb
      .from("chapters")
      .select("status, story:stories!chapters_story_id_fkey(author_id)")
      .eq("id", targetId)
      .maybeSingle();
    const c = data as { status: string; story: { author_id: string } } | null;
    return { ownerId: c?.story?.author_id ?? "", hidden: c?.status === "hidden" };
  }

  async createAppeal(targetType: AppealTarget, targetId: string, reason: string): Promise<Appeal> {
    const me = await this.uid();
    const text = reason.trim();
    if (!text) throw new AppError("generic", "Please give a reason");
    if (text.length > 1000) throw new AppError("generic", "Reason too long");
    const t = await this.appealTargetOwner(targetType, targetId);
    if (!t.ownerId) throw new AppError("notFound", "Content not found");
    if (t.ownerId !== me) throw new AppError("notAuthor", "Only the author can appeal");
    if (!t.hidden) throw new AppError("generic", "Only hidden content can be appealed");
    const { data, error } = await this.sb
      .from("appeals")
      .insert({ author_id: me, target_type: targetType, target_id: targetId, reason: text })
      .select()
      .single();
    if (error) throw toAppError(error);
    const appeal = data as Appeal;
    await this.tryNotify(async () => {
      const target = await this.resolveReportTarget(targetType, targetId).catch(() => null);
      const { data: writer } = await this.sb.from("profiles").select("display_name").eq("id", me).maybeSingle();
      await this.notifyModerators("appeal_submitted", {
        authorName: (writer as { display_name: string } | null)?.display_name ?? "",
        targetLabel: target?.label ?? targetType,
      }, "/admin/reports");
    });
    return this.withAppealContext(appeal);
  }

  private withAppealContext(a: Appeal): Appeal {
    // target_label/url are resolved lazily by callers via resolveReportTarget
    return { ...a };
  }

  private async attachAppealContext(appeals: Appeal[]): Promise<Appeal[]> {
    return Promise.all(
      appeals.map(async (a) => {
        const target = await this.resolveReportTarget(a.target_type, a.target_id).catch(() => null);
        const { data: author } = await this.sb.from("profiles").select("*").eq("id", a.author_id).maybeSingle();
        return { ...a, author: (author as Profile | null) ?? undefined, target_label: target?.label, target_url: target?.url ?? null };
      })
    );
  }

  async listMyAppeals(): Promise<Appeal[]> {
    const me = await this.uid();
    const { data, error } = await this.sb
      .from("appeals")
      .select("*")
      .eq("author_id", me)
      .order("created_at", { ascending: false });
    if (error) throw toAppError(error);
    return this.attachAppealContext((data ?? []).map(mapAppeal));
  }

  async listAppeals(status?: AppealStatus): Promise<Appeal[]> {
    let q = this.sb.from("appeals").select("*, author:profiles!appeals_author_id_fkey(*)").order("created_at", { ascending: false }).limit(100);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw toAppError(error);
    const appeals = (data ?? []).map(mapAppeal);
    return Promise.all(
      appeals.map(async (a) => {
        const target = await this.resolveReportTarget(a.target_type, a.target_id).catch(() => null);
        return { ...a, target_label: target?.label, target_url: target?.url ?? null };
      })
    );
  }

  async decideAppeal(id: string, decision: "approved" | "declined", note: string): Promise<Appeal> {
    const me = await this.uid();
    const { data: existing } = await this.sb.from("appeals").select("status").eq("id", id).maybeSingle();
    if (!existing) throw new AppError("notFound", "Appeal not found");
    if ((existing as { status: string }).status !== "pending") throw new AppError("generic", "Appeal already decided");
    const now = new Date().toISOString();
    const { data, error } = await this.sb
      .from("appeals")
      .update({ status: decision, decision_note: note.trim().slice(0, 1000), decided_by: me, decided_at: now })
      .eq("id", id)
      .select()
      .single();
    if (error) throw toAppError(error);
    const appeal = data as Appeal;
    await this.logModerationEvent(
      decision === "approved" ? "appeal_approved" : "appeal_declined",
      appeal.target_type,
      appeal.target_id,
      { appeal_id: appeal.id, note: appeal.decision_note, by: me }
    );
    await this.tryNotify(async () => {
      if (!(await this.prefsOf(appeal.author_id)).moderation_updates) return;
      const target = await this.resolveReportTarget(appeal.target_type, appeal.target_id).catch(() => null);
      await this.pushNotification(appeal.author_id, "appeal_decision", {
        targetLabel: target?.label ?? appeal.target_type,
        decision,
        note: appeal.decision_note,
      }, "/write");
    });
    return this.withAppealContext(appeal);
  }

  // ------------------------------------------------------ notifications
  async recordStoryView(storyId: string): Promise<boolean> {
    const { data, error } = await this.sb.rpc("record_story_view", { p_story_id: storyId });
    if (error) throw toAppError(error);
    return data === true;
  }

  async listNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<AppNotification[]> {
    const me = await this.uid();
    let q = this.sb.from("notifications").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(opts?.limit ?? 50);
    if (opts?.unreadOnly) q = q.eq("is_read", false);
    const { data, error } = await q;
    if (error) throw toAppError(error);
    return (data ?? []) as AppNotification[];
  }

  async getUnreadNotificationCount(): Promise<number> {
    const me = await this.uid();
    const { count, error } = await this.sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me)
      .eq("is_read", false);
    if (error) throw toAppError(error);
    return count ?? 0;
  }

  async markNotificationRead(id: string, read = true): Promise<void> {
    const { error } = await this.sb.from("notifications").update({ is_read: read }).eq("id", id);
    if (error) throw toAppError(error);
  }

  async markAllNotificationsRead(): Promise<void> {
    const me = await this.uid();
    const { error } = await this.sb.from("notifications").update({ is_read: true }).eq("user_id", me).eq("is_read", false);
    if (error) throw toAppError(error);
  }

  async resolveReportTarget(
    targetType: ReportTarget,
    targetId: string
  ): Promise<{ label: string; url: string | null; status: string | null } | null> {
    if (targetType === "story") {
      const s = await this.getStory(targetId);
      if (!s) return null;
      return { label: s.title, url: `/stories/${s.author?.username}/${s.slug}`, status: s.status };
    }
    if (targetType === "chapter") {
      const c = await this.getChapter(targetId);
      if (!c?.story) return null;
      return {
        label: `${c.story.title} — ${c.title}`,
        url: `/stories/${c.story.author?.username}/${c.story.slug}/${c.slug}`,
        status: c.status,
      };
    }
    if (targetType === "comment") {
      const { data, error } = await this.sb
        .from("comments")
        .select("id, body, status, chapter:chapters!comments_chapter_id_fkey(id, slug, story:stories!chapters_story_id_fkey(title, slug, author:profiles!stories_author_id_fkey(username)))")
        .eq("id", targetId)
        .maybeSingle();
      if (error || !data) return null;
      const ch = (data as any).chapter;
      const st = ch?.story;
      const context = st && ch ? ` (${st.title} — ${ch.title})` : "";
      return {
        label: `Comment${context}: ${((data as any).body as string).slice(0, 80)}`,
        url: st ? `/stories/${st.author?.username}/${st.slug}/${ch.slug}` : null,
        status: (data as any).status ?? null,
      };
    }
    const p = await this.getProfile(targetId);
    if (!p) return null;
    return { label: p.display_name, url: `/authors/${p.username}`, status: null };
  }

  // ----------------------------------------------------------- storage
  async uploadCover(file: File): Promise<string> {
    const me = await this.uid();
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new AppError("generic", "Only JPG, PNG or WebP images");
    if (file.size > 2 * 1024 * 1024) throw new AppError("generic", "Image must be under 2 MB");
    const ext = file.type.split("/")[1];
    const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await this.sb.storage.from("covers").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw toAppError(error);
    return path;
  }

  coverUrl(path: string | null): string | null {
    if (!path) return null;
    return this.sb.storage.from("covers").getPublicUrl(path).data.publicUrl;
  }
}
