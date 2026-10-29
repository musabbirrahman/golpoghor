import { Link, NavLink, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { useApp } from "../lib/app-context";
import { NotificationBell } from "./notifications";

/**
 * New-page navigations start at the top (e.g. tapping a footer link deep at
 * the bottom of a long page on mobile). Back/forward (POP) keeps the
 * browser's own scroll handling. The reader's position restore runs after
 * this and still lands on the saved paragraph.
 */
export function ScrollToTopOnNavigate() {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (navigationType === "PUSH") window.scrollTo({ top: 0 });
  }, [pathname, search, navigationType]);
  return null;
}

function Brand() {
  const { t } = useApp();
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="GolpoNeer home">
      <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover sm:h-9 sm:w-9" />
      <span className="hidden font-serif text-lg font-bold tracking-tight sm:inline sm:text-xl">{t("brand", "brand")}</span>
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
          className={`px-2 py-1.5 font-medium transition-colors sm:px-2.5 ${
            locale === l ? "bg-river text-white" : "bg-white text-ink-soft hover:bg-sage"
          }`}
        >
          {l === "bn" ? "বাং" : "EN"}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ mobile = false, inputRef, onClose, onSubmitDone }: { mobile?: boolean; inputRef?: Ref<HTMLInputElement>; onClose?: () => void; onSubmitDone?: () => void }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={mobile ? "min-w-0 flex-1" : "hidden w-64 lg:block lg:w-80"}
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/discover");
        onSubmitDone?.();
      }}
    >
      <input
        type="search"
        value={q}
        ref={inputRef}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose?.();
        }}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("discover", "searchPlaceholder")}
        aria-label={t("nav", "search")}
        className={`w-full border border-ink/15 bg-white px-4 py-2 text-sm placeholder:text-ink-faint focus:border-river focus:outline-none focus:ring-1 focus:ring-river ${mobile ? "rounded-xl focus-visible:rounded-xl" : "rounded-full focus-visible:rounded-full"}`}
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
        className="rounded-lg bg-river px-3 py-2 text-sm font-medium text-white hover:bg-river-dark sm:px-4"
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
  const { pathname } = useLocation();
  // The chapter-reading page is immersive: Layout skips this header
  // entirely on chapter routes and the reader's own floating bar
  // replaces it. (The search-box guard below is now dead on those
  // routes but harmless; story page and everywhere else keep it.)
  const isReader = /^\/stories\/[^/]+\/[^/]+\/[^/]+$/.test(pathname);
  // Mobile search lives in the header row itself: a wide pill that, when
  // tapped, becomes the input and pops wider to the full row (logo, nav
  // and controls fade/collapse away on phones only), then closes back to
  // the pill on submit, Escape, the close button, or any route change.
  // No second row below the header. Desktop search is untouched.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchAreaRef = useRef<HTMLDivElement | null>(null);
  // How far Chrome's own bar is currently overlapping the top of the page
  // (0 when it isn't). Only read while the mobile search is open, so the
  // normal header never moves.
  const [chromeBarOffset, setChromeBarOffset] = useState(0);
  // Closing the search must also drop focus: on a real phone keyboard the
  // keyboard otherwise lingers after the input is gone, and opening the
  // search must never scroll the page — the input lives in the sticky
  // header, already at the top of the viewport, so a scroll jump only
  // fights Chrome's own address bar (twin search bars, typing blind).
  const closeMobileSearch = () => {
    searchInputRef.current?.blur();
    setMobileSearchOpen(false);
  };
  useEffect(() => {
    setMobileSearchOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (mobileSearchOpen) searchInputRef.current?.focus({ preventScroll: true });
  }, [mobileSearchOpen]);
  // While the mobile search is open, track Chrome's bar: on Android
  // Chrome it can slide back over the top of the page (for example on a
  // small upward scroll), covering the site's input. visualViewport's
  // offsetTop is exactly that overlap, so the header slides down by the
  // same amount only in that moment; when the bar hides, the offset
  // returns to 0 and the header is back where it always was.
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const next = Math.round(vv.offsetTop || 0);
      setChromeBarOffset((prev) => (prev === next ? prev : next));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [mobileSearchOpen]);
  // Tapping anywhere outside the expanded search cancels it (the old
  // below-header row stayed open forever on an outside tap — that bug
  // is what this closes).
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (searchAreaRef.current && !searchAreaRef.current.contains(e.target as Node)) {
        closeMobileSearch();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [mobileSearchOpen]);
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-sage text-ink" : "text-ink-soft hover:bg-sage/60 hover:text-ink"
    }`;
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/95 backdrop-blur" style={mobileSearchOpen && chromeBarOffset > 0 ? { top: chromeBarOffset } : undefined}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <div className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${mobileSearchOpen ? "max-lg:max-w-0 max-lg:opacity-0" : "max-lg:max-w-[200px] max-lg:opacity-100"}`}>
          <Brand />
        </div>
        <nav className={`ml-2 hidden items-center gap-1 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out md:flex ${mobileSearchOpen ? "max-lg:max-w-0 max-lg:opacity-0" : "max-lg:max-w-[600px] max-lg:opacity-100"}`} aria-label="Primary">
          <NavLink to="/" className={linkCls} end>{t("nav", "home")}</NavLink>
          <NavLink to="/discover" className={linkCls}>{t("nav", "discover")}</NavLink>
          <NavLink to="/keepsakes" className={linkCls}>{t("nav", "keepsakes")}</NavLink>
          {session && <NavLink to="/library" className={linkCls}>{t("nav", "library")}</NavLink>}
          {session && <NavLink to="/write" className={linkCls}>{t("nav", "write")}</NavLink>}
        </nav>
        {!isReader && (
          <div ref={searchAreaRef} className={`flex min-w-0 flex-1 items-center gap-2 lg:hidden ${mobileSearchOpen ? "max-lg:absolute max-lg:inset-x-3 max-lg:top-3.5 max-lg:z-10" : ""}`}>
            {mobileSearchOpen ? (
              <>
                <div className="min-w-0 flex-1 origin-right animate-[header-search-pop_0.3s_ease-out]">
                  <SearchBox mobile inputRef={searchInputRef} onClose={closeMobileSearch} onSubmitDone={closeMobileSearch} />
                </div>
                <button
                  type="button"
                  onClick={closeMobileSearch}
                  aria-label={t("common", "close")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-sage/60 hover:text-ink"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                aria-expanded={false}
                aria-label={t("nav", "search")}
                className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 text-sm text-ink-faint hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
                <span className="truncate">{t("nav", "search")}</span>
              </button>
            )}
          </div>
        )}
        <div className={`ml-auto flex items-center gap-2 transition-opacity duration-300 ease-out sm:gap-3 ${mobileSearchOpen ? "max-lg:pointer-events-none max-lg:opacity-0" : "max-lg:opacity-100"}`}>
          {!isReader && <SearchBox />}
          <LocaleToggle />
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { t, session } = useApp();
  const items = [
    { to: "/", label: t("nav", "home"), icon: "⌂" },
    { to: "/discover", label: t("nav", "discover"), icon: "❦" },
    { to: "/keepsakes", label: t("nav", "keepsakes"), icon: "✦" },
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
  const { pathname } = useLocation();
  // The old 112px mobile bottom padding only existed to clear the
  // fixed bottom nav. Reader routes hide the nav, so they get the
  // desktop 40px; other pages keep 80px — still clears the 53px nav
  // with room, without the dead space.
  const isReader = /^\/stories\/[^/]+\/[^/]+\/[^/]+$/.test(pathname);
  const colTitle = "font-serif text-base font-bold text-ink";
  const linkCls =
    "rounded text-sm text-ink-soft underline-offset-4 hover:text-river-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-river";
  const col = (title: string, links: { to: string; label: string }[]) => (
    <nav aria-label={title}>
      <h2 className={colTitle}>{title}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.to + l.label}>
            <Link to={l.to} className={linkCls}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
  return (
    <footer className="mt-10 border-t border-ink/10 bg-paper-dark/40 md:mt-16">
      <div className={`mx-auto max-w-6xl px-4 pt-10 md:py-10 ${isReader ? "pb-10" : "pb-20"}`}>
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-[1.5fr_1fr_1fr_1.3fr] lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <p className="flex items-center gap-2">
              <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg object-cover" aria-hidden />
              <span className="font-serif text-xl font-bold tracking-tight">{t("brand", "brand")}</span>
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-faint">{t("brand", "tagline")}</p>
          </div>

          {col(t("footer", "explore"), [
            { to: "/", label: t("nav", "home") },
            { to: "/discover", label: t("nav", "discover") },
            { to: "/search", label: t("nav", "search") },
            { to: "/keepsakes", label: t("footer", "keepsakesShelf") },
          ])}

          {col(t("footer", "readWrite"), [
            { to: "/library", label: t("nav", "library") },
            { to: "/write", label: t("nav", "write") },
            { to: "/inbox", label: t("notifications", "inbox") },
          ])}

          <div className="col-span-2 lg:col-span-1">
            <h2 className={colTitle}>{t("footer", "classics")}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              <li>
                <Link to={`/search?q=${encodeURIComponent("ক্লাসিক")}`} className={linkCls}>
                  {t("footer", "classicsBn")}
                </Link>
              </li>
              <li>
                <Link to="/search?q=Classic" className={linkCls}>
                  {t("footer", "classicsEn")}
                </Link>
              </li>
            </ul>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-ink-faint">{t("footer", "classicsNote")}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-4 text-xs text-ink-faint">
          <p>{t("footer", "rights")}</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
            <Link to="/about" className={linkCls}>{t("footer", "about")}</Link>
            <Link to="/guidelines" className={linkCls}>{t("footer", "guidelines")}</Link>
            <Link to="/terms" className={linkCls}>{t("footer", "terms")}</Link>
            <Link to="/privacy" className={linkCls}>{t("footer", "privacy")}</Link>
            <Link to="/licence" className={linkCls}>{t("footer", "licence")}</Link>
            <Link to="/keepsakes-policy" className={linkCls}>{t("footer", "keepsakesPolicy")}</Link>
            <Link to="/contact" className={linkCls}>{t("footer", "contact")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useApp();
  const { pathname } = useLocation();
  // Reading pages get no site header and no bottom nav at all — the
  // reader's own floating bar replaces them (same chapter-route
  // test as Header); the main's bottom padding also drops to the
  // footer-only value since nothing floats above it anymore.
  const isReader = /^\/stories\/[^/]+\/[^/]+\/[^/]+$/.test(pathname);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-river focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white">{t("common", "skipToContent")}</a>
      <DemoBanner />
      {!isReader && <Header />}
      <main id="main-content" tabIndex={-1} className={`mx-auto w-full max-w-6xl flex-1 px-4 ${isReader ? "pb-12" : "pb-24 md:pb-12"}`}>{children}</main>
      <Footer />
      {!isReader && <BottomNav />}
    </div>
  );
}

export function NarrowLayout({ children }: { children: ReactNode }) {
  const { t } = useApp();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-river focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white">{t("common", "skipToContent")}</a>
      <DemoBanner />
      <Header />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-8 md:pb-12">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
