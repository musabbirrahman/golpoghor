/** Domain types shared by both data providers (Supabase + local demo). */

export type Locale = "bn" | "en";
export type StoryLanguage = "bn" | "en";
export type StoryStatus = "draft" | "ongoing" | "complete" | "hidden";
export type ChapterStatus = "draft" | "published" | "unpublished" | "hidden";
export type Role = "reader" | "moderator" | "admin";
export type CommentStatus = "visible" | "hidden" | "removed";
export type ReportTarget = "story" | "chapter" | "comment" | "profile" | "keepsake";
export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";
export type AppealStatus = "pending" | "approved" | "declined";
export type AppealTarget = "story" | "chapter";
export type NotificationType =
  | "new_chapter"
  | "report_received"
  | "report_update"
  | "content_hidden"
  | "content_restored"
  | "appeal_submitted"
  | "appeal_decision"
  | "admin_message";

/** Per-user notification toggles. Absent keys mean "enabled". */
export interface NotificationPrefs {
  /** a followed author publishes a chapter */
  new_chapter?: boolean;
  /** my report changes status */
  report_updates?: boolean;
  /** my content hidden/restored, my appeal decided */
  moderation_updates?: boolean;
  /** (moderators) new reports / appeals need review */
  moderator_alerts?: boolean;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  locale: Locale;
  role: Role;
  created_at: string;
  updated_at: string;
  /** Set when the username was last changed (V4-07); drives the cooldown. */
  username_changed_at?: string | null;
}

/** An old handle that still resolves to its owner after a rename (V4-07). */
export interface UsernameRedirect {
  old_username: string;
  user_id: string;
  new_username: string;
  expires_at: string;
}

/**
 * An old story slug that still resolves to its story after a rename.
 * Permanent (no expiry): a story URL is a bookmark/share target. Slug
 * reuse stays safe because pages check the live story first and only
 * consult this table on a miss.
 */
export interface StorySlugRedirect {
  author_id: string;
  old_slug: string;
  story_id: string;
  created_at: string;
}

export type OriginType = "original" | "classic" | "translation" | "adaptation";

export interface Story {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  summary: string;
  language: StoryLanguage;
  genre: string;
  tags: string[];
  /** Discover Phase 1 vocabulary (multi-pick, any group). Empty/absent until taxonomy lands. */
  subcategories?: string[];
  status: StoryStatus;
  content_notice: string;
  cover_path: string | null;
  view_count: number;
  /** Admin-picked homepage order: null when not featured, otherwise 1-based position. */
  featured_position?: number | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  /** V4-28 attribution metadata (nullable; absent renders as absent). */
  origin_type?: OriginType | null;
  pd_verified?: boolean;
  original_author?: string | null;
  original_title?: string | null;
  translator_name?: string | null;
  adapter_name?: string | null;
  edition_source?: string | null;
  publication_details?: string | null;
  /** Audit linkage only — never rendered, never a legal claim. */
  rights_evidence_ref?: string | null;
  /** joined */
  author?: Profile;
  chapter_count?: number;
  like_count?: number;
  /** Total words across published chapters, derived at read time (never stored stale). */
  word_count?: number;
}

/** Discover Phase 3b: a moderator-curated shelf. Stories arrive in item order. */
export type ShelfLayout = "horizontal" | "vertical";

export interface CuratedShelf {
  id: string;
  name: string;
  /** Public URL key (/shelves/<slug>), set at creation, never changed on rename. */
  slug: string;
  tagline: string | null;
  layout: ShelfLayout;
  position: number;
  /** Accent key from the shelf palette (gold default); icon + rule color. */
  accent: string;
  stories: Story[];
}

export interface Chapter {
  id: string;
  story_id: string;
  title: string;
  slug: string;
  body_json: TiptapDoc;
  body_text: string;
  position: number;
  status: ChapterStatus;
  word_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  /** joined */
  story?: Story;
}

