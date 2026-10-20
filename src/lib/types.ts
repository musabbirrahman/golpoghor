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
}

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
