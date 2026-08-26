/**
 * Tests the stale-deploy reload state machine in `reloadForStaleDeploy`. The
 * load-bearing guarantees: it reloads at most once per tab-session, and never
 * reloads when sessionStorage is blocked (which would otherwise loop because
 * the guard could not survive the reload).
 *
 * Each test re-imports the module via `vi.resetModules()` so the module-level
 * `reloadInFlight` flag starts fresh. `sessionStorage` and `location.reload`
 * are stubbed as plain globals so the test is independent of jsdom origin/nav.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RELOAD_FLAG = "staleDeployReload";

let store: Record<string, string>;
let reloadMock: ReturnType<typeof vi.fn>;

function stubSessionStorage(overrides: Partial<Storage> = {}) {
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetModules();
  store = {};
  reloadMock = vi.fn();
  stubSessionStorage();
  vi.stubGlobal("location", { reload: reloadMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function loadReload() {
  return (await import("../lazyWithRetry")).reloadForStaleDeploy;
}

describe("reloadForStaleDeploy", () => {
  it("reloads once and persists the one-shot on a fresh stale-deploy", async () => {
    const reloadForStaleDeploy = await loadReload();

    expect(reloadForStaleDeploy()).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(store[RELOAD_FLAG]).toBe("1");
  });

  it("does not reload when the one-shot was already spent this session", async () => {
    store[RELOAD_FLAG] = "1";
    const reloadForStaleDeploy = await loadReload();

    expect(reloadForStaleDeploy()).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("does not reload when sessionStorage is blocked (no reload-loop)", async () => {
    stubSessionStorage({
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
    });
    const reloadForStaleDeploy = await loadReload();

    expect(reloadForStaleDeploy()).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("dedupes within the session: a second call does not reload again", async () => {
    const reloadForStaleDeploy = await loadReload();

    expect(reloadForStaleDeploy()).toBe(true);
    expect(reloadForStaleDeploy()).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
