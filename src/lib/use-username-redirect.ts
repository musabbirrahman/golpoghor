import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "./app-context";

/**
 * V4-07: when a page addressed by username misses (the author may have
 * renamed), check the reservation redirects and forward to the current
 * handle. Returns true while the check is pending, so the page can show a
 * spinner instead of flashing "not found" for a handle that simply moved.
 */
export function useUsernameRedirect(
  username: string,
  missed: boolean,
  buildPath: (next: string) => string
): boolean {
  const { dp } = useApp();
  const navigate = useNavigate();
  const [attemptedFor, setAttemptedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!missed) return;
    let cancelled = false;
    dp.resolveUsername(username)
      .then((next) => {
        if (cancelled) return;
        if (next) navigate(buildPath(next), { replace: true });
        else setAttemptedFor(username);
      })
      .catch(() => {
        if (!cancelled) setAttemptedFor(username);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missed, username]);

  return missed && attemptedFor !== username;
}
