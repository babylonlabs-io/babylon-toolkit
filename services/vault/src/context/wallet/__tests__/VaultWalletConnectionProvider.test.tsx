import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WalletConnectionProvider } from "../VaultWalletConnectionProvider";

// Drive the BTC lifecycle callbacks that VaultWalletConnectionProvider passes
// into BTCWalletProvider, and observe whether the destructive disconnectAll()
// cascade fires. We mock the wallet-connector module so the test exercises the
// real blip-guard logic against a controllable connect/disconnect event stream.
type BtcCallbacks = { onConnect: () => void; onDisconnect: () => void };

const h = vi.hoisted(() => ({
  disconnectAll: vi.fn(async () => {}),
  // Mutable BTC connector whose connectedWallet the verify-before-reset check
  // reads at timer-fire time.
  btcConnector: { connectedWallet: null as unknown },
  captured: { btc: undefined as undefined | BtcCallbacks },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  APPKIT_BTC_CONNECTOR_ID: "appkit_btc",
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
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
  ETHWalletProvider: ({ children }: { children: React.ReactNode }) => children,
  createWalletConfig: () => ({}),
  useChainConnector: () => h.btcConnector,
  useWalletConnect: () => ({ disconnect: h.disconnectAll }),
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/config/featureFlags", () => ({
  default: { isSimplifiedTermsEnabled: false },
}));
vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

// Must stay in sync with BTC_DISCONNECT_DEBOUNCE_MS in the provider; advancing
// past it is what would trigger the reset if the guard let it through.
const PAST_DEBOUNCE_MS = 5000;

const renderProvider = () =>
  render(<WalletConnectionProvider>child</WalletConnectionProvider>);

const btc = () => h.captured.btc as BtcCallbacks;

describe("WalletConnectionProvider — BTC disconnect-blip guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.disconnectAll.mockClear();
    h.btcConnector.connectedWallet = null;
    h.captured.btc = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
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
    act(() => btc().onDisconnect());
    // No reconnect and the connector stays disconnected → real disconnect.
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

  it("cancels the reset when the connector reconnected before the timer fires", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => btc().onDisconnect());
    // Connector handshake completed (connectedWallet set) but the provider
    // hasn't fired onConnect yet — verify-before-reset must catch this.
    h.btcConnector.connectedWallet = { id: "unisat" };
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    expect(h.disconnectAll).not.toHaveBeenCalled();
  });
});
