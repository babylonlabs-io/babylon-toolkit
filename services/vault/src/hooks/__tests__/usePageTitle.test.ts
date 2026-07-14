import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { usePageTitle } from "../usePageTitle";

function renderAtPath(path: string) {
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries: [path] }, children);
  }
  return renderHook(() => usePageTitle(), { wrapper });
}

describe("usePageTitle", () => {
  it("resolves the root dashboard path to the overview title", () => {
    const { result } = renderAtPath("/");
    expect(result.current).toBe(COPY.nav.overview);
  });

  it.each([
    ["/activity", COPY.nav.activity],
    ["/vaults", COPY.nav.vaults],
    ["/loans", COPY.nav.loans],
    ["/liquidations", COPY.nav.liquidations],
    ["/explore", COPY.nav.explore],
  ])("resolves exact path %s to its section title", (path, title) => {
    const { result } = renderAtPath(path);
    expect(result.current).toBe(title);
  });

  it.each([
    ["/activity/0xabc123", COPY.nav.activity],
    ["/vaults/some-vault-id", COPY.nav.vaults],
    ["/loans/loan-42", COPY.nav.loans],
    ["/liquidations/liq-1", COPY.nav.liquidations],
    ["/explore/details", COPY.nav.explore],
  ])(
    "resolves nested sub-route %s to its parent section's title",
    (path, title) => {
      const { result } = renderAtPath(path);
      expect(result.current).toBe(title);
    },
  );

  it("matches a path case-insensitively, mirroring react-router's default route matching", () => {
    const { result } = renderAtPath("/Activity");
    expect(result.current).toBe(COPY.nav.activity);
  });

  it.each(["/vaultsfoo", "/loansxyz", "/activityhistory"])(
    "does not match a path that merely shares a prefix's characters (%s falls back to overview)",
    (path) => {
      const { result } = renderAtPath(path);
      expect(result.current).toBe(COPY.nav.overview);
    },
  );


  it("falls back to the overview title for an unknown/404-ish path", () => {
    const { result } = renderAtPath("/some-random-path");
    expect(result.current).toBe(COPY.nav.overview);
  });

  it("updates the title on an already-mounted tree when navigating, without remounting", () => {
    function wrapper({ children }: { children: ReactNode }) {
      return createElement(MemoryRouter, { initialEntries: ["/"] }, children);
    }
    const { result } = renderHook(
      () => ({ title: usePageTitle(), navigate: useNavigate() }),
      { wrapper },
    );

    expect(result.current.title).toBe(COPY.nav.overview);

    act(() => {
      result.current.navigate("/activity");
    });

    expect(result.current.title).toBe(COPY.nav.activity);
  });
});
