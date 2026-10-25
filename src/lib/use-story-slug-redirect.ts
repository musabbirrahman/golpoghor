import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "./app-context";

/**
 * Story-slug redirect: when a page addressed by username + slug misses
 * (the author may have renamed the story), resolve the author's current
 * handle, then check the slug redirects and forward to the story's
 * current slug. Returns true while the check is pending, so the page can
 * show a spinner instead of flashing "not found" for a story that simply
 * moved.
 *
 * Runs after the username redirect has settled (callers gate `missed` on
 * the username hook not pending), so a both-renamed URL resolves in two
 * hops: handle first, then slug. Pages check the live story first and
 * only reach this hook on a miss, so a re-used slug resolves to the live
 * story, never to a stale redirect.
 */
export function useStorySlugRedirect(
  username: string,
  slug: string,
  missed: boolean,
  buildPath: (nextUsername: string, nextSlug: string) => string
): boolean {
  const { dp } = useApp();
  const navigate = useNavigate();
  const [attemptedFor, setAttemptedFor] = useState<string | null>(null);
  const key = `${username}/${slug}`;

  useEffect(() => {
    if (!missed) return;
    let cancelled = false;
    (async () => {
      try {
        const currentUsername =
          (await dp.resolveUsername(username)) ?? username;
        const profile = await dp.getProfileByUsername(currentUsername);
        const nextSlug = profile
          ? await dp.resolveStorySlug(profile.id, slug)
          : null;
        if (cancelled) return;
        if (nextSlug && nextSlug !== slug) {
          navigate(buildPath(currentUsername, nextSlug), { replace: true });
        } else {
          setAttemptedFor(key);
        }
      } catch {
        if (!cancelled) setAttemptedFor(key);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missed, username, slug]);

  return missed && attemptedFor !== key;
}
