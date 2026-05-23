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
});
