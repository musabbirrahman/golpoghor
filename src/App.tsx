import { createBrowserRouter, Outlet, RouterProvider, useRouteError } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider, useApp } from "./lib/app-context";
import { Layout, ScrollToTopOnNavigate } from "./components/layout";
import { ButtonLink, EmptyState } from "./components/ui";
import { HomePage, DiscoverPage, SearchPage } from "./pages/discovery";
import { LegalPage } from "./pages/legal";
import { StoryPage, AuthorPage } from "./pages/story";
import { ReaderPage } from "./pages/reader";
import { LoginPage, SignupPage, ResetPasswordPage, SetPasswordPage } from "./pages/auth";
import { InboxPage } from "./pages/inbox";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

function NotFound() {
  const { t } = useApp();
  return (
    <Layout>
      <EmptyState
        title={t("errors", "notFound")}
        action={<ButtonLink to="/">{t("nav", "home")}</ButtonLink>}
      />
    </Layout>
  );
}

/** Friendly bilingual recovery screen for route/render/chunk errors (V4-10):
 *  a crash shows this instead of a white page. */
function RouteErrorScreen() {
  const { t } = useApp();
  const error = useRouteError();
  if (typeof console !== "undefined") console.error(error);
  return (
    <Layout>
      <EmptyState
        title={t("errors", "crashTitle")}
        hint={t("errors", "crashBody")}
        action={<ButtonLink to="/">{t("nav", "home")}</ButtonLink>}
      />
    </Layout>
  );
}

/** Supabase recovery links land on /reset-password with tokens in the URL. */
function ResetPasswordRoute() {
  const isRecovery =
    typeof window !== "undefined" &&
    (window.location.hash.includes("type=recovery") ||
      window.location.hash.includes("access_token") ||
      new URLSearchParams(window.location.search).get("type") === "recovery");
  return isRecovery ? <SetPasswordPage /> : <ResetPasswordPage />;
}

/** Persistent root: keeps scroll management mounted across navigations. */
function RootLayout() {
  return (
    <>
      <ScrollToTopOnNavigate />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/discover", element: <DiscoverPage /> },
      { path: "/search", element: <SearchPage /> },
      { path: "/stories/:username/:slug", element: <StoryPage /> },
      { path: "/stories/:username/:slug/:chapterSlug", element: <ReaderPage /> },
      { path: "/authors/:username", element: <AuthorPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/reset-password", element: <ResetPasswordRoute /> },
      // Heavier, signed-in surfaces load on demand (V4-11) so the public
      // reading loop ships a smaller first bundle.
      { path: "/library", lazy: () => import("./pages/library").then((m) => ({ Component: m.LibraryPage })) },
      { path: "/inbox", element: <InboxPage /> },
      { path: "/write", lazy: () => import("./pages/write").then((m) => ({ Component: m.WriteDashboard })) },
      { path: "/write/stories/new", lazy: () => import("./pages/write").then((m) => ({ Component: m.StoryFormPage })) },
      { path: "/write/stories/:id", lazy: () => import("./pages/write").then((m) => ({ Component: m.StoryFormPage })) },
      { path: "/write/stories/:storyId/chapters/new", lazy: () => import("./pages/chapter-editor").then((m) => ({ Component: m.ChapterEditorPage })) },
      { path: "/write/chapters/:chapterId", lazy: () => import("./pages/chapter-editor").then((m) => ({ Component: m.ChapterEditorPage })) },
      { path: "/settings/profile", lazy: () => import("./pages/library").then((m) => ({ Component: m.SettingsPage })) },
      { path: "/admin/reports", lazy: () => import("./pages/admin").then((m) => ({ Component: m.AdminPage })) },
      { path: "/terms", element: <LegalPage slug="terms" /> },
      { path: "/privacy", element: <LegalPage slug="privacy" /> },
      { path: "/guidelines", element: <LegalPage slug="guidelines" /> },
      { path: "/about", element: <LegalPage slug="about" /> },
      { path: "/contact", element: <LegalPage slug="contact" /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>
    </QueryClientProvider>
  );
}
