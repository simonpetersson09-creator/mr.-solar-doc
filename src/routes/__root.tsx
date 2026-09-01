import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNativeShell } from "@/hooks/use-native-shell";
import { usePurchaseRecovery } from "@/hooks/use-purchase-recovery";
import { Toaster } from "@/components/ui/sonner";


import i18n from "../i18n";
import { isRtlLanguage, normaliseLanguage } from "../i18n/languages";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

/** English copy used for SSR and the first client render (i18n boots async). */
const NOT_FOUND_FALLBACK = {
  title: "Page not found",
  description: "The page you are looking for does not exist or has been moved.",
  home: "Go to start",
};

function NotFoundComponent() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const copy = mounted
    ? {
        title: t("notFound.title"),
        description: t("notFound.description"),
        home: t("notFound.home"),
      }
    : NOT_FOUND_FALLBACK;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <title>{`${copy.title} — Mr. Solar Doc`}</title>
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {copy.home}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FAF7EC" },
      { title: i18n.t("meta.home.title") },
      { name: "description", content: i18n.t("meta.home.description") },
      { name: "author", content: i18n.t("app.name") },
      { property: "og:site_name", content: i18n.t("app.name") },
      { property: "og:title", content: i18n.t("meta.home.title") },
      { property: "og:description", content: i18n.t("meta.home.ogDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Runs inside the query provider so purchase recovery can use it. */
function PurchaseRecovery() {
  usePurchaseRecovery();
  return null;
}

/** Keeps <html lang> and text direction in sync with the chosen language. */
function useDocumentLanguage() {
  useEffect(() => {
    const apply = () => {
      const language = normaliseLanguage(i18n.language);
      document.documentElement.lang = language;
      document.documentElement.dir = isRtlLanguage(language) ? "rtl" : "ltr";
    };
    apply();
    i18n.on("languageChanged", apply);
    return () => i18n.off("languageChanged", apply);
  }, []);
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useNativeShell();
  useDocumentLanguage();




  return (
    <QueryClientProvider client={queryClient}>
      <PurchaseRecovery />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

