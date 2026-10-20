/**
 * DataProvider: the single seam between UI and backend.
 * Two implementations: Supabase (real) and Demo (localStorage, for
 * trying the app without credentials). The UI never touches either directly.
 */
import type {
  Appeal,
  AppealStatus,
  AppealTarget,
  AppNotification,
  AuthUser,
  Chapter,
  Comment,
  ModerationEvent,
  NotificationPrefs,
  Profile,
  ReadingPosition,
  ReadingProgress,
  Report,
  ReportStatus,
  ReportTarget,
  Session,
  Story,
  StoryLanguage,
  StoryStatus,
  TiptapDoc,
} from "./types";

export interface StoryFilters {
  language?: StoryLanguage;
  genre?: string;
  tag?: string;
  q?: string;
  authorId?: string;
  /** default: published only (ongoing+complete) */
  includeDrafts?: boolean;
  sort?: "newest" | "popular" | "most_viewed";
  limit?: number;
  offset?: number;
}

export interface StoryInput {
  title: string;
  slug?: string;
  summary: string;
  language: StoryLanguage;
  genre: string;
  tags: string[];
  content_notice?: string;
}

export interface ChapterInput {
  title: string;
  slug?: string;
  body: TiptapDoc;
}

export interface DataProvider {
  readonly kind: "supabase" | "demo";

