/**
 * DataProvider: the single seam between UI and backend.
 * Two implementations: Supabase (real) and Demo (localStorage, for
 * trying the app without credentials). The UI never touches either directly.
 */
import type {
  AdminMetrics,
  Appeal,
  AppealStatus,
  AppealTarget,
  AppNotification,
  AuthUser,
  Chapter,
  ChapterListItem,
  Comment,
  CuratedShelf,
  Keepsake,
  KeepsakeLicence,
  KeepsakeTemplate,
  ModerationEvent,
  NotificationPrefs,
  OriginType,
  Profile,
  PublicKeepsake,
  ReadingPosition,
  ReadingProgress,
  Report,
  ReportStatus,
  ReportTarget,
  Session,
  ShelfLayout,
  Story,
  StoryLanguage,
  StoryStatus,
  TiptapDoc,
} from "./types";

export interface StoryFilters {
  language?: StoryLanguage;
  genre?: string;
  /** Phase 2 v3: stories carrying ANY of these sub-category ids, whatever
   *  their major (multi-tag filtering; tap again to unselect). */
  subcategories?: string[];
  /** Phase 2: narrow the default ongoing+complete set to one status. */
  status?: "ongoing" | "complete";
  /** Phase 2: reading-time band from word count (see utils). */
  time?: "under15" | "15to45" | "over45";
  /** Phase 2 v4: published within 30 days — the same window as the
   *  panel's "+N new" count. Powers the New arrivals View-all link. */
  newOnly?: boolean;
  tag?: string;
  q?: string;
  authorId?: string;
  /** default: published only (ongoing+complete) */
  includeDrafts?: boolean;
  sort?: "newest" | "popular" | "most_viewed" | "featured";
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
  /** Phase 1 taxonomy: fixed-vocabulary ids, any group, several per story. */
  subcategories?: string[];
  content_notice?: string;
  /** V4-28: defaults to "original" on create when omitted. */
  origin_type?: OriginType;
  original_author?: string | null;
  original_title?: string | null;
  translator_name?: string | null;
  adapter_name?: string | null;
  edition_source?: string | null;
  publication_details?: string | null;
}

export interface ChapterInput {
  title: string;
  slug?: string;
  body: TiptapDoc;
}

/** V4-17 write throttles (per user, trailing hour). Enforced server-side
 * by triggers (migration 20261021100000) and mirrored by the demo provider. */
export const WRITE_THROTTLE = { commentsPerHour: 30, reportsPerHour: 10 } as const;

