/** Domain types shared by both data providers (Supabase + local demo). */

export type Locale = "bn" | "en";
export type StoryLanguage = "bn" | "en";
export type StoryStatus = "draft" | "ongoing" | "complete" | "hidden";
export type ChapterStatus = "draft" | "published" | "unpublished" | "hidden";
export type Role = "reader" | "moderator" | "admin";
export type CommentStatus = "visible" | "hidden" | "removed";
export type ReportTarget = "story" | "chapter" | "comment" | "profile";
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
  | "appeal_decision";

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
  status: StoryStatus;
  content_notice: string;
  cover_path: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  /** V4-28 attribution metadata (nullable; absent renders as absent). */
  origin_type?: OriginType | null;
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
  /** joined */
  author?: Profile;
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
  story_id: string;
  chapter_id: string | null;
  excerpt: string;
  template: KeepsakeTemplate;
  echo: string | null;
  echo_public: boolean;
  visibility: "private" | "public";
  status: "active" | "restricted";
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
  published_at: string | null;
  created_at: string;
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
