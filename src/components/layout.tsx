import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useApp } from "../lib/app-context";
import { NotificationBell } from "./notifications";

function Brand() {
  const { t } = useApp();
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="GolpoGhor home">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-river font-serif text-xl text-paper">
        গ
      </span>
      <span className="font-serif text-xl font-bold tracking-tight">{t("brand", "brand")}</span>
    </Link>
  );
}

function LocaleToggle() {
  const { locale, setLocale } = useApp();
  return (
    <div className="flex overflow-hidden rounded-lg border border-ink/15 text-sm" role="group" aria-label="Interface language">
      {(["bn", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`px-2.5 py-1.5 font-medium transition-colors ${
            locale === l ? "bg-river text-white" : "bg-white text-ink-soft hover:bg-sage"
          }`}
        >
          {l === "bn" ? "বাং" : "EN"}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ mobile = false }: { mobile?: boolean }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={mobile ? "w-full" : "hidden w-64 md:block lg:w-80"}
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/discover");
      }}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("discover", "searchPlaceholder")}
        aria-label={t("nav", "search")}
        className="w-full rounded-full border border-ink/15 bg-white px-4 py-2 text-sm placeholder:text-ink-faint focus:border-river focus:outline-none focus:ring-1 focus:ring-river"
      />
    </form>
  );
}

function AccountMenu() {
  const { t, session, profile, isModerator, dp } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!session) {
    return (
      <Link
        to="/login"
        className="rounded-lg bg-river px-4 py-2 text-sm font-medium text-white hover:bg-river-dark"
      >
        {t("nav", "signIn")}
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-river font-serif font-semibold text-paper"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav", "profile")}
      >
        {(profile?.display_name ?? "?").charAt(0).toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl bg-white py-1 shadow-lift" role="menu">
            <div className="border-b border-ink/10 px-4 py-2">
              <p className="truncate text-sm font-semibold">{profile?.display_name}</p>
              <p className="truncate text-xs text-ink-faint">@{profile?.username}</p>
            </div>
            {[
              { to: "/inbox", label: t("notifications", "inbox") },
              { to: "/library", label: t("nav", "library") },
              { to: "/write", label: t("nav", "write") },
              { to: "/settings/profile", label: t("nav", "settings") },
              ...(isModerator ? [{ to: "/admin/reports", label: t("nav", "admin") }] : []),
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm hover:bg-sage"
              >
                {l.label}
              </Link>
            ))}
            <button
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm text-clay hover:bg-clay-soft"
              onClick={async () => {
                await dp.signOut();
                setOpen(false);
                navigate("/");
              }}
            >
              {t("nav", "signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Header() {
  const { t, session } = useApp();
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-sage text-ink" : "text-ink-soft hover:bg-sage/60 hover:text-ink"
    }`;
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Brand />
        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Primary">
          <NavLink to="/" className={linkCls} end>{t("nav", "home")}</NavLink>
          <NavLink to="/discover" className={linkCls}>{t("nav", "discover")}</NavLink>
          {session && <NavLink to="/library" className={linkCls}>{t("nav", "library")}</NavLink>}
          {session && <NavLink to="/write" className={linkCls}>{t("nav", "write")}</NavLink>}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <SearchBox />
          <LocaleToggle />
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
      <div className="border-t border-ink/10 px-4 py-2 md:hidden">
        <SearchBox mobile />
      </div>
    </header>
  );
}

export function BottomNav() {
  const { t, session } = useApp();
  const items = [
    { to: "/", label: t("nav", "home"), icon: "⌂" },
    { to: "/discover", label: t("nav", "discover"), icon: "❦" },
    ...(session
      ? [
          { to: "/library", label: t("nav", "library"), icon: "▤" },
          { to: "/write", label: t("nav", "write"), icon: "✎" },
        ]
      : []),
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur md:hidden"
      aria-label="Mobile"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? "text-river" : "text-ink-faint"
              }`
            }
          >
            <span className="text-lg leading-none" aria-hidden>{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function DemoBanner() {
  const { t, isDemoMode } = useApp();
  if (!isDemoMode) return null;
  return (
    <div className="bg-gold-soft px-4 py-1.5 text-center text-xs font-medium text-ink">
      {t("common", "demoMode")}
    </div>
  );
}

export function Footer() {
  const { t } = useApp();
  return (
    <footer className="mt-16 border-t border-ink/10 bg-paper-dark/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center">
        <p className="font-serif text-lg font-semibold">{t("brand", "brand")}</p>
        <p className="max-w-md text-sm text-ink-faint">{t("brand", "tagline")}</p>
        <p className="text-xs text-ink-faint">© 2026 GolpoGhor · MVP</p>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 md:pb-12">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}

export function NarrowLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-8 md:pb-12">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
