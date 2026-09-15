import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Wallet } from "@/core/Wallet";
import { WalletConnector } from "@/core/WalletConnector";
import type { DisconnectScope, IETHProvider, IWallet } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { ETHWalletProvider, useETHWallet } from "@/providers/ETHWalletProvider";

const harness = vi.hoisted(() => ({
  widgetState: {} as Record<string, unknown>,
  connectors: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/useWidgetState", () => ({
  useWidgetState: () => harness.widgetState,
}));
vi.mock("@/context/Chain.context", () => ({
  useChainProviders: () => harness.connectors,
}));

const btcWallet = { id: "unisat", account: { address: "bc1p", publicKeyHex: "02ab" } } as IWallet;
const ethWallet = { id: "metamask", account: { address: "0xabc", publicKeyHex: "04cd" } } as IWallet;

let openModal: ReturnType<typeof vi.fn>;
let displayChains: ReturnType<typeof vi.fn>;
let displayError: ReturnType<typeof vi.fn>;
let displayWallets: ReturnType<typeof vi.fn>;
let reset: ReturnType<typeof vi.fn>;
let disconnectBtc: ReturnType<typeof vi.fn>;
let disconnectEth: ReturnType<typeof vi.fn>;

function setup({
  requiredChainIds = ["ETH"],
  selectedWallets = { BTC: btcWallet, ETH: ethWallet },
  confirmed = true,
}: {
  requiredChainIds?: string[];
  selectedWallets?: Record<string, IWallet | undefined>;
  confirmed?: boolean;
} = {}) {
  harness.widgetState = {
    confirmed,
    chains: { BTC: { id: "BTC" }, ETH: { id: "ETH" } },
    requiredChainIds,
    selectedWallets,
    open: openModal,
    displayChains,
    displayError,
    displayWallets,
    reset,
  };

  return renderHook(() => useWalletConnect());
}

beforeEach(() => {
  openModal = vi.fn();
  displayChains = vi.fn();
  displayError = vi.fn();
  displayWallets = vi.fn();
  reset = vi.fn();
  disconnectBtc = vi.fn().mockResolvedValue(undefined);
  disconnectEth = vi.fn().mockResolvedValue(undefined);
  harness.connectors = {
    BTC: { disconnect: disconnectBtc },
    ETH: { disconnect: disconnectEth, wallets: [], on: () => () => {} },
    BBN: null,
  };
});
afterEach(() => vi.restoreAllMocks());

describe("required versus displayed chains", () => {
  it("reports connected once the single required chain is connected, with an optional chain still missing", () => {
    const { result } = setup({
      selectedWallets: { ETH: ethWallet },
    });

    expect(result.current.selected).toBe(true);
    expect(result.current.connected).toBe(true);
  });

  it("still requires every chain when the host requires two", () => {
    const { result } = setup({
      requiredChainIds: ["BTC", "ETH"],
      selectedWallets: { ETH: ethWallet },
      confirmed: true,
    });

    expect(result.current.selected).toBe(false);
    expect(result.current.connected).toBe(false);
  });

  it("does not report connected on selection alone, before the dialog is confirmed", () => {
    const { result } = setup({
      selectedWallets: { ETH: ethWallet },
      confirmed: false,
    });

    expect(result.current.selected).toBe(true);
    expect(result.current.connected).toBe(false);
  });
});

describe("open", () => {
  it("lands on one chain's wallet list when given that chain", () => {
    const { result } = setup({ requiredChainIds: ["ETH"], selectedWallets: {} });

    result.current.open("BTC");

    expect(displayWallets).toHaveBeenCalledWith("BTC");
    expect(openModal).toHaveBeenCalled();
  });

  it("shows the chain list when called with no chain", () => {
    const { result } = setup({ requiredChainIds: ["ETH"], selectedWallets: {} });

    result.current.open();

    expect(displayChains).toHaveBeenCalled();
    expect(displayWallets).not.toHaveBeenCalled();
  });

  it("does not reset widget state, so a confirmed session survives attaching another chain", () => {
    const { result } = setup({
      selectedWallets: { ETH: ethWallet },
    });

    result.current.open("BTC");

    expect(reset).not.toHaveBeenCalled();
  });
});