/** V4-27a keepsakes: K1 excerpt cap + template set (spike: 1,000 chars). */
export const KEEPSAKE_EXCERPT_MAX = 1000;
export const KEEPSAKE_TEMPLATES: KeepsakeTemplate[] = [
  "classic-paper",
  "midnight",
  "quiet-garden",
  "old-letters",
  "modern-ink",
  "neer",
];

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
  /**
   * Rename the signed-in user (V4-07). Enforces the signup format rules, a
   * 30-day cooldown, uniqueness, and the old handle's reservation window;
   * failures surface as AppError codes usernameInvalid / usernameSame /
   * usernameCooldown / usernameTaken / usernameReserved.
   */
  changeUsername(newUsername: string): Promise<void>;
  /** Permanently delete the signed-in user's account and all their data. */
  deleteAccount(): Promise<void>;
  /**
   * If `username` is a recently-released handle inside its reservation
   * window, return the owner's current username (following rename chains);
   * otherwise null.
   */
  resolveUsername(username: string): Promise<string | null>;
  /**
   * If the author previously had a story at `oldSlug`, return that story's
   * current slug; otherwise null. Callers check the live story first and
   * only consult redirects on a miss, so a re-used slug resolves to the
   * live story, never to a stale redirect.
   */
  resolveStorySlug(authorId: string, oldSlug: string): Promise<string | null>;

  // ---------------------------------------------------------- profiles
  getProfile(id: string): Promise<Profile | null>;
  getProfileByUsername(username: string): Promise<Profile | null>;
  /** Public: authors whose username or display name contains the term (suggestions). */
  searchAuthors(term: string): Promise<Profile[]>;
  updateProfile(
    id: string,
    patch: Partial<Pick<Profile, "display_name" | "bio" | "locale" | "avatar_path">>
  ): Promise<Profile>;
  /** Owner-only notification preferences (separate RLS-protected table). */
  getNotificationPrefs(): Promise<Required<NotificationPrefs>>;
  updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void>;

  // ----------------------------------------------------------- stories
  listStories(filters: StoryFilters): Promise<{ stories: Story[]; total: number }>;
  /** Homepage shelf: admin picks in position order, newest public stories fill
   *  remaining slots up to limit. */
  listFeaturedStories(limit: number): Promise<Story[]>;
  /** Admin only: every featured story in position order, any status. */
  listAllFeatured(): Promise<Story[]>;
  /** Moderator only (DB trigger blocks anyone else): set position or null to unfeature. */
  setFeaturedPosition(id: string, position: number | null): Promise<void>;
  /** Public: curated shelves in position order, each with its public stories in item order. */
  listCuratedShelves(): Promise<CuratedShelf[]>;
  /** Public: one shelf by its URL slug, or null. */
  getShelfBySlug(slug: string): Promise<CuratedShelf | null>;
  /** Moderator only (RLS gates writes): create a shelf; position is appended, slug derived from the name. */
  createShelf(name: string, layout: ShelfLayout, tagline?: string | null): Promise<CuratedShelf>;
  /** Moderator only: rename, retagline, relayout, or reposition a shelf (slug never changes). */
  updateShelf(id: string, patch: { name?: string; tagline?: string | null; layout?: ShelfLayout; position?: number }): Promise<void>;
  /** Moderator only: delete a shelf (items cascade) and renumber the rest. */
  deleteShelf(id: string): Promise<void>;
  /** Moderator only: append a story to a shelf (ignored when already present). */
  addShelfItem(shelfId: string, storyId: string): Promise<void>;
  /** Moderator only: remove a story from a shelf. */
  removeShelfItem(shelfId: string, storyId: string): Promise<void>;
  /** Moderator only: set an item's position (swap/renumber handled by the caller). */
  setShelfItemPosition(shelfId: string, storyId: string, position: number): Promise<void>;
  getStory(id: string): Promise<Story | null>;
  /** Public lookup by author username + slug. Returns null for drafts unless owner. */
  getStoryBySlug(authorUsername: string, slug: string): Promise<Story | null>;
  createStory(input: StoryInput): Promise<Story>;
  updateStory(id: string, patch: Partial<StoryInput & { status: StoryStatus; cover_path: string | null }>): Promise<Story>;
  deleteStory(id: string): Promise<void>;
  listGenres(): Promise<string[]>;
  /** Phase 2: sub-category ids carried by at least one public story. */
  listSubcategoriesInUse(): Promise<string[]>;

  // ---------------------------------------------------------- chapters
  /** publishedOnly=false is owner-only (dashboard, editor). Lists are light
   *  (V4-04): metadata only, never chapter bodies. */
  listChapters(storyId: string, opts?: { publishedOnly?: boolean }): Promise<ChapterListItem[]>;
  getChapterBySlug(storyId: string, slug: string, opts?: { publishedOnly?: boolean }): Promise<Chapter | null>;
  getChapter(id: string): Promise<Chapter | null>;
  createChapter(storyId: string, input: ChapterInput): Promise<Chapter>;
  updateChapter(id: string, patch: Partial<ChapterInput & { status: Chapter["status"] }>): Promise<Chapter>;
  /** V4-20: swap a chapter's position with its neighbour (author only);
   * moving past either end is a no-op. */
  moveChapter(id: string, direction: "up" | "down"): Promise<Chapter>;
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
  /** V4-15: author-only edit; server-side RLS enforces owner + visible. */
  updateComment(id: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;

  // --------------------------------------------------------- keepsakes (V4-27a)
  createKeepsake(input: {
    storyId: string;
    chapterId?: string | null;
    excerpt: string;
    template?: KeepsakeTemplate;
    echo?: string | null;
  }): Promise<Keepsake>;
  listMyKeepsakes(): Promise<Keepsake[]>;
  getKeepsake(id: string): Promise<Keepsake | null>;
  updateKeepsake(
    id: string,
    patch: Partial<Pick<Keepsake, "excerpt" | "template" | "echo" | "echo_public">>
  ): Promise<Keepsake>;
  deleteKeepsake(id: string): Promise<void>;
  /** Server-side publish (K2 matrix); throws keepsakeNotEligible etc. */
  publishKeepsake(id: string): Promise<Keepsake>;
  unpublishKeepsake(id: string): Promise<Keepsake>;
  /** Public page read (projection only — never the base table). */
  getPublicKeepsake(slug: string): Promise<PublicKeepsake | null>;
  /** Restricted public projection only — never the base table. */
  listPublicKeepsakes(limit?: number): Promise<PublicKeepsake[]>;
  /** Per-story Sharing Licence (originals only, author-only actions). */
  getKeepsakeLicence(storyId: string): Promise<KeepsakeLicence>;
  acceptKeepsakeLicence(storyId: string): Promise<KeepsakeLicence>;
  withdrawKeepsakeLicence(storyId: string): Promise<KeepsakeLicence>;
  /** Moderator takedown path for reported public Keepsakes. */
  restrictKeepsake(id: string): Promise<Keepsake>;
  restoreKeepsake(id: string): Promise<Keepsake>;
  // ----------------------------------------------------------- reports
  createReport(targetType: ReportTarget, targetId: string, reason: string, details: string): Promise<Report>;
  listReports(status?: ReportStatus): Promise<Report[]>;
  updateReport(id: string, status: ReportStatus): Promise<Report>;

  // -------------------------------------------------------- moderation
  /** Moderator-only: platform health numbers from existing tables (V4-12). */
  getAdminMetrics(): Promise<AdminMetrics>;
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
  /** Moderator/admin only: send a free-text in-app message to one user by username. */
  sendAdminMessage(username: string, title: string, body: string, link?: string | null): Promise<void>;

  // ----------------------------------------------------------- storage
  uploadCover(file: File): Promise<string>;
  /** V4-22: upload a profile picture (<= 1 MB JPG/PNG/WebP); returns its storage path. */
  uploadAvatar(file: File): Promise<string>;
  /** Public URL for an avatar path (sync: the avatars bucket is public). */
  avatarUrl(path: string | null): string | null;
  /** Public-facing cover URL (signed, long-lived; respects RLS at generation). */
  coverUrl(path: string | null): Promise<string | null>;
  /** Signed URL for the owner's own cover (works for drafts too). */
  coverSignedUrl(path: string | null): Promise<string | null>;
  /** Card-size thumbnail URL for a cover path (`thumb-` derivation); null when no thumbnail exists. */
  coverThumbUrl(path: string | null): Promise<string | null>;
  /**
   * Phase 1B: drop cached (memory + persisted) cover URLs for a path
   * and its thumbnail, forcing a fresh sign on next use. Used when a
   * persisted URL fails to load (expired or invalid signature).
   */
  invalidateCoverUrl(path: string | null): Promise<void>;
  /**
   * Phase 1A backfill: create the story's thumbnail from its original
   * cover. Owner-session only; refuses anyone else before any network
   * use. "already" = done before, "failed" = failed (retryable after 7 days).
   */
  ensureCoverThumbnail(story: {
    id: string;
    author_id: string;
    cover_path: string | null;
  }): Promise<"created" | "already" | "refused" | "failed">;

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
