import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dp, isDemoMode } from "./provider";
import { t as translate, type DictKey } from "./i18n";
import type { Locale, Profile, Session } from "./types";

interface AppContextValue {
  dp: typeof dp;
  isDemoMode: boolean;
  session: Session | null;
  profile: Profile | null;
  isModerator: boolean;
  sessionLoading: boolean;
  refreshSession: () => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (section: DictKey, key: string) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

const LOCALE_KEY = "golpoghor-locale";

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_KEY);
    return saved === "en" ? "en" : "bn";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LOCALE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => dp.getSession(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const unsub = dp.onAuthChange(() => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    });
    return unsub;
  }, [queryClient]);

  const session = sessionQuery.data ?? null;

  const profileQuery = useQuery({
    queryKey: ["profile", session?.user.id],
    queryFn: () => (session ? dp.getProfile(session.user.id) : Promise.resolve(null)),
    enabled: !!session,
    staleTime: 60_000,
  });

  // Sync profile locale preference on load (profile wins over local default only if never chosen)
  useEffect(() => {
    const chosen = localStorage.getItem(LOCALE_KEY);
    if (!chosen && profileQuery.data?.locale) setLocaleState(profileQuery.data.locale);
  }, [profileQuery.data]);

  const refreshSession = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["session"] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }, [queryClient]);

  const t = useCallback((section: DictKey, key: string) => translate(locale, section, key), [locale]);

  const value = useMemo<AppContextValue>(
    () => ({
      dp,
      isDemoMode,
      session,
      profile: profileQuery.data ?? null,
      isModerator:
        profileQuery.data?.role === "moderator" || profileQuery.data?.role === "admin",
      sessionLoading: sessionQuery.isLoading,
      refreshSession,
      locale,
      setLocale,
      t,
    }),
    [session, profileQuery.data, sessionQuery.isLoading, refreshSession, locale, setLocale, t]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