describe("disconnect", () => {
  it("disconnects only the named chain and leaves the other connected", async () => {
    const { result } = setup();

    await result.current.disconnect("BTC");

    expect(disconnectBtc).toHaveBeenCalledWith("chain");
    expect(disconnectEth).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("disconnects everything and resets when called with no chain", async () => {
    const { result } = setup();

    await result.current.disconnect();

    expect(disconnectBtc).toHaveBeenCalledWith("all");
    expect(disconnectEth).toHaveBeenCalledWith("all");
    expect(reset).toHaveBeenCalled();
  });

  it("rejects a failed single-chain disconnect without a dialog and leaves the other chain and the widget state alone", async () => {
    const { result } = setup();
    disconnectBtc.mockRejectedValueOnce(new Error("relay down"));

    await expect(result.current.disconnect("BTC")).rejects.toThrow("relay down");

    expect(displayError).not.toHaveBeenCalled();
    expect(disconnectEth).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it.each(["BTC", "ETH"] as const)(
    "explains a refused %s disconnect in the dialog and still rejects",
    async (chain) => {
      const { result } = setup();
      const refusal = new WalletError({
        code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED,
        message: "Bitcoin and Ethereum share one wallet session.",
      });
      const [disconnect, otherDisconnect] =
        chain === "BTC" ? [disconnectBtc, disconnectEth] : [disconnectEth, disconnectBtc];
      disconnect.mockRejectedValueOnce(refusal);

      const eth = renderHook(useETHWallet, { wrapper: ETHWalletProvider });
      await expect(chain === "ETH" ? eth.result.current.disconnect() : result.current.disconnect(chain)).rejects.toBe(
        refusal,
      );

      expect(displayError).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Wallets share one session", description: refusal.message }),
      );
      expect(displayChains).not.toHaveBeenCalled();
      expect(otherDisconnect).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();

      displayError.mock.calls[0][0].onCancel();

      expect(displayChains).toHaveBeenCalled();
    },
  );

  it("clears lost ETH accounts locally and keeps Bitcoin connected", async () => {
    setup();
    const listeners = new Set<(accounts: string[]) => void>();
    const provider = {
      getAddress: vi.fn().mockResolvedValue(ethWallet.account!.address),
      disconnect: vi.fn(async (scope: DisconnectScope) => {
        if (scope !== "local")
          throw new WalletError({
            code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED,
            message: "Bitcoin and Ethereum share one wallet session.",
          });
      }),
      on: (_event: string, listener: (accounts: string[]) => void) => listeners.add(listener),
      off: (_event: string, listener: (accounts: string[]) => void) => listeners.delete(listener),
    };
    const wallet = { ...ethWallet, provider, connect: vi.fn() } as unknown as Wallet<IETHProvider>;
    const connector = new WalletConnector("ETH", "Ethereum", "", [wallet], {});
    harness.connectors.ETH = connector;
    await connector.connect(wallet);
    const onDisconnect = vi.fn();
    const { result } = renderHook(useETHWallet, {
      wrapper: ({ children }) => <ETHWalletProvider callbacks={{ onDisconnect }}>{children}</ETHWalletProvider>,
    });
    await waitFor(() => expect(result.current.connected).toBe(true));
    provider.getAddress.mockResolvedValue("");
    act(() => listeners.forEach((listener) => listener([])));
    await waitFor(() => expect(result.current.connected).toBe(false));
    expect(connector.connectedWallet).toBeNull();
    expect(provider.disconnect).toHaveBeenLastCalledWith("local");

    provider.getAddress.mockResolvedValue(ethWallet.account!.address);
    await act(() => connector.connect(wallet));
    await waitFor(() => expect(result.current.connected).toBe(true));
    provider.getAddress.mockResolvedValue("");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(result.current.connected).toBe(false));
    expect(connector.connectedWallet).toBeNull();
    expect(provider.disconnect).toHaveBeenLastCalledWith("local");

    provider.getAddress.mockResolvedValue(ethWallet.account!.address);
    await act(() => connector.connect(wallet));
    await waitFor(() => expect(result.current.connected).toBe(true));
    provider.getAddress.mockRejectedValue(new Error("Wallet not connected"));
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(result.current.connected).toBe(false));
    expect(connector.connectedWallet).toBeNull();
    expect(provider.disconnect.mock.calls).toEqual([["local"], ["local"], ["local"]]);
    expect(onDisconnect).toHaveBeenCalledTimes(3);
    expect(disconnectBtc).not.toHaveBeenCalled();
    expect(displayError).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("treats a click event as disconnect-all rather than as a chain", async () => {
    const { result } = setup();

    // React's bivariant handler types allow `onClick={disconnect}`, which calls
    // this with a MouseEvent.
    await (result.current.disconnect as (event: unknown) => Promise<void>)({ type: "click" });

    expect(disconnectBtc).toHaveBeenCalled();
    expect(disconnectEth).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });
});
