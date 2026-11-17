import { useEffect, useSyncExternalStore } from "react";
import type { View } from "../types";

export const pagePaths: Record<View, string> = {
  overview: "/overview",
  paystubs: "/paystubs",
  payments: "/payments",
  settings: "/settings",
};
export type AuthPage = "login" | "register";
type Page = View | AuthPage;
const paths: Record<Page, string> = {
  ...pagePaths,
  login: "/login",
  register: "/register",
};

export function resolvePageUrl(
  pathname: string,
  search: string,
  authenticated: boolean,
): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const isAuth = path === "/login" || path === "/register";
  const isPrivate = Object.values(pagePaths).includes(path);
  if (!authenticated) {
    if (isAuth) return `${path}${search}`;
    return isPrivate
      ? `/login?${new URLSearchParams({ next: path })}`
      : "/login";
  }
  if (isAuth) {
    const next = new URLSearchParams(search).get("next");
    return next && Object.values(pagePaths).includes(next)
      ? next
      : pagePaths.overview;
  }
  return isPrivate ? `${path}${search}` : pagePaths.overview;
}

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

export function navigate(page: Page, { replace = false, search = "" } = {}) {
  const path = `${paths[page]}${search}`;
  if (`${window.location.pathname}${window.location.search || ""}` === path)
    return;
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePageNavigation(authenticated: boolean | null) {
  const url = useSyncExternalStore(
    subscribe,
    () => `${window.location.pathname}${window.location.search}`,
  );
  const queryIndex = url.indexOf("?");
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : url.slice(queryIndex);
  const resolved =
    authenticated === null
      ? url
      : resolvePageUrl(pathname, search, authenticated);
  const resolvedPath = resolved.split("?")[0];
  const view = viewFromPath(resolvedPath);
  const authPage: AuthPage =
    resolvedPath === "/register" ? "register" : "login";

  useEffect(() => {
    if (authenticated !== null && url !== resolved) {
      window.history.replaceState(null, "", resolved);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [authenticated, url, resolved]);

  return [view, navigate, authPage] as const;
}
