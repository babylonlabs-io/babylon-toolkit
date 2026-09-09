import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WalletConnectionProvider } from "../VaultWalletConnectionProvider";

// Drive the BTC lifecycle callbacks that VaultWalletConnectionProvider passes
// into BTCWalletProvider, and observe whether the destructive disconnectAll()
// cascade fires. We mock the wallet-connector module so the test exercises the
// real blip-guard logic against a controllable connect/disconnect event stream.
type BtcCallbacks = {
  onConnect: () => void;
  onDisconnect: () => void;
  onAddressChange: () => Promise<void>;
};

const h = vi.hoisted(() => ({
  disconnectAll: vi.fn(async () => {}),
  visible: false,
  captured: {
    btc: undefined as undefined | BtcCallbacks,
    eth: undefined as undefined | Omit<BtcCallbacks, "onConnect">,
    requiredChains: [] as string[],
    persistent: false,
    lifecycleHooks: undefined as unknown,
  },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  APPKIT_BTC_CONNECTOR_ID: "appkit_btc",
  WalletProvider: ({
    children,
    requiredChains,
    persistent,
    lifecycleHooks,
  }: {
    children: React.ReactNode;
    requiredChains: string[];
    persistent: boolean;
    lifecycleHooks?: unknown;
  }) => {
    h.captured.requiredChains = requiredChains;
    h.captured.persistent = persistent;
    h.captured.lifecycleHooks = lifecycleHooks;
    return children;
  },
  BTCWalletProvider: ({
    children,
    callbacks,
  }: {
    children: React.ReactNode;
    callbacks: BtcCallbacks;
  }) => {
    h.captured.btc = callbacks;
    return children;
  },
  ETHWalletProvider: ({
    children,
    callbacks,
  }: {
    children: React.ReactNode;
    callbacks: Omit<BtcCallbacks, "onConnect">;
  }) => {
    h.captured.eth = callbacks;
    return children;
  },
  createWalletConfig: () => ({}),
  useWalletConnect: () => ({ disconnect: h.disconnectAll }),
  useWidgetState: () => ({ visible: h.visible }),
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

// Must stay in sync with BTC_DISCONNECT_DEBOUNCE_MS in the provider; advancing
// past it is what would trigger the reset if the guard let it through.
const PAST_DEBOUNCE_MS = 5000;

const renderProvider = () =>
  render(<WalletConnectionProvider>child</WalletConnectionProvider>);

const btc = () => h.captured.btc as BtcCallbacks;

describe("WalletConnectionProvider wallet resets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.disconnectAll.mockClear();
    h.visible = false;
    h.captured.btc = undefined;
    h.captured.eth = undefined;
    h.captured.requiredChains = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses shared consent and saved approval for BTC and ETH (#2354)", () => {
    renderProvider();

    expect(h.captured.requiredChains).toEqual(["BTC", "ETH"]);
    expect(h.captured.persistent).toBe(true);
    expect(h.captured.lifecycleHooks).toBeUndefined();
  });

  it("resets both wallets immediately when ETH disconnects outside the dialog", () => {
    renderProvider();

    act(() => h.captured.eth!.onDisconnect());

    expect(h.disconnectAll).toHaveBeenCalledTimes(1);
  });

  it("suppresses the ETH reset only while the wallet dialog is open", () => {
    const { rerender } = renderProvider();
    h.visible = true;
    rerender(<WalletConnectionProvider>child</WalletConnectionProvider>);

    act(() => h.captured.eth!.onDisconnect());
    expect(h.disconnectAll).not.toHaveBeenCalled();

    h.visible = false;
    rerender(<WalletConnectionProvider>child</WalletConnectionProvider>);
    act(() => h.captured.eth!.onDisconnect());

    expect(h.disconnectAll).toHaveBeenCalledTimes(1);
  });

  it("resets both wallets immediately when the Bitcoin address changes", async () => {
    h.visible = true;
    renderProvider();

    await act(() => h.captured.btc!.onAddressChange());

    expect(h.disconnectAll).toHaveBeenCalledTimes(1);
  });

  it("resets both wallets immediately when the Ethereum address changes", async () => {
    h.visible = true;
    renderProvider();

    await act(() => h.captured.eth!.onAddressChange());

    expect(h.disconnectAll).toHaveBeenCalledTimes(1);
  });

  it("does not tear down both wallets for a disconnect before BTC ever connected", async () => {
    renderProvider();

    // Startup blip: a disconnect arrives before the first successful connect.
    act(() => btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).not.toHaveBeenCalled();
  });

  it("tears down both wallets for a genuine disconnect after a successful connect", async () => {
    renderProvider();

    act(() => btc().onConnect());
    // No reconnect (onConnect) within the window → a real disconnect. The reset
    // must fire purely on the absence of a reconnect — it must NOT consult the
    // connector's connectedWallet (an extension-initiated disconnect leaves that
    // stale-set, which would wrongly suppress the cascade).
    act(() => btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).toHaveBeenCalledTimes(1);
  });

  it("cancels the reset when a reconnect arrives within the debounce window", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    act(() => btc().onConnect()); // reconnect blip resolved
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).not.toHaveBeenCalled();
  });

  it("still resets both wallets when BTC disconnects inside the dialog", async () => {
    h.visible = true;
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    expect(h.disconnectAll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending BTC reset when the provider unmounts", async () => {
    const { unmount } = renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    unmount();
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).not.toHaveBeenCalled();
  });
});
