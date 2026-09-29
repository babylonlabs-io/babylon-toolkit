import { type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BTCWalletProvider, useBTCWallet } from "../BTCWalletProvider";

// Minimal stand-in for the wallet provider: only what the tab-return check calls.
interface FakeBtcProvider {
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  connectWallet: () => Promise<void>;
}

const harness = vi.hoisted(() => ({
  connector: null as {
    connectedWallet: { provider: FakeBtcProvider; hardware: boolean } | undefined;
    on: () => () => void;
    disconnect: () => Promise<void>;
  } | null,
}));

vi.mock("@/hooks/useChainConnector", () => ({
  useChainConnector: () => harness.connector,
}));
vi.mock("@/hooks/useWalletConnect", () => ({
  useWalletConnect: () => ({ open: vi.fn() }),
}));

const ADDR = "bc1ptestcachedaddress0000000000000000000000";
const PUBKEY = `03${"a".repeat(64)}`;
// useVisibilityCheck's default delay before it runs the check.
const VISIBILITY_CHECK_DELAY_MS = 500;

const wrapper = ({ children }: { children: ReactNode }) => <BTCWalletProvider>{children}</BTCWalletProvider>;

function returnToTab(): void {
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("BTCWalletProvider — tab-return connection check", () => {
  beforeEach(() => {
    harness.connector = null;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("never reconnects or disconnects a hardware wallet when the tab regains focus", async () => {
    const connectWallet = vi.fn(async () => {
      throw new Error("requestDevice needs a user gesture");
    });
    const disconnect = vi.fn(async () => {});
    harness.connector = {
      connectedWallet: {
        provider: { getAddress: async () => ADDR, getPublicKeyHex: async () => PUBKEY, connectWallet },
        hardware: true,
      },
      on: () => () => {},
      disconnect,
    };
    const { result } = renderHook(() => useBTCWallet(), { wrapper });
    await waitFor(() => expect(result.current.connected).toBe(true));
    vi.useFakeTimers();

    await act(async () => {
      returnToTab();
      await vi.advanceTimersByTimeAsync(VISIBILITY_CHECK_DELAY_MS);
    });

    expect(connectWallet).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(true);
  });

  it("still re-checks an extension wallet when the tab regains focus", async () => {
    const connectWallet = vi.fn(async () => {});
    harness.connector = {
      connectedWallet: {
        provider: { getAddress: async () => ADDR, getPublicKeyHex: async () => PUBKEY, connectWallet },
        hardware: false,
      },
      on: () => () => {},
      disconnect: async () => {},
    };
    const { result } = renderHook(() => useBTCWallet(), { wrapper });
    await waitFor(() => expect(result.current.connected).toBe(true));
    vi.useFakeTimers();

    await act(async () => {
      returnToTab();
      await vi.advanceTimersByTimeAsync(VISIBILITY_CHECK_DELAY_MS);
    });

    expect(connectWallet).toHaveBeenCalledTimes(1);
  });
});
