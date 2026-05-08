/**
 * Regression tests for the AppKit BTC connection-events bus.
 *
 * Before the fix, `useAppKitBtcBridge` dispatched `babylon:appkit-btc-connected`
 * on `window`, and `AppKitBTCProvider` listened on `window` for that
 * event and adopted `event.detail.{address, publicKey}` as truth. Any
 * same-origin script (XSS, malicious extension content script) could
 * `window.dispatchEvent(...)` a forged event with attacker-chosen values
 * and overwrite the provider's cached connected account.
 *
 * The fix moves the channel off `window` onto a private `EventTarget`
 * held inside `SharedBtcAppKitConfig`. These tests pin the security
 * property at the bus layer:
 *
 *  - `setSharedBtcAppKitConfig` provisions a private `EventTarget` for
 *    `connectionEvents` when the caller doesn't supply one.
 *  - The same `EventTarget` instance is returned across calls (the
 *    bridge and provider must share it).
 *  - Events dispatched on `window` with the connection-event name do
 *    NOT reach listeners on `connectionEvents` — i.e. the spoof channel
 *    is closed.
 *
 * The provider class itself is not imported here because its module
 * graph pulls in SVG asset imports the unit-test runner can't resolve
 * (same constraint as `tests/unit/deriveContextHash.test.ts`). The
 * structural property tested below is what makes the provider's
 * channel-choice fix correct.
 */

import { test, expect } from "@playwright/test";

import { APPKIT_BTC_CONNECTED_EVENT } from "../../src/core/wallets/btc/appkit/constants";
import {
  __resetSharedBtcAppKitConfigForTests,
  getSharedBtcAppKitConfig,
  hasSharedBtcAppKitConfig,
  setSharedBtcAppKitConfig,
} from "../../src/core/wallets/btc/appkit/sharedConfig";

// Minimal stand-ins for the modal/adapter — `sharedConfig` only stores
// these by reference; nothing in the bus tests reads them.
const fakeModal = {} as never;
const fakeAdapter = {} as never;

// Minimal `window` polyfill so the spoofing-attempt branch (`window.dispatchEvent`)
// works in Node-mode Playwright unit tests. We back `window` with a real
// `EventTarget` so add/remove/dispatch behave like the browser.
interface MinimalWindow {
  addEventListener: EventTarget["addEventListener"];
  removeEventListener: EventTarget["removeEventListener"];
  dispatchEvent: EventTarget["dispatchEvent"];
}

function ensureWindow(): MinimalWindow {
  const g = globalThis as typeof globalThis & { window?: MinimalWindow };
  if (g.window && typeof g.window.dispatchEvent === "function") {
    return g.window;
  }
  const target = new EventTarget();
  g.window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  return g.window;
}

test.beforeEach(() => {
  __resetSharedBtcAppKitConfigForTests();
  ensureWindow();
});

test.afterEach(() => {
  __resetSharedBtcAppKitConfigForTests();
});

test.describe("setSharedBtcAppKitConfig — connection-events bus", () => {
  test("auto-creates a private EventTarget when the caller doesn't supply one", () => {
    setSharedBtcAppKitConfig({
      modal: fakeModal,
      adapter: fakeAdapter,
      network: "signet",
    });

    const cfg = getSharedBtcAppKitConfig();
    expect(cfg.connectionEvents).toBeInstanceOf(EventTarget);
  });

  test("returns the same connection-events bus on repeated reads (bridge + provider must share it)", () => {
    setSharedBtcAppKitConfig({
      modal: fakeModal,
      adapter: fakeAdapter,
      network: "mainnet",
    });

    const first = getSharedBtcAppKitConfig().connectionEvents;
    const second = getSharedBtcAppKitConfig().connectionEvents;
    expect(second).toBe(first);
  });

  test("preserves a caller-supplied connection-events bus (test/inject hook)", () => {
    const injected = new EventTarget();
    setSharedBtcAppKitConfig({
      modal: fakeModal,
      adapter: fakeAdapter,
      network: "signet",
      connectionEvents: injected,
    });

    expect(getSharedBtcAppKitConfig().connectionEvents).toBe(injected);
  });

  test("hasSharedBtcAppKitConfig flips to true after set, and back to false on the test reset", () => {
    expect(hasSharedBtcAppKitConfig()).toBe(false);
    setSharedBtcAppKitConfig({
      modal: fakeModal,
      adapter: fakeAdapter,
      network: "signet",
    });
    expect(hasSharedBtcAppKitConfig()).toBe(true);
    __resetSharedBtcAppKitConfigForTests();
    expect(hasSharedBtcAppKitConfig()).toBe(false);
  });
});

