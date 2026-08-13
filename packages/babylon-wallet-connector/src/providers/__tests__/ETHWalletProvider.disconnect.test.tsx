import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ETHWalletProvider, useETHWallet } from "../ETHWalletProvider";

// Minimal stand-in for the AppKit ETH provider. Only `getAddress` is used by
// the session paths under test; `on`/`off` are deliberately absent so the
// account-change listener feature-detects itself out.
interface FakeEthProvider {
  getAddress: () => Promise<string>;
}

const harness = vi.hoisted(() => ({
  connector: null as {
    connectedWallet: { provider: FakeEthProvider } | undefined;
    wallets: never[];
    disconnect: () => Promise<void>;
    on: (event: string, handler: () => void) => () => void;
  } | null,
}));

// The provider reads its session from the chain connector and wires the
// wallet-connect modal and the visibility check through these hooks. Stub them
// so the test drives the session lifecycle directly.
vi.mock("@/hooks/useChainConnector", () => ({
  useChainConnector: () => harness.connector,
}));
vi.mock("@/hooks/useWalletConnect", () => ({
  useWalletConnect: () => ({ open: vi.fn() }),
}));
vi.mock("@/hooks/useVisibilityCheck", () => ({
  useVisibilityCheck: () => {},
}));

const ADDRESS = "0xabc0000000000000000000000000000000000001";

function connectWith(provider: FakeEthProvider, disconnect: () => Promise<void>): void {
  harness.connector = {
    connectedWallet: { provider },
    wallets: [],
    disconnect,
    on: () => () => {},
  };
}

describe("ETHWalletProvider — disconnect", () => {
  beforeEach(() => {
    harness.connector = null;
  });

  it("still notifies the host when the connector teardown rejects", async () => {
    const onDisconnect = vi.fn(async () => {});
    const callbacks = { onDisconnect };
    const disconnect = vi.fn(async () => {
      throw new Error("connector teardown failed");
    });
    connectWith({ getAddress: async () => ADDRESS }, disconnect);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ETHWalletProvider callbacks={callbacks}>{children}</ETHWalletProvider>
    );
    const { result } = renderHook(() => useETHWallet(), { wrapper });

    await waitFor(() => expect(result.current.connected).toBe(true));

    if (harness.connector) harness.connector.connectedWallet = undefined;
    await act(async () => {
      await result.current.disconnect();
    });

    expect(disconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(result.current.connected).toBe(false);
  });

  it("tears the connector down when the disconnect arrives before the first address resolves", async () => {
    let resolveAddress: (value: string) => void = () => {};
    const pendingAddress = new Promise<string>((resolve) => {
      resolveAddress = resolve;
    });
    const getAddress = vi.fn(() => pendingAddress);
    const disconnect = vi.fn(async () => {});
    connectWith({ getAddress }, disconnect);

    const wrapper = ({ children }: { children: ReactNode }) => <ETHWalletProvider>{children}</ETHWalletProvider>;
    const { result } = renderHook(() => useETHWallet(), { wrapper });

    await waitFor(() => expect(getAddress).toHaveBeenCalledOnce());

    if (harness.connector) harness.connector.connectedWallet = undefined;
    await act(async () => {
      await result.current.disconnect();
    });

    // Without this the connector stays connected while the app shows no
    // session, and the wallet can never be reconnected through the dialog.
    expect(disconnect).toHaveBeenCalledOnce();

    resolveAddress(ADDRESS);
  });

  it("does not resurrect a session from an address that resolves after disconnect", async () => {
    let resolveAddress: (value: string) => void = () => {};
    const pendingAddress = new Promise<string>((resolve) => {
      resolveAddress = resolve;
    });
    const getAddress = vi.fn(() => pendingAddress);
    const onConnect = vi.fn();
    const callbacks = { onConnect };
    connectWith({ getAddress }, async () => {});

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ETHWalletProvider callbacks={callbacks}>{children}</ETHWalletProvider>
    );
    const { result } = renderHook(() => useETHWallet(), { wrapper });

    await waitFor(() => expect(getAddress).toHaveBeenCalledOnce());

    if (harness.connector) harness.connector.connectedWallet = undefined;
    await act(async () => {
      await result.current.disconnect();
      resolveAddress(ADDRESS);
      await pendingAddress;
      await Promise.resolve();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.address).toBeUndefined();
    expect(onConnect).not.toHaveBeenCalled();
  });
});
