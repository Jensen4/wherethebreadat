import { useEffect, useSyncExternalStore } from "react";
import type { View } from "../types";

export const pagePaths: Record<View, string> = {
  overview: "/overview",
  paystubs: "/paystubs",
  payments: "/payments",
  settings: "/settings",
};

export function viewFromPath(pathname: string): View {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    (Object.keys(pagePaths) as View[]).find(
      (view) => pagePaths[view] === path,
    ) ?? "overview"
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function navigate(view: View) {
  const path = pagePaths[view];
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePageNavigation() {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
  );
  const view = viewFromPath(pathname);

  useEffect(() => {
    // Use one canonical URL for each page, including the root and unknown paths.
    if (pathname !== pagePaths[view]) {
      window.history.replaceState(
        null,
        "",
        `${pagePaths[view]}${window.location.search}${window.location.hash}`,
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [pathname, view]);

  return [view, navigate] as const;
}