  // ------------------------------------------------------------- auth
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (session: Session | null) => void): () => void;
  signUp(input: {
    email: string;
    password: string;
    username: string;
    displayName: string;
  }): Promise<{ needsEmailConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Create the caller's profile row if it is missing (self-heal after signup). */
  ensureOwnProfile(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;

  // ---------------------------------------------------------- profiles
  getProfile(id: string): Promise<Profile | null>;
  getProfileByUsername(username: string): Promise<Profile | null>;
  updateProfile(
    id: string,
    patch: Partial<Pick<Profile, "display_name" | "bio" | "locale">>
  ): Promise<Profile>;
  /** Owner-only notification preferences (separate RLS-protected table). */
  getNotificationPrefs(): Promise<Required<NotificationPrefs>>;
  updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void>;

  // ----------------------------------------------------------- stories
  listStories(filters: StoryFilters): Promise<{ stories: Story[]; total: number }>;
  getStory(id: string): Promise<Story | null>;
  /** Public lookup by author username + slug. Returns null for drafts unless owner. */
  getStoryBySlug(authorUsername: string, slug: string): Promise<Story | null>;
  createStory(input: StoryInput): Promise<Story>;
  updateStory(id: string, patch: Partial<StoryInput & { status: StoryStatus; cover_path: string | null }>): Promise<Story>;
  deleteStory(id: string): Promise<void>;
  listGenres(): Promise<string[]>;

  // ---------------------------------------------------------- chapters
  /** publishedOnly=false is owner-only (dashboard, editor). */
  listChapters(storyId: string, opts?: { publishedOnly?: boolean }): Promise<Chapter[]>;
  getChapterBySlug(storyId: string, slug: string, opts?: { publishedOnly?: boolean }): Promise<Chapter | null>;
  getChapter(id: string): Promise<Chapter | null>;
  createChapter(storyId: string, input: ChapterInput): Promise<Chapter>;
  updateChapter(id: string, patch: Partial<ChapterInput & { status: Chapter["status"] }>): Promise<Chapter>;
  deleteChapter(id: string): Promise<void>;

  // ------------------------------------------------------------ social
  isFollowing(authorId: string): Promise<boolean>;
  toggleFollow(authorId: string): Promise<boolean>;
  getFollowerCount(authorId: string): Promise<number>;
  getFollowing(userId: string): Promise<Profile[]>;

  hasLiked(storyId: string): Promise<boolean>;
  toggleLike(storyId: string): Promise<boolean>;
  getLikeCount(storyId: string): Promise<number>;

  isInReadingList(storyId: string): Promise<boolean>;
  toggleReadingList(storyId: string): Promise<boolean>;
  getReadingList(): Promise<Story[]>;

  getProgress(storyId: string): Promise<ReadingProgress | null>;
  saveProgress(storyId: string, chapterId: string | null, position: ReadingPosition): Promise<void>;
  getInProgressStories(): Promise<{ story: Story; progress: ReadingProgress }[]>;

  /**
   * Record a story view: at most once per signed-in reader per story per
   * day. Guests are not tracked (no IP storage), authors never count their
   * own stories, and drafts/hidden/unpublished stories never count.
   * Returns true when the view was counted.
   */
  recordStoryView(storyId: string): Promise<boolean>;

  // ---------------------------------------------------------- comments
  listComments(chapterId: string): Promise<Comment[]>;
  createComment(chapterId: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;

  // ----------------------------------------------------------- reports
  createReport(targetType: ReportTarget, targetId: string, reason: string, details: string): Promise<Report>;
  listReports(status?: ReportStatus): Promise<Report[]>;
  updateReport(id: string, status: ReportStatus): Promise<Report>;

  // -------------------------------------------------------- moderation
  listModerationEvents(targetType?: ReportTarget, targetId?: string): Promise<ModerationEvent[]>;
  logModerationEvent(action: string, targetType: ReportTarget, targetId: string, details: Record<string, unknown>): Promise<ModerationEvent>;
  moderateStory(id: string, status: "hidden" | "ongoing" | "complete"): Promise<void>;
  moderateChapter(id: string, status: "hidden" | "published"): Promise<void>;
  moderateComment(id: string, status: "hidden" | "removed" | "visible"): Promise<void>;
  /** Restore hidden content to its pre-hide visibility; audited + notifies author. */
  restoreStory(id: string): Promise<void>;
  restoreChapter(id: string): Promise<void>;
  restoreComment(id: string): Promise<void>;

  // ------------------------------------------------------------ appeals
  /** Writer contests hidden own content. One pending appeal per target. */
  createAppeal(targetType: AppealTarget, targetId: string, reason: string): Promise<Appeal>;
  /** Writer's own appeals. */
  listMyAppeals(): Promise<Appeal[]>;
  /** Moderator-only: every appeal, optionally filtered by status. */
  listAppeals(status?: AppealStatus): Promise<Appeal[]>;
  /**
   * Moderator-only decision. Approving does NOT restore content by itself —
   * restoring stays a separate audited action. Records appeal_decision event
   * and notifies the writer.
   */
  decideAppeal(id: string, decision: "approved" | "declined", note: string): Promise<Appeal>;

  // ------------------------------------------------------ notifications
  listNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<AppNotification[]>;
  getUnreadNotificationCount(): Promise<number>;
  markNotificationRead(id: string, read?: boolean): Promise<void>;
  markAllNotificationsRead(): Promise<void>;

  // ----------------------------------------------------------- storage
  uploadCover(file: File): Promise<string>;
  /** Public-facing cover URL (signed, long-lived; respects RLS at generation). */
  coverUrl(path: string | null): Promise<string | null>;
  /** Signed URL for the owner's own cover (works for drafts too). */
  coverSignedUrl(path: string | null): Promise<string | null>;

  // -------------------------------------------------------- moderation ux
  /** Human label + deep link + current status for a report/appeal target (moderators only). */
  resolveReportTarget(
    targetType: ReportTarget,
    targetId: string
  ): Promise<{ label: string; url: string | null; status: string | null } | null>;
}

/** Fill absent preference keys with their defaults (enabled). */
export function resolveNotificationPrefs(prefs: NotificationPrefs | null | undefined): Required<NotificationPrefs> {
  const p = prefs ?? {};
  return {
    new_chapter: p.new_chapter !== false,
    report_updates: p.report_updates !== false,
    moderation_updates: p.moderation_updates !== false,
    moderator_alerts: p.moderator_alerts !== false,
  };
}

export interface AuthUserWithProfile {
  user: AuthUser;
  profile: Profile | null;
}

/** Resolve the current user to an AuthUser (id + email). */
export async function currentUserId(dp: DataProvider): Promise<string | null> {
  const s = await dp.getSession();
  return s?.user.id ?? null;
}
