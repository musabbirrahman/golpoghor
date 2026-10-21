import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppError, fileToAvatarFile } from "../lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { resolveNotificationPrefs } from "../lib/data-provider";
import type { NotificationPrefs } from "../lib/types";
import { MyKeepsakesSection } from "../components/my-keepsakes";
import { Layout } from "../components/layout";
import { Avatar, Button, ButtonLink, EmptyState, Spinner } from "../components/ui";
import { StoryCard, storyPath } from "../components/story-card";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t, session, sessionLoading } = useApp();
  if (sessionLoading) return <Layout><Spinner /></Layout>;
  if (!session) {
    return (
      <Layout>
        <EmptyState
          title={t("errors", "signInRequired")}
          action={<ButtonLink to={`/login?next=${encodeURIComponent(window.location.pathname)}`}>{t("nav", "signIn")}</ButtonLink>}
        />
      </Layout>
    );
  }
  return <>{children}</>;
}

export function LibraryPage() {
  const { t, dp, session } = useApp();

  const listQuery = useQuery({
    queryKey: ["readingList", "full"],
    queryFn: () => dp.getReadingList(),
    enabled: !!session,
  });
  const progressQuery = useQuery({
    queryKey: ["inProgress"],
    queryFn: () => dp.getInProgressStories(),
    enabled: !!session,
  });
  const followingQuery = useQuery({
    queryKey: ["following", session?.user.id],
    queryFn: () => dp.getFollowing(session!.user.id),
    enabled: !!session,
  });

  return (
    <RequireAuth>
      <Layout>
        <h1 className="mt-6 font-serif text-3xl font-bold">{t("library", "title")}</h1>

        <section className="mt-8">
          <h2 className="mb-4 font-serif text-xl font-bold">{t("library", "inProgress")}</h2>
          {progressQuery.isLoading ? <Spinner /> : progressQuery.data?.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {progressQuery.data.map(({ story, progress }) => (
                <Link key={story.id} to={storyPath(story)} className="block h-full rounded-xl bg-white p-4 shadow-card hover:shadow-lift">
                  <p className="truncate font-serif text-lg font-semibold">{story.title}</p>
                  <p className="text-sm text-ink-faint">{story.author?.display_name}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sage" role="progressbar"
                    aria-valuenow={Math.round(progress.scroll_ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-river" style={{ width: `${Math.round(progress.scroll_ratio * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-sm font-medium text-river">{t("library", "resume")} →</p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t("library", "empty")} action={<ButtonLink to="/discover" variant="secondary">{t("discover", "title")}</ButtonLink>} />
          )}
        </section>

        <MyKeepsakesSection limit={3} />

        <section className="mt-10">
          <h2 className="mb-4 font-serif text-xl font-bold">{t("library", "readingList")}</h2>
          {listQuery.isLoading ? <Spinner /> : listQuery.data?.length ? (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {listQuery.data.map((s) => <StoryCard key={s.id} story={s} />)}
            </div>
          ) : (
            <EmptyState title={t("library", "empty")} />
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-4 font-serif text-xl font-bold">{t("library", "following")}</h2>
          {followingQuery.isLoading ? <Spinner /> : followingQuery.data?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {followingQuery.data.map((p) => (
                <Link key={p.id} to={`/authors/${p.username}`} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card hover:shadow-lift">
                  <Avatar name={p.display_name} src={dp.avatarUrl(p.avatar_path)} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.display_name}</p>
                    <p className="truncate text-sm text-ink-faint">@{p.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t("library", "emptyFollowing")} />
          )}
        </section>
      </Layout>
    </RequireAuth>
  );
}

export function LibraryKeepsakesPage() {
  const { t } = useApp();
  const navigate = useNavigate();
  return (
    <RequireAuth>
      <Layout>
        <h1 className="sr-only">{t("keepsakes", "myKeepsakes")}</h1>
        <div className="mb-4 mt-6">
          <Button size="sm" variant="ghost" onClick={() => navigate("/library")}>
            ← {t("common", "back")}
          </Button>
        </div>
        <MyKeepsakesSection />
      </Layout>
    </RequireAuth>
  );
}

export function SettingsPage() {
  const { t, dp, profile, refreshSession, locale, setLocale } = useApp();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sync form once the profile finishes loading.
  useEffect(() => {
    if (profile) {
      setDisplayName((v) => (v === "" ? profile.display_name : v));
      setBio((v) => (v === "" ? profile.bio : v));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return (
    <RequireAuth>
      <Layout>
        <div className="mx-auto mt-6 max-w-2xl">
          <h1 className="font-serif text-3xl font-bold">{t("settings", "title")}</h1>
          <form
            className="mt-6 flex flex-col gap-4 rounded-xl bg-white p-6 shadow-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!profile) return;
              setBusy(true);
              try {
                await dp.updateProfile(profile.id, { display_name: displayName, bio });
                refreshSession();
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="flex items-center gap-4">
              <Avatar name={profile?.display_name ?? "?"} size="lg" src={dp.avatarUrl(profile?.avatar_path ?? null)} />
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="set-avatar">
                  {t("settings", "profilePicture")}
                </label>
                <input
                  id="set-avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !profile) return;
                    setBusy(true);
                    setAvatarError(null);
                    try {
                      const resized = await fileToAvatarFile(file);
                      const path = await dp.uploadAvatar(resized);
                      await dp.updateProfile(profile.id, { avatar_path: path });
                      refreshSession();
                      setSaved(true);
                      setTimeout(() => setSaved(false), 3000);
                    } catch (err) {
                      setAvatarError(accountErrorText(t, err));
                    } finally {
                      setBusy(false);
                      e.target.value = "";
                    }
                  }}
                />
                <p className="mt-1 text-xs text-ink-faint">{t("settings", "pictureHint")}</p>
                {avatarError && <p className="mt-1 text-sm text-red-700" role="alert">{avatarError}</p>}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="set-name">
                {t("settings", "displayName")}
              </label>
              <input id="set-name" className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="set-bio">
                {t("settings", "bio")}
              </label>
              <textarea id="set-bio" className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-ink-soft">{t("settings", "interfaceLanguage")}</span>
              <div className="flex gap-2">
                {(["bn", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={async () => {
                      setLocale(l);
                      if (profile) {
                        await dp.updateProfile(profile.id, { locale: l }).catch(() => {});
                        refreshSession();
                      }
                    }}
                    aria-pressed={locale === l}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${locale === l ? "bg-river text-white" : "bg-sage text-ink"}`}
                  >
                    {l === "bn" ? "বাংলা" : "English"}
                  </button>
                ))}
              </div>
            </div>
            {saved && <p className="text-sm text-river" role="status">{t("settings", "saved")}</p>}
            <div>
              <button type="submit" disabled={busy} className="rounded-lg bg-river px-4 py-2 text-sm font-medium text-white hover:bg-river-dark disabled:opacity-50">
                {t("settings", "save")}
              </button>
            </div>
            <p className="text-xs text-ink-faint">@{profile?.username} · {profile?.role}</p>
          </form>

          <NotificationPrefsCard />

          <AccountCard />
        </div>
      </Layout>
    </RequireAuth>
  );
}

function NotificationPrefsCard() {
  const { t, dp, profile, isModerator } = useApp();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState<Required<NotificationPrefs> | null>(null);

  useEffect(() => {
    let cancelled = false;
    dp.getNotificationPrefs()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch(() => { if (!cancelled) setPrefs(resolveNotificationPrefs(undefined)); });
    return () => { cancelled = true; };
  }, [dp]);

  const resolved = prefs ?? resolveNotificationPrefs(undefined);

  const rows: { key: keyof Required<NotificationPrefs>; label: string; show: boolean }[] = [
    { key: "new_chapter", label: t("notifications", "prefNewChapter"), show: true },
    { key: "report_updates", label: t("notifications", "prefReportUpdates"), show: true },
    { key: "moderation_updates", label: t("notifications", "prefModerationUpdates"), show: true },
    { key: "moderator_alerts", label: t("notifications", "prefModeratorAlerts"), show: isModerator },
  ];

  async function toggle(key: keyof Required<NotificationPrefs>) {
    if (!profile || busy || !prefs) return;
    setBusy(true);
    try {
      await dp.updateNotificationPrefs({ [key]: !resolved[key] });
      setPrefs({ ...resolved, [key]: !resolved[key] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow-card">
      <h2 className="font-serif text-xl font-bold">{t("notifications", "prefsTitle")}</h2>
      <div className="mt-4 flex flex-col gap-3">
        {rows.filter((r) => r.show).map((r) => (
          <button
            key={r.key}
            type="button"
            role="switch"
            aria-checked={resolved[r.key]}
            onClick={() => toggle(r.key)}
            className="flex items-center justify-between gap-3 text-left"
          >
            <span className="text-sm">{r.label}</span>
            <span
              aria-hidden
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${resolved[r.key] ? "bg-river" : "bg-ink/20"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${resolved[r.key] ? "left-[22px]" : "left-0.5"}`}
              />
            </span>
          </button>
        ))}
      </div>
      {saved && <p className="mt-3 text-sm text-river" role="status">{t("settings", "saved")}</p>}
    </div>
  );
}

function accountErrorText(
  t: (s: any, k: string) => string,
  err: unknown
): string | null {
  if (!err) return null;
  if (err instanceof AppError) {
    const text = t("errors", err.code);
    return text === err.code ? t("errors", "generic") : text;
  }
  return t("errors", "generic");
}

/** V4-07: change password, change username, delete account. */
function AccountCard() {
  const { t, dp, profile, refreshSession, locale } = useApp();
  const navigate = useNavigate();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameDone, setNameDone] = useState(false);

  const [confirmName, setConfirmName] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  if (!profile) return null;

  const changedAt = profile.username_changed_at
    ? new Date(profile.username_changed_at).getTime()
    : null;
  const cooldownUntil =
    changedAt && changedAt > Date.now() - 30 * 86400000
      ? new Date(changedAt + 30 * 86400000)
      : null;

  const inputCls =
    "w-full rounded-lg border border-ink/15 bg-white px-3 py-2";
  const labelCls = "mb-1 block text-sm font-medium text-ink-soft";

  return (
    <>
      <div className="mt-6 flex flex-col gap-5 rounded-xl bg-white p-6 shadow-card">
        <h2 className="font-serif text-xl font-bold">{t("settings", "account")}</h2>

        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwError(null);
            setPwDone(false);
            if (pw1 !== pw2) {
              setPwError(t("settings", "passwordMismatch"));
              return;
            }
            setPwBusy(true);
            try {
              await dp.updatePassword(pw1);
              setPw1("");
              setPw2("");
              setPwDone(true);
            } catch (err) {
              setPwError(accountErrorText(t, err));
            } finally {
              setPwBusy(false);
            }
          }}
        >
          <h3 className="text-sm font-semibold">{t("settings", "changePassword")}</h3>
          <div>
            <label className={labelCls} htmlFor="acct-pw1">{t("settings", "newPassword")}</label>
            <input id="acct-pw1" type="password" autoComplete="new-password" className={inputCls} value={pw1} onChange={(e) => setPw1(e.target.value)} minLength={6} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="acct-pw2">{t("settings", "confirmPassword")}</label>
            <input id="acct-pw2" type="password" autoComplete="new-password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} required />
          </div>
          {pwError && <p className="text-sm text-red-700" role="alert">{pwError}</p>}
          {pwDone && <p className="text-sm text-river" role="status">{t("settings", "passwordChanged")}</p>}
          <div>
            <button type="submit" disabled={pwBusy} className="rounded-lg bg-river px-4 py-2 text-sm font-medium text-white hover:bg-river-dark disabled:opacity-50">
              {t("settings", "changePassword")}
            </button>
          </div>
        </form>

        <hr className="border-ink/10" />

        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setNameError(null);
            setNameDone(false);
            setNameBusy(true);
            try {
              await dp.changeUsername(name);
              setName("");
              setNameDone(true);
              refreshSession();
            } catch (err) {
              setNameError(accountErrorText(t, err));
            } finally {
              setNameBusy(false);
            }
          }}
        >
          <h3 className="text-sm font-semibold">{t("settings", "changeUsername")}</h3>
          <p className="text-xs text-ink-faint">
            @{profile.username} · {t("settings", "usernameHelp")}
          </p>
          {cooldownUntil ? (
            <p className="text-sm text-ink-soft" role="status">
              {t("settings", "canChangeAfter")}
              {cooldownUntil.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB")}
            </p>
          ) : (
            <>
              <div>
                <label className={labelCls} htmlFor="acct-username">{t("settings", "changeUsername")}</label>
                <input id="acct-username" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={profile.username} autoComplete="off" required />
              </div>
              {nameError && <p className="text-sm text-red-700" role="alert">{nameError}</p>}
              {nameDone && <p className="text-sm text-river" role="status">{t("settings", "usernameChanged")}</p>}
              <div>
                <button type="submit" disabled={nameBusy} className="rounded-lg bg-river px-4 py-2 text-sm font-medium text-white hover:bg-river-dark disabled:opacity-50">
                  {t("settings", "changeUsername")}
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-serif text-xl font-bold text-red-900">{t("settings", "dangerZone")}</h2>
        <p className="text-sm text-red-900/80">{t("settings", "deleteBody")}</p>
        <div>
          <label className={labelCls} htmlFor="acct-delete-confirm">
            {t("settings", "deleteConfirmLabel")} (@{profile.username})
          </label>
          <input id="acct-delete-confirm" className={inputCls} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
        </div>
        {delError && <p className="text-sm text-red-700" role="alert">{delError}</p>}
        <div>
          <button
            type="button"
            disabled={delBusy || confirmName !== profile.username}
            onClick={async () => {
              setDelError(null);
              setDelBusy(true);
              try {
                await dp.deleteAccount();
                refreshSession();
                navigate("/", { replace: true });
              } catch (err) {
                setDelError(accountErrorText(t, err));
                setDelBusy(false);
              }
            }}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {t("settings", "deleteForever")}
          </button>
        </div>
      </div>
    </>
  );
}
