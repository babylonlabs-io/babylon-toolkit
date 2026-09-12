import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HashMap, IWallet, Network } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";
import { useWalletConnectors, type BTCAddressValidation } from "@/hooks/useWalletConnectors";

const TAPROOT_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const OTHER_COMPRESSED_PUBLIC_KEY = "0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

type ConnectHandler = (wallet: IWallet) => void | Promise<void>;
type ErrorHandler = (error: Error) => void;

const harness = vi.hoisted(() => ({
  connectHandler: null as ConnectHandler | null,
  errorHandler: null as ErrorHandler | null,
  connectedWallet: null as IWallet | null,
  visible: true,
  disconnect: vi.fn(),
  selectWallet: vi.fn(),
  removeWallet: vi.fn(),
  displayChains: vi.fn(),
  displayError: vi.fn(),
}));

vi.mock("@/context/Chain.context", () => ({
  useChainProviders: () => ({
    BTC: {
      id: "BTC",
      config: { network: Network.MAINNET },
      connectedWallet: harness.connectedWallet,
      disconnect: harness.disconnect,
      on: (event: string, handler: ConnectHandler | ErrorHandler) => {
        if (event === "connect") harness.connectHandler = handler as ConnectHandler;
        if (event === "error") harness.errorHandler = handler as ErrorHandler;
        return () => {};
      },
    },
  }),
}));

vi.mock("@/context/LifecycleHooks.context", () => ({
  useLifeCycleHooks: () => ({}),
}));

vi.mock("@/hooks/useWidgetState", () => ({
  useWidgetState: () => ({
    visible: harness.visible,
    selectWallet: harness.selectWallet,
    removeWallet: harness.removeWallet,
    displayChains: harness.displayChains,
    displayError: harness.displayError,
    confirm: vi.fn(),
  }),
}));

// Rejects every key so the connect handler reaches the mismatch dialog without
// a registered curve.
const rejectEveryKey: BTCAddressValidation = {
  validateAddress: () => {},
  validateAddressWithPK: () => false,
};

function fakeAccountStorage(): HashMap & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: (key: string) => store.get(key),
    set: (key: string, value: string) => void store.set(key, value),
    has: (key: string) => store.has(key),
    delete: (key: string) => store.delete(key),
  };
}

function connectedWalletWith(publicKeyHex: string): IWallet {
  return {
    id: "unisat",
    account: { address: TAPROOT_ADDRESS, publicKeyHex },
  } as IWallet;
}

function sharedSessionRefusal(): WalletError {
  return new WalletError({
    code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED,
    message: "Bitcoin and Ethereum share one wallet session.",
    wallet: "AppKit",
    chainId: "BTC",
  });
}

beforeEach(() => {
  harness.connectHandler = null;
  harness.errorHandler = null;
  harness.connectedWallet = null;
  harness.visible = true;
  vi.clearAllMocks();
  harness.disconnect.mockResolvedValue(undefined);
});

describe("BTC validation failure with a refused shared-session disconnect", () => {
  it("drops the rejected wallet locally and keeps it removed after the dialog closes and opens", async () => {
    const accountStorage = fakeAccountStorage();
    const rejectedWallet = connectedWalletWith(OTHER_COMPRESSED_PUBLIC_KEY);
    harness.connectedWallet = rejectedWallet;
    // The connector stands in for the real one: a chain disconnect is refused
    // for the shared session, and a local disconnect clears its wallet.
    harness.disconnect.mockImplementation(async (scope: string) => {
      if (scope === "chain") throw sharedSessionRefusal();
      harness.connectedWallet = null;
    });
    const { rerender } = renderHook(() =>
      useWalletConnectors({ persistent: true, accountStorage, btcValidation: rejectEveryKey }),
    );
    await harness.connectHandler!(rejectedWallet);
    expect(harness.displayError).toHaveBeenCalledWith(expect.objectContaining({ title: "Public Key Mismatch" }));

    await harness.displayError.mock.calls[0][0].onCancel();

    await waitFor(() => expect(harness.disconnect.mock.calls).toEqual([["chain"], ["local"]]));
    expect(harness.removeWallet).toHaveBeenCalledWith("BTC");
    expect(accountStorage.store.has("BTC")).toBe(false);
    harness.selectWallet.mockClear();
    harness.visible = false;
    rerender();
    harness.visible = true;
    rerender();
    expect(harness.selectWallet).not.toHaveBeenCalledWith("BTC", rejectedWallet);
  });

  it("does not re-select the rejected wallet while the chain disconnect is still in flight", async () => {
    const accountStorage = fakeAccountStorage();
    const rejectedWallet = connectedWalletWith(OTHER_COMPRESSED_PUBLIC_KEY);
    harness.connectedWallet = rejectedWallet;
    // The connector keeps its wallet until the remote chain disconnect settles.
    let settleChainDisconnect!: () => void;
    harness.disconnect.mockImplementation(async (scope: string) => {
      if (scope === "chain") {
        await new Promise<void>((resolve) => {
          settleChainDisconnect = resolve;
        });
      }
      harness.connectedWallet = null;
    });
    const { rerender } = renderHook(() =>
      useWalletConnectors({ persistent: true, accountStorage, btcValidation: rejectEveryKey }),
    );
    await harness.connectHandler!(rejectedWallet);
    harness.displayError.mock.calls[0][0].onCancel();
    await waitFor(() => expect(harness.disconnect).toHaveBeenCalledWith("chain"));

    harness.selectWallet.mockClear();
    harness.visible = false;
    rerender();
    harness.visible = true;
    rerender();

    expect(harness.selectWallet).not.toHaveBeenCalledWith("BTC", rejectedWallet);
    settleChainDisconnect();
    await waitFor(() => expect(harness.connectedWallet).toBeNull());
  });
});

describe("BTC validation failure with a failed chain disconnect", () => {
  it("logs the failure and still drops the rejected wallet locally", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const accountStorage = fakeAccountStorage();
    const rejectedWallet = connectedWalletWith(OTHER_COMPRESSED_PUBLIC_KEY);
    harness.connectedWallet = rejectedWallet;
    harness.disconnect.mockImplementation(async (scope: string) => {
      if (scope === "chain") throw new Error("relay down");
      harness.connectedWallet = null;
    });
    renderHook(() => useWalletConnectors({ persistent: true, accountStorage, btcValidation: rejectEveryKey }));
    await harness.connectHandler!(rejectedWallet);
    await harness.displayError.mock.calls[0][0].onCancel();

    await waitFor(() => expect(harness.disconnect.mock.calls).toEqual([["chain"], ["local"]]));
    expect(consoleError).toHaveBeenCalledWith("Failed to disconnect rejected wallet:", "relay down");
    expect(harness.removeWallet).toHaveBeenCalledWith("BTC");
    expect(accountStorage.store.has("BTC")).toBe(false);
    consoleError.mockRestore();
  });
});
