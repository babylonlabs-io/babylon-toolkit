import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WalletConnectionProvider } from "../VaultWalletConnectionProvider";

// Drive the wallet events and check which connector cleanup Vault requests.
type BtcCallbacks = {
  onConnect: () => void;
  onDisconnect: () => void;
  onAddressChange: () => Promise<void>;
};

const h = vi.hoisted(() => ({
  disconnectAll: vi.fn(async () => {}),
  btcConnector: { disconnect: vi.fn<(scope: string) => Promise<void>>() },
  visible: false,
  captured: {
    btc: undefined as undefined | BtcCallbacks,
    eth: undefined as undefined | Omit<BtcCallbacks, "onConnect">,
    requiredChains: [] as string[],
  },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  APPKIT_BTC_CONNECTOR_ID: "appkit_btc",
  WalletProvider: ({
    children,
    requiredChains,
  }: {
    children: React.ReactNode;
    requiredChains: string[];
  }) => {
    h.captured.requiredChains = requiredChains;
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
  useChainConnector: () => h.btcConnector,
  useWalletConnect: () => ({ disconnect: h.disconnectAll }),
  useWidgetState: () => ({ visible: h.visible }),
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

// Must stay in sync with BTC_DISCONNECT_DEBOUNCE_MS in the provider; advancing
// past it is what runs the local Bitcoin cleanup if the guards let it through.
const PAST_DEBOUNCE_MS = 5000;

const renderProvider = () =>
  render(<WalletConnectionProvider>child</WalletConnectionProvider>);

const btc = () => h.captured.btc as BtcCallbacks;

describe("WalletConnectionProvider wallet resets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.disconnectAll.mockClear();
    h.btcConnector.disconnect.mockReset();
    h.visible = false;
    h.captured.btc = undefined;
    h.captured.eth = undefined;
    h.captured.requiredChains = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires both BTC and ETH in the wallet dialog", () => {
    renderProvider();

    expect(h.captured.requiredChains).toEqual(["BTC", "ETH"]);
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
    expect(h.btcConnector.disconnect).not.toHaveBeenCalled();
  });

  it("clears only Bitcoin after a disconnect outlasts the reconnect delay", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    expect(h.btcConnector.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.btcConnector.disconnect).toHaveBeenCalledExactlyOnceWith("local");
    expect(h.disconnectAll).not.toHaveBeenCalled();
  });

  it("cancels the reset when a reconnect arrives within the debounce window", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    act(() => btc().onConnect()); // reconnect blip resolved
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).not.toHaveBeenCalled();
    expect(h.btcConnector.disconnect).not.toHaveBeenCalled();
  });

  it("keeps Ethereum connected when Bitcoin disconnects inside the dialog", async () => {
    h.visible = true;
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    act(() => h.captured.eth!.onDisconnect());
    expect(h.disconnectAll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.btcConnector.disconnect).toHaveBeenCalledExactlyOnceWith("local");
    expect(h.disconnectAll).not.toHaveBeenCalled();
  });

  it("ignores the disconnect event emitted by Bitcoin cleanup", async () => {
    renderProvider();
    h.btcConnector.disconnect.mockImplementationOnce(async () => {
      btc().onDisconnect();
    });

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS * 2);

    expect(h.btcConnector.disconnect).toHaveBeenCalledExactlyOnceWith("local");
    expect(h.disconnectAll).not.toHaveBeenCalled();
  });

  it("skips the Bitcoin cleanup when a full reset starts inside the window", async () => {
    h.disconnectAll.mockImplementationOnce(() => new Promise(() => {}));
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    act(() => h.captured.eth!.onDisconnect());
    expect(h.disconnectAll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.btcConnector.disconnect).not.toHaveBeenCalled();
  });

  it("clears Bitcoin again after a reconnect that follows a local cleanup", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
    expect(h.btcConnector.disconnect).toHaveBeenCalledExactlyOnceWith("local");

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.btcConnector.disconnect).toHaveBeenCalledTimes(2);
    expect(h.btcConnector.disconnect).toHaveBeenLastCalledWith("local");
  });

  it("cancels a pending BTC reset when the provider unmounts", async () => {
    const { unmount } = renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    unmount();
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).not.toHaveBeenCalled();
    expect(h.btcConnector.disconnect).not.toHaveBeenCalled();
  });
});
