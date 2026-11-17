import { afterEach, describe, expect, it, vi } from "vitest";
import {
  navigate,
  pagePaths,
  resolvePageUrl,
  viewFromPath,
} from "./navigation";

afterEach(() => vi.unstubAllGlobals());

describe("page navigation", () => {
  it("defaults signed-out visitors to login and signed-in visitors to overview", () => {
    for (const path of ["/", "/missing"]) {
      expect(resolvePageUrl(path, "", false)).toBe("/login");
      expect(resolvePageUrl(path, "", true)).toBe("/overview");
    }
  });

  it("keeps login and registration separate for signed-out visitors", () => {
    expect(resolvePageUrl("/login", "", false)).toBe("/login");
    expect(resolvePageUrl("/register/", "", false)).toBe("/register");
    expect(resolvePageUrl("/register", "?next=%2Fsettings", false)).toBe(
      "/register?next=%2Fsettings",
    );
  });

  it("protects each private page and restores it after sign-in", () => {
    for (const path of Object.values(pagePaths)) {
      const login = resolvePageUrl(path, "", false);
      expect(login).toBe(`/login?${new URLSearchParams({ next: path })}`);
      expect(
        resolvePageUrl("/login", login.slice(login.indexOf("?")), true),
      ).toBe(path);
      expect(resolvePageUrl(path, "", true)).toBe(path);
    }
  });

  it("sends authenticated visitors away from auth pages and rejects unsafe return URLs", () => {
    for (const path of ["/login", "/register"]) {
      expect(resolvePageUrl(path, "", true)).toBe("/overview");
      for (const next of [
        "https://example.com",
        "//example.com",
        "/login",
        "/missing",
      ]) {
        expect(
          resolvePageUrl(path, `?${new URLSearchParams({ next })}`, true),
        ).toBe("/overview");
      }
    }
  });

  it("recognizes every page URL, including trailing slashes", () => {
    for (const [view, path] of Object.entries(pagePaths)) {
      expect(viewFromPath(path)).toBe(view);
      expect(viewFromPath(`${path}/`)).toBe(view);
    }
  });

  it("uses overview for root and unknown URLs", () => {
    expect(viewFromPath("/")).toBe("overview");
    expect(viewFromPath("/missing")).toBe("overview");
    expect(viewFromPath("/payments/unrecognized")).toBe("overview");
  });

  it("updates history and notifies the app without reloading the document", () => {
    const events = new EventTarget();
    const location = { pathname: "/overview" };
    const pushState = vi.fn((_state: unknown, _title: string, path: string) => {
      location.pathname = path;
    });
    vi.stubGlobal("window", {
      location,
      history: { pushState },
      dispatchEvent: (event: Event) => events.dispatchEvent(event),
    });
    vi.stubGlobal("PopStateEvent", Event);
    const onChange = vi.fn(() => viewFromPath(location.pathname));
    events.addEventListener("popstate", onChange);

    navigate("settings");
    expect(pushState).toHaveBeenCalledWith(null, "", "/settings");
    expect(onChange).toHaveReturnedWith("settings");
    navigate("payments");
    expect(onChange).toHaveLastReturnedWith("payments");

    // Selecting the active page must not add duplicate browser history entries.
    navigate("payments");
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