/** Chapter metadata for lists (V4-04) — never carries body_json/body_text;
 *  full bodies load one chapter at a time via getChapter/getChapterBySlug. */
export interface ChapterListItem {
  id: string;
  story_id: string;
  title: string;
  slug: string;
  position: number;
  status: ChapterStatus;
  word_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface Follow {
  follower_id: string;
  author_id: string;
  created_at: string;
}

export interface ReadingProgress {
  user_id: string;
  story_id: string;
  chapter_id: string | null;
  scroll_ratio: number;
  /** Index of the topmost visible content block in the chapter (exact resume anchor). */
  block_index: number | null;
  /** Fraction (0..1) of the way through that block when it was saved. */
  block_offset: number | null;
  updated_at: string;
}

/** A position within a chapter: block anchor preferred, scroll ratio is the fallback. */
export interface ReadingPosition {
  scrollRatio: number;
  blockIndex?: number | null;
  blockOffset?: number | null;
}

export interface Comment {
  id: string;
  chapter_id: string;
  author_id: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
  /** V4-15: set on author edit; null/undefined means never edited. */
  edited_at?: string | null;
  /** joined */
  author?: Profile;
}

/** V4-12: platform health numbers, from existing tables only. */
export interface AdminMetrics {
  signups: number;
  storiesPublished: number;
  chaptersPublished: number;
  views7d: number;
  views30d: number;
  openReports: number;
  appealsPending: number;
}

/** V4-27a: a reader's private copy of a passage, with a creation-time
 * attribution snapshot (never rewritten by later story edits). */
export type KeepsakeTemplate =
  | "classic-paper"
  | "midnight"
  | "quiet-garden"
  | "old-letters"
  | "modern-ink"
  | "neer";

export interface Keepsake {
  id: string;
  owner_id: string;
  /** NULL for standalone maker keepsakes (no source story). */
  story_id: string | null;
  chapter_id: string | null;
  excerpt: string;
  template: KeepsakeTemplate;
  echo: string | null;
  echo_public: boolean;
  visibility: "private" | "public";
  status: "active" | "restricted";
  /** Public share slug ('k-…'), set at publish time. */
  slug: string | null;
  source_title: string;
  source_author_name: string;
  source_original_author: string | null;
  source_original_title: string | null;
  source_translator_name: string | null;
  source_adapter_name: string | null;
  source_edition: string | null;
  published_at: string | null;
  eligibility_basis: "own-story" | "licence" | "public-domain" | null;
  created_at: string;
  updated_at: string;
}

/** V4-27a: approved fields only, as served by keepsakes_public(). */
export interface PublicKeepsake {
  id: string;
  slug: string;
  excerpt: string;
  template: KeepsakeTemplate;
  echo: string | null;
  source_title: string;
  source_author_name: string;
  source_original_author: string | null;
  source_original_title: string | null;
  source_translator_name: string | null;
  source_adapter_name: string | null;
  source_edition: string | null;
  /** Source story link fields — present only when the source is public. */
  source_slug: string;
  source_author_username: string;
  /** Display name of the keeper (owner) — public cards only, by design. */
  keeper_name: string;
  published_at: string | null;
  created_at: string;
}

/** Per-story Keepsake Sharing Licence coverage (V4-27c). */
export interface KeepsakeLicence {
  covered: boolean;
  accepted_at: string | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: string;
  details: string;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface ModerationEvent {
  id: string;
  moderator_id: string;
  action: string;
  target_type: ReportTarget;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
  /** joined */
  moderator?: Profile;
}

export interface Appeal {
  id: string;
  author_id: string;
  target_type: AppealTarget;
  target_id: string;
  reason: string;
  status: AppealStatus;
  decision_note: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  /** joined */
  author?: Profile;
  target_label?: string;
  target_url?: string | null;
}

/**
 * In-app notification. Title/body are rendered client-side from `type` +
 * `data` so they follow the reader's interface language.
 */
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  data: Record<string, string>;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface Session {
  user: AuthUser;
}
