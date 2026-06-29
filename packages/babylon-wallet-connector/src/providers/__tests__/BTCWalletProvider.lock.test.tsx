import { type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BTCWalletProvider, useBTCWallet } from "../BTCWalletProvider";

// Minimal stand-in for the injected wallet provider. Only the methods the lock
// engine actually calls are implemented; `getAccounts` is optional so the
// feature-detection path (wallets without a non-interactive read) can be
// exercised by omitting it.
interface FakeBtcProvider {
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  connectWallet: () => Promise<void>;
  getAccounts?: () => Promise<string[]>;
}

const harness = vi.hoisted(() => ({
  connector: null as {
    connectedWallet: { provider: FakeBtcProvider } | undefined;
    on: () => () => void;
  } | null,
}));

// The provider reads its session from the chain connector and wires the
// visibility check / wallet-connect modal through these hooks. Stub them so the
// test drives the lock engine directly: the connector supplies the fake
// provider, and the visibility check is a no-op so only the lock poll runs.
vi.mock("@/hooks/useChainConnector", () => ({
  useChainConnector: () => harness.connector,
}));
vi.mock("@/hooks/useWalletConnect", () => ({
  useWalletConnect: () => ({ open: vi.fn() }),
}));
vi.mock("@/hooks/useVisibilityCheck", () => ({
  useVisibilityCheck: () => {},
}));

const ADDR = "bc1ptestcachedaddress0000000000000000000000";
// 66-char compressed key with a valid `03` prefix so toXOnlyPublicKeyHex
// returns a non-empty x-only key and the session reads as connected.
const PUBKEY = `03${"a".repeat(64)}`;
const OTHER_ADDR = "bc1pdifferentaccount00000000000000000000000";

function makeProvider(overrides: Partial<FakeBtcProvider> = {}): FakeBtcProvider {
  return {
    getAddress: async () => ADDR,
    getPublicKeyHex: async () => PUBKEY,
    connectWallet: async () => {},
    getAccounts: async () => [ADDR],
    ...overrides,
  };
}

function connectWith(provider: FakeBtcProvider): void {
  harness.connector = {
    connectedWallet: { provider },
    on: () => () => {},
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <BTCWalletProvider>{children}</BTCWalletProvider>
);

// Fire a focus event — the provider runs an immediate lock probe on focus. The
// provider also re-runs connectBTC once as the cached address/pubkey settle,
// which transiently clears `locked`, so a positive lock assertion re-probes
// until the steady-state verdict sticks.
function focusTab(): void {
  window.dispatchEvent(new Event("focus"));
}

describe("BTCWalletProvider — silent lock engine", () => {
  beforeEach(() => {
    harness.connector = null;
    // The lock poll and the focus probe only run while the tab is visible.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("flags the wallet as locked when the non-interactive accounts read returns empty", async () => {
    connectWith(makeProvider({ getAccounts: async () => [] }));

    const { result } = renderHook(() => useBTCWallet(), { wrapper });

    await waitFor(() => {
      focusTab();
      expect(result.current.locked).toBe(true);
    });
  });

  it("keeps the wallet unlocked when the cached address is still among the accounts", async () => {
    const getAccounts = vi.fn(async () => [ADDR]);
    connectWith(makeProvider({ getAccounts }));

    const { result } = renderHook(() => useBTCWallet(), { wrapper });

    await waitFor(() => expect(result.current.connected).toBe(true));
    await act(async () => {
      focusTab();
    });
    await waitFor(() => expect(getAccounts).toHaveBeenCalled());
    expect(result.current.locked).toBe(false);
  });

  it("does not flag a lock when the wallet reports a different active account (account switch, not a lock)", async () => {
    const getAccounts = vi.fn(async () => [OTHER_ADDR]);
    connectWith(makeProvider({ getAccounts }));

    const { result } = renderHook(() => useBTCWallet(), { wrapper });

    await waitFor(() => expect(result.current.connected).toBe(true));
    await act(async () => {
      focusTab();
    });
    await waitFor(() => expect(getAccounts).toHaveBeenCalled());
    expect(result.current.locked).toBe(false);
  });

  it("never flags a wallet that exposes no non-interactive accounts read (feature-detected out)", async () => {
    const getAccounts = vi.fn(async () => []);
    connectWith(makeProvider({ getAccounts: undefined }));

    const { result } = renderHook(() => useBTCWallet(), { wrapper });

    await waitFor(() => expect(result.current.connected).toBe(true));
    await act(async () => {
      focusTab();
    });
    // A wallet without getAccounts is feature-detected out: it is never probed.
    expect(getAccounts).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(false);
  });

  it("clears the lock after a successful reconnect", async () => {
    connectWith(makeProvider({ getAccounts: async () => [] }));

    const { result } = renderHook(() => useBTCWallet(), { wrapper });

    await waitFor(() => {
      focusTab();
      expect(result.current.locked).toBe(true);
    });

    await act(async () => {
      await result.current.reconnect();
    });

    expect(result.current.locked).toBe(false);
  });

  it("does not resurrect lock state for a session torn down while a probe was in flight", async () => {
    let resolveProbe: (value: string[]) => void = () => {};
    // One shared deferred promise so every probe call awaits the same resolution
    // (the lock poll may call getAccounts more than once while the session
    // settles); resolving it once releases the in-flight probe.
    const probe = new Promise<string[]>((resolve) => {
      resolveProbe = resolve;
    });
    const getAccounts = vi.fn(() => probe);
    connectWith(makeProvider({ getAccounts }));

    const { result } = renderHook(() => useBTCWallet(), { wrapper });

    await waitFor(() => expect(result.current.connected).toBe(true));
    await waitFor(() => expect(getAccounts).toHaveBeenCalled());

    // Simulate the wallet/connector disconnecting, then release the stale probe
    // with a "locked" verdict ([]) against the now-dead session. disconnect()
    // invalidates the probe context synchronously, so the stale resolution must
    // bail instead of flagging a wallet that is no longer connected (which would
    // show an "Unlock" button for a disconnected session, with no further poll
    // to clear it). Clearing connectedWallet first stops the connect effect from
    // immediately re-establishing the session.
    if (harness.connector) harness.connector.connectedWallet = undefined;
    await act(async () => {
      result.current.disconnect();
      resolveProbe([]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.locked).toBe(false);
  });
});
