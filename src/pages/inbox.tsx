import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Badge, Button, ButtonLink, Card, EmptyState, Spinner } from "../components/ui";
import { notificationText } from "../lib/notifications";
import { timeAgo } from "../lib/utils";
import type { AppNotification } from "../lib/types";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t, session, sessionLoading } = useApp();
  if (sessionLoading) return <Layout><Spinner /></Layout>;
  if (!session) {
    return (
      <Layout>
        <EmptyState
          title={t("errors", "signInRequired")}
          action={<ButtonLink to="/login">{t("nav", "signIn")}</ButtonLink>}
        />
      </Layout>
    );
  }
  return <>{children}</>;
}

const TYPE_TONE: Record<AppNotification["type"], "gold" | "clay" | "sage" | "river"> = {
  new_chapter: "sage",
  report_received: "clay",
  report_update: "gold",
  content_hidden: "clay",
  content_restored: "sage",
  appeal_submitted: "gold",
  appeal_decision: "river",
  admin_message: "gold",
};

function NotificationRow({ n }: { n: AppNotification }) {
  const { locale, dp } = useApp();
  const queryClient = useQueryClient();
  const { title, body } = notificationText(locale, n);

  const markRead = async () => {
    if (n.is_read) return;
    await dp.markNotificationRead(n.id, true);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const inner = (
    <div
      className={`flex gap-3 px-5 py-4 ${n.is_read ? "" : "bg-gold-soft/40"}`}
      onClick={() => {
        if (!n.is_read) void markRead();
      }}
    >
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.is_read ? "bg-ink/15" : "bg-gold"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TYPE_TONE[n.type]}>{title}</Badge>
          <span className="ml-auto text-xs text-ink-faint">{timeAgo(n.created_at, locale)}</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{body}</p>
      </div>
    </div>
  );

  return n.link ? (
    <Link to={n.link} className="block transition-colors hover:bg-sage/40">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function InboxPage() {
  const { t, dp } = useApp();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => dp.listNotifications({ limit: 50 }),
  });
  const items = listQuery.data ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  async function markAll() {
    await dp.markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <RequireAuth>
      <Layout>
        <div className="mt-6 flex items-center justify-between">
          <h1 className="font-serif text-3xl font-bold">{t("notifications", "inbox")}</h1>
          {unread > 0 && (
            <Button size="sm" variant="secondary" onClick={markAll}>
              {t("notifications", "markAllRead")}
            </Button>
          )}
        </div>
        <div className="mt-2 h-0.5 w-10 bg-gold" />

        <div className="mt-6">
          {listQuery.isLoading ? (
            <Spinner />
          ) : items.length ? (
            <Card className="divide-y divide-ink/10 overflow-hidden">
              {items.map((n) => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </Card>
          ) : (
            <EmptyState title={t("notifications", "empty")} hint={t("notifications", "emptyHint")} />
          )}
        </div>
      </Layout>
    </RequireAuth>
  );
}
