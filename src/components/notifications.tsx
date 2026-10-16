import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";

/** Header bell with unread badge. Polls lightly (no realtime in MVP). */
export function NotificationBell() {
  const { t, session, dp } = useApp();
  const queryClient = useQueryClient();
  const { data: count = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => dp.getUnreadNotificationCount(),
    enabled: !!session,
    refetchInterval: 30_000,
  });
  if (!session) return null;
  return (
    <Link
      to="/inbox"
      onClick={() => queryClient.invalidateQueries({ queryKey: ["notifications"] })}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-ink/15 bg-white text-lg hover:bg-sage"
      aria-label={t("notifications", "inbox")}
    >
      <span aria-hidden>🔔</span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1 text-[11px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
