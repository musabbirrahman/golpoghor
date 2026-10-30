import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { AppError } from "../lib/utils";
import { NarrowLayout } from "../components/layout";
import { Button, Card, FieldError, Input, Label } from "../components/ui";

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="mb-2 text-center font-serif text-2xl font-bold">{title}</h1>
      <div className="mx-auto mb-6 h-0.5 w-10 bg-gold" aria-hidden />
      {children}
    </Card>
  );
}

function errorText(t: (s: any, k: string) => string, err: unknown): string | null {
  if (!err) return null;
  if (err instanceof AppError) {
    const text = t("errors", err.code);
    // Unknown codes (e.g. raw Supabase messages) fall back to the generic
    // message instead of showing a cryptic code to the user.
    return text === err.code ? t("errors", "generic") : text;
  }
  return t("errors", "generic");
}

export function LoginPage() {
  const { t, dp, refreshSession } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = params.get("next") || "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await dp.signIn(email, password);
      refreshSession();
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <NarrowLayout>
      <AuthCard title={t("auth", "signInTitle")}>
        {params.get("confirm") === "1" && (
          <p className="mb-4 rounded-lg bg-sage px-3 py-2 text-sm">{t("auth", "confirmEmail")}</p>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email">{t("auth", "email")}</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">{t("auth", "password")}</Label>
            <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <FieldError message={error} />
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t("common", "loading") : t("auth", "signInCta")}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <Link to="/reset-password" className="text-river hover:underline">{t("auth", "forgot")}</Link>
            <span className="text-ink-faint">
              {t("auth", "noAccount")}{" "}
              <Link to={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-river hover:underline">
                {t("auth", "signUpCta")}
              </Link>
            </span>
          </div>
        </form>
      </AuthCard>
    </NarrowLayout>
  );
}

export function SignupPage() {
  const { t, dp, isDemoMode } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { needsEmailConfirmation } = await dp.signUp({
        email,
        password,
        username,
        displayName: displayName || username,
      });
      if (needsEmailConfirmation) {
        navigate("/login?confirm=1", { replace: true });
      } else {
        navigate(params.get("next") || "/", { replace: true });
      }
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <NarrowLayout>
      <AuthCard title={t("auth", "signUpTitle")}>
        {params.get("confirm") === null && isDemoMode && (
          <p className="mb-4 rounded-lg bg-sage px-3 py-2 text-xs text-ink-soft">
            Demo accounts — nusrat@golpoghor.demo / tanvir@golpoghor.demo / moderator@golpoghor.demo
            (password: golpoghor-demo-2026)
          </p>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="su-email">{t("auth", "email")}</Label>
            <Input id="su-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="su-username">{t("auth", "username")}</Label>
            <Input
              id="su-username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="nusrat_rahman"
              maxLength={30}
              autoComplete="username"
            />
            <p className="mt-1 text-xs text-ink-faint">{t("auth", "usernameHint")}</p>
          </div>
          <div>
            <Label htmlFor="su-display">{t("auth", "displayName")}</Label>
            <Input id="su-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
          </div>
          <div>
            <Label htmlFor="su-password">{t("auth", "password")}</Label>
            <Input id="su-password" type="password" required autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <FieldError message={error} />
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t("common", "loading") : t("auth", "signUpCta")}
          </Button>
          <p className="text-center text-sm text-ink-faint">
            {t("auth", "haveAccount")}{" "}
            <Link to="/login" className="font-medium text-river hover:underline">{t("auth", "signInCta")}</Link>
          </p>
        </form>
      </AuthCard>
    </NarrowLayout>
  );
}

export function ResetPasswordPage() {
  const { t, dp } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await dp.resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <NarrowLayout>
      <AuthCard title={t("auth", "resetTitle")}>
        {sent ? (
          <p className="rounded-lg bg-sage px-4 py-3 text-sm">{t("auth", "resetSent")}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="rp-email">{t("auth", "email")}</Label>
              <Input id="rp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <FieldError message={error} />
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t("common", "loading") : t("auth", "resetCta")}
            </Button>
          </form>
        )}
      </AuthCard>
    </NarrowLayout>
  );
}

export function SetPasswordPage() {
  const { t, dp } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await dp.updatePassword(password);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <NarrowLayout>
      <AuthCard title={t("auth", "newPassword")}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="np-password">{t("auth", "newPassword")}</Label>
            <Input id="np-password" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <FieldError message={error} />
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t("common", "loading") : t("auth", "setPasswordCta")}
          </Button>
        </form>
      </AuthCard>
    </NarrowLayout>
  );
}
