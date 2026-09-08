import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HashMap, IWallet, Network } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";
import { useWalletConnectors } from "@/hooks/useWalletConnectors";

const TAPROOT_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const OTHER_COMPRESSED_PUBLIC_KEY = "0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

type ConnectHandler = (wallet: IWallet) => void | Promise<void>;
type ErrorHandler = (error: Error) => void;

const harness = vi.hoisted(() => ({
  connectHandler: null as ConnectHandler | null,
  errorHandler: null as ErrorHandler | null,
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
      connectedWallet: null,
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
    visible: true,
    selectWallet: harness.selectWallet,
    removeWallet: harness.removeWallet,
    displayLoader: vi.fn(),
    displayChains: harness.displayChains,
    displayError: harness.displayError,
    confirm: vi.fn(),
    close: vi.fn(),
    reset: vi.fn(),
    chains: {},
  }),
}));

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
    name: "UniSat",
    icon: "",
    docs: "",
    installed: true,
    provider: null,
    label: "",
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
  vi.clearAllMocks();
  harness.disconnect.mockResolvedValue(undefined);
});

describe("BTC validation failure with a refused shared-session disconnect", () => {
  it("still removes the wallet locally and clears persisted storage", async () => {
    const accountStorage = fakeAccountStorage();
    accountStorage.store.set("BTC", "unisat");
    harness.disconnect.mockRejectedValueOnce(sharedSessionRefusal());

    renderHook(() => useWalletConnectors({ persistent: true, accountStorage }));
    await waitFor(() => expect(harness.connectHandler).not.toBeNull());
    await harness.connectHandler?.(connectedWalletWith(OTHER_COMPRESSED_PUBLIC_KEY));

    await waitFor(() => expect(harness.displayError).toHaveBeenCalled());
    const { onCancel } = harness.displayError.mock.calls[0][0];
    await onCancel();

    expect(harness.disconnect).toHaveBeenCalled();
    expect(harness.removeWallet).toHaveBeenCalledWith("BTC");
    expect(accountStorage.store.has("BTC")).toBe(false);
  });
});

describe("SHARED_SESSION_DISCONNECT_REFUSED error event", () => {
  it("shows the shared-session dialog and only calls displayChains once the dialog is dismissed", async () => {
    const accountStorage = fakeAccountStorage();
    renderHook(() => useWalletConnectors({ persistent: false, accountStorage }));
    await waitFor(() => expect(harness.errorHandler).not.toBeNull());

    const refusal = sharedSessionRefusal();
    harness.errorHandler?.(refusal);

    expect(harness.displayError).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Wallets share one session", description: refusal.message }),
    );
    expect(harness.displayChains).not.toHaveBeenCalled();

    harness.displayError.mock.calls[0][0].onCancel();

    expect(harness.displayChains).toHaveBeenCalled();
  });

  it("falls through to displayChains for a plain error", async () => {
    const accountStorage = fakeAccountStorage();
    renderHook(() => useWalletConnectors({ persistent: false, accountStorage }));
    await waitFor(() => expect(harness.errorHandler).not.toBeNull());

    harness.errorHandler?.(new Error("boom"));

    expect(harness.displayError).not.toHaveBeenCalled();
    expect(harness.displayChains).toHaveBeenCalled();
  });
});