test.describe("connection-events bus is NOT reachable from window", () => {
  test("a listener on connectionEvents receives events dispatched on connectionEvents", () => {
    setSharedBtcAppKitConfig({
      modal: fakeModal,
      adapter: fakeAdapter,
      network: "signet",
    });
    const { connectionEvents } = getSharedBtcAppKitConfig();

    const seen: Array<{ address?: string; publicKey?: string }> = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ address?: string; publicKey?: string }>).detail;
      seen.push({ address: detail?.address, publicKey: detail?.publicKey });
    };
    connectionEvents.addEventListener(APPKIT_BTC_CONNECTED_EVENT, listener);

    connectionEvents.dispatchEvent(
      new CustomEvent(APPKIT_BTC_CONNECTED_EVENT, {
        detail: { address: "tb1qlegit", publicKey: "02" + "11".repeat(32) },
      }),
    );

    connectionEvents.removeEventListener(APPKIT_BTC_CONNECTED_EVENT, listener);

    expect(seen).toEqual([{ address: "tb1qlegit", publicKey: "02" + "11".repeat(32) }]);
  });

  test("a listener on connectionEvents does NOT receive forged events dispatched on window (the spoof channel is closed)", () => {
    setSharedBtcAppKitConfig({
      modal: fakeModal,
      adapter: fakeAdapter,
      network: "signet",
    });
    const { connectionEvents } = getSharedBtcAppKitConfig();

    const seen: Array<{ address?: string; publicKey?: string }> = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ address?: string; publicKey?: string }>).detail;
      seen.push({ address: detail?.address, publicKey: detail?.publicKey });
    };
    connectionEvents.addEventListener(APPKIT_BTC_CONNECTED_EVENT, listener);

    // Simulate a malicious same-origin script (XSS or extension content
    // script) trying to spoof the connected BTC account by dispatching a
    // forged CustomEvent on `window`. After the fix, this MUST NOT reach
    // any listener attached to the private connection-events bus.
    window.dispatchEvent(
      new CustomEvent(APPKIT_BTC_CONNECTED_EVENT, {
        detail: { address: "tb1qattacker", publicKey: "03" + "22".repeat(32) },
      }),
    );

    connectionEvents.removeEventListener(APPKIT_BTC_CONNECTED_EVENT, listener);

    expect(seen).toEqual([]);
  });

  test("a window listener does NOT see events dispatched on connectionEvents (channel is one-way private)", () => {
    setSharedBtcAppKitConfig({
      modal: fakeModal,
      adapter: fakeAdapter,
      network: "signet",
    });
    const { connectionEvents } = getSharedBtcAppKitConfig();

    const seen: Array<{ address?: string }> = [];
    const windowListener = (event: Event) => {
      const detail = (event as CustomEvent<{ address?: string }>).detail;
      seen.push({ address: detail?.address });
    };
    window.addEventListener(APPKIT_BTC_CONNECTED_EVENT, windowListener);

    connectionEvents.dispatchEvent(
      new CustomEvent(APPKIT_BTC_CONNECTED_EVENT, {
        detail: { address: "tb1qlegit" },
      }),
    );

    window.removeEventListener(APPKIT_BTC_CONNECTED_EVENT, windowListener);

    // Ensures we don't accidentally re-dispatch on window — anything we
    // emit here must stay private to the bus.
    expect(seen).toEqual([]);
  });
});
