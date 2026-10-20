import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider, useApp } from "./lib/app-context";
import { Layout, ScrollToTopOnNavigate } from "./components/layout";
import { ButtonLink, EmptyState } from "./components/ui";
import { HomePage, DiscoverPage, SearchPage } from "./pages/discovery";
import { StoryPage, AuthorPage } from "./pages/story";
import { ReaderPage } from "./pages/reader";
import { LoginPage, SignupPage, ResetPasswordPage, SetPasswordPage } from "./pages/auth";
import { LibraryPage, SettingsPage } from "./pages/library";
import { InboxPage } from "./pages/inbox";
import { WriteDashboard, StoryFormPage } from "./pages/write";
import { ChapterEditorPage } from "./pages/chapter-editor";
import { AdminPage } from "./pages/admin";

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
      { path: "/library", element: <LibraryPage /> },
      { path: "/inbox", element: <InboxPage /> },
      { path: "/write", element: <WriteDashboard /> },
      { path: "/write/stories/new", element: <StoryFormPage /> },
      { path: "/write/stories/:id", element: <StoryFormPage /> },
      { path: "/write/stories/:storyId/chapters/new", element: <ChapterEditorPage /> },
      { path: "/write/chapters/:chapterId", element: <ChapterEditorPage /> },
      { path: "/settings/profile", element: <SettingsPage /> },
      { path: "/admin/reports", element: <AdminPage /> },
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
