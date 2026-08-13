import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WalletConnectionProvider } from "../VaultWalletConnectionProvider";

type BtcCallbacks = {
  onConnect: () => void;
  onDisconnect: () => void | Promise<void>;
  onAddressChange: () => void | Promise<void>;
};

type EthCallbacks = {
  onAddressChange: () => void | Promise<void>;
};

const h = vi.hoisted(() => ({
  btcDisconnect: vi.fn(async () => {}),
  captured: {
    btc: undefined as BtcCallbacks | undefined,
    eth: undefined as EthCallbacks | undefined,
    requiredChains: undefined as string[] | undefined,
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
    callbacks: EthCallbacks;
  }) => {
    h.captured.eth = callbacks;
    return children;
  },
  createWalletConfig: () => ({}),
  useWalletConnect: () => ({ disconnect: h.btcDisconnect }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

const renderProvider = () =>
  render(<WalletConnectionProvider>child</WalletConnectionProvider>);

const btc = () => h.captured.btc as BtcCallbacks;
const eth = () => h.captured.eth as EthCallbacks;

describe("WalletConnectionProvider — optional BTC lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.btcDisconnect.mockReset();
    h.btcDisconnect.mockResolvedValue(undefined);
    h.captured.btc = undefined;
    h.captured.eth = undefined;
    h.captured.requiredChains = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires only ETH while keeping BTC configured as an optional chain", () => {
    renderProvider();

    expect(h.captured.requiredChains).toEqual(["ETH"]);
  });

  it("ignores a startup disconnect before BTC has connected", async () => {
    renderProvider();

    await act(async () => btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(5000);

    expect(h.btcDisconnect).not.toHaveBeenCalled();
  });

  it("clears only BTC after a genuine post-connect disconnect", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => void btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(5000);

    expect(h.btcDisconnect).toHaveBeenCalledWith("BTC");
  });

  it("preserves BTC when it reconnects within the debounce window", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => void btc().onDisconnect());
    act(() => btc().onConnect());
    await vi.advanceTimersByTimeAsync(5000);

    expect(h.btcDisconnect).not.toHaveBeenCalled();
  });

  it("ignores a stray disconnect once the BTC session has been torn down", async () => {
    renderProvider();

    act(() => btc().onConnect());
    act(() => void btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.btcDisconnect).toHaveBeenCalledTimes(1);

    // Nothing reconnected, so the session is gone. A late disconnect from the
    // extension must not schedule a second teardown.
    h.btcDisconnect.mockClear();
    act(() => void btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(5000);

    expect(h.btcDisconnect).not.toHaveBeenCalled();
  });

  it("keeps guarding BTC when a reconnect lands while the teardown is in flight", async () => {
    renderProvider();
    let finishDisconnect: (() => void) | undefined;
    h.btcDisconnect.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDisconnect = resolve;
        }),
    );

    act(() => btc().onConnect());
    act(() => void btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.btcDisconnect).toHaveBeenCalledTimes(1);

    // The wallet comes back before `disconnect("BTC")` settles, so there is no
    // pending timer to cancel — only the connection epoch tells the teardown
    // that a newer session now exists.
    act(() => btc().onConnect());
    await act(async () => finishDisconnect?.());

    h.btcDisconnect.mockClear();
    act(() => void btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(5000);

    expect(h.btcDisconnect).toHaveBeenCalledWith("BTC");

    // No reconnect landed behind that second teardown, so the epoch matches
    // and the marker must retire — a later stray disconnect is ignored.
    h.btcDisconnect.mockClear();
    act(() => void btc().onDisconnect());
    await vi.advanceTimersByTimeAsync(5000);

    expect(h.btcDisconnect).not.toHaveBeenCalled();
  });

  it("clears only the BTC connector after a BTC account change", async () => {
    renderProvider();

    await act(async () => btc().onAddressChange());

    expect(h.btcDisconnect).toHaveBeenCalledWith("BTC");
  });

  it("guards connector disconnect callback re-entry", async () => {
    renderProvider();
    h.btcDisconnect.mockImplementationOnce(async () => {
      await btc().onAddressChange();
    });

    await act(async () => btc().onAddressChange());

    expect(h.btcDisconnect).toHaveBeenCalledWith("BTC");
    expect(h.btcDisconnect).toHaveBeenCalledTimes(1);
  });

  it("clears only ETH after an ETH account change", async () => {
    renderProvider();

    await act(async () => eth().onAddressChange());

    expect(h.btcDisconnect).toHaveBeenCalledWith("ETH");
    expect(h.btcDisconnect).toHaveBeenCalledTimes(1);
  });
});
