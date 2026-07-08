import { type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Network } from "@/core/types";

import { BTCWalletProvider, useBTCWallet } from "../BTCWalletProvider";

// A persisted BTC session auto-reconnects against whatever network the
// extension is currently on. If the user switched the extension to another
// network while the dApp was closed, the reconnected address no longer matches
// the configured network. These tests pin that BTCWalletProvider refuses to
// commit such an address — it never reaches the app's balance/UTXO queries —
// and tears the session down instead. Without this guard the wrong-network
// address is adopted and the balance silently reads zero.

interface FakeBtcProvider {
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  connectWallet: () => Promise<void>;
}

const SIGNET_ADDR = "tb1qmatchesconfiguredsignetnetwork00000000";
const MAINNET_ADDR = "bc1qwrongnetworkmainnetaddress000000000000";
// 66-char compressed key (valid 03 prefix) so toXOnlyPublicKeyHex yields a
// non-empty x-only key and a valid session reads as connected.
const PUBKEY = `03${"a".repeat(64)}`;

const harness = vi.hoisted(() => ({
  connector: null as {
    connectedWallet: { provider: FakeBtcProvider } | undefined;
    config: { network: Network };
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
vi.mock("@/hooks/useVisibilityCheck", () => ({
  useVisibilityCheck: () => {},
}));

function makeProvider(address: string): FakeBtcProvider {
  return {
    getAddress: async () => address,
    getPublicKeyHex: async () => PUBKEY,
    connectWallet: async () => {},
  };
}

function connectWith(provider: FakeBtcProvider, disconnect: () => Promise<void>) {
  harness.connector = {
    connectedWallet: { provider },
    config: { network: Network.SIGNET },
    on: () => () => {},
    disconnect,
  };
}

function makeWrapper(callbacks?: { onError?: (error: Error) => void }) {
  return ({ children }: { children: ReactNode }) => (
    <BTCWalletProvider callbacks={callbacks}>{children}</BTCWalletProvider>
  );
}

describe("BTCWalletProvider — wrong-network session guard", () => {
  beforeEach(() => {
    harness.connector = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a wrong-network address, reports it, and disconnects instead of adopting it", async () => {
    const disconnect = vi.fn(async () => {});
    const onError = vi.fn();
    connectWith(makeProvider(MAINNET_ADDR), disconnect);

    const { result } = renderHook(() => useBTCWallet(), {
      wrapper: makeWrapper({ onError }),
    });

    await waitFor(() => expect(disconnect).toHaveBeenCalled());
    expect(result.current.address).toBe("");
    expect(result.current.connected).toBe(false);
    // onError is the only user-facing signal for a refused address (it never
    // reaches the balance query that would otherwise raise the deposit alert).
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Incorrect address prefix"),
      }),
      expect.objectContaining({ address: MAINNET_ADDR }),
    );
  });

  it("adopts an address that matches the configured network", async () => {
    const disconnect = vi.fn(async () => {});
    const onError = vi.fn();
    connectWith(makeProvider(SIGNET_ADDR), disconnect);

    const { result } = renderHook(() => useBTCWallet(), {
      wrapper: makeWrapper({ onError }),
    });

    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.address).toBe(SIGNET_ADDR);
    expect(disconnect).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
