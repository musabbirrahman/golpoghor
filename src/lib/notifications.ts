/**
 * Renders in-app notifications to localized title/body strings.
 * Notifications store structured `data`; the UI language decides the text.
 */
import { t } from "./i18n";
import type { AppNotification, Locale } from "./types";

function fill(template: string, data: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? "");
}

export function notificationText(
  locale: Locale,
  n: AppNotification
): { title: string; body: string } {
  const d = n.data;
  const tr = (section: "notifications" | "moderation" | "appeals", key: string) =>
    t(locale, section, key);
  switch (n.type) {
    case "new_chapter":
      return {
        title: tr("notifications", "newChapterTitle"),
        body: fill(tr("notifications", "newChapterBody"), d),
      };
    case "report_received":
      return {
        title: tr("notifications", "reportReceivedTitle"),
        body: fill(tr("notifications", "reportReceivedBody"), d),
      };
    case "report_update":
      return {
        title: tr("notifications", "reportUpdateTitle"),
        body: fill(tr("notifications", "reportUpdateBody"), {
          ...d,
          status: d.status ? tr("moderation", statusKey(d.status)) : "",
        }),
      };
    case "content_hidden":
      return {
        title: tr("notifications", "contentHiddenTitle"),
        body:
          fill(tr("notifications", "contentHiddenBody"), d) +
          (d.storyHidden === "true" ? " " + tr("notifications", "storyNowHidden") : ""),
      };
    case "content_restored":
      return {
        title: tr("notifications", "contentRestoredTitle"),
        body: fill(tr("notifications", "contentRestoredBody"), d),
      };
    case "appeal_submitted":
      return {
        title: tr("notifications", "appealSubmittedTitle"),
        body: fill(tr("notifications", "appealSubmittedBody"), d),
      };
    case "appeal_decision": {
      const decided = d.decision === "approved" ? tr("appeals", "approved") : tr("appeals", "declined");
      return {
        title: tr("notifications", "appealDecisionTitle"),
        body: fill(tr("notifications", "appealDecisionBody"), { ...d, decision: decided }),
      };
    }
    case "admin_message":
      // Free text written by a moderator/admin; rendered as-is (no template).
      return { title: d.title ?? "", body: d.body ?? "" };
  }
}

function statusKey(s: string): string {
  return s === "open"
    ? "open"
    : s === "in_review"
      ? "inReview"
      : s === "resolved"
        ? "resolved"
        : s === "dismissed"
          ? "dismissed"
          : s;
}

/** App-path links used inside notifications. */
export function storyPath(username: string, slug: string, chapterSlug?: string): string {
  return chapterSlug
    ? `/stories/${username}/${slug}/${chapterSlug}`
    : `/stories/${username}/${slug}`;
}
