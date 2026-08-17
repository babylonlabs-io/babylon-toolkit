import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IWallet } from "@/core/types";
import { useWalletConnect } from "@/hooks/useWalletConnect";

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
let displayWallets: ReturnType<typeof vi.fn>;
let reset: ReturnType<typeof vi.fn>;
let disconnectBtc: ReturnType<typeof vi.fn>;
let disconnectEth: ReturnType<typeof vi.fn>;

function setup({
  requiredChainIds,
  selectedWallets,
  confirmed = false,
}: {
  requiredChainIds: string[];
  selectedWallets: Record<string, IWallet | undefined>;
  confirmed?: boolean;
}) {
  harness.widgetState = {
    confirmed,
    chains: { BTC: { id: "BTC" }, ETH: { id: "ETH" } },
    requiredChainIds,
    selectedWallets,
    open: openModal,
    displayChains,
    displayWallets,
    reset,
  };

  return renderHook(() => useWalletConnect());
}

beforeEach(() => {
  openModal = vi.fn();
  displayChains = vi.fn();
  displayWallets = vi.fn();
  reset = vi.fn();
  disconnectBtc = vi.fn().mockResolvedValue(undefined);
  disconnectEth = vi.fn().mockResolvedValue(undefined);
  harness.connectors = {
    BTC: { disconnect: disconnectBtc },
    ETH: { disconnect: disconnectEth },
    BBN: null,
  };
});

describe("required versus displayed chains", () => {
  it("reports connected once the single required chain is connected, with an optional chain still missing", () => {
    const { result } = setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { ETH: ethWallet },
      confirmed: true,
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
      requiredChainIds: ["ETH"],
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
      requiredChainIds: ["ETH"],
      selectedWallets: { ETH: ethWallet },
      confirmed: true,
    });

    result.current.open("BTC");

    expect(reset).not.toHaveBeenCalled();
  });
});

describe("disconnect", () => {
  it("disconnects only the named chain and leaves the other connected", async () => {
    const { result } = setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { BTC: btcWallet, ETH: ethWallet },
      confirmed: true,
    });

    await result.current.disconnect("BTC");

    expect(disconnectBtc).toHaveBeenCalled();
    expect(disconnectEth).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("disconnects everything and resets when called with no chain", async () => {
    const { result } = setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { BTC: btcWallet, ETH: ethWallet },
      confirmed: true,
    });

    await result.current.disconnect();

    expect(disconnectBtc).toHaveBeenCalled();
    expect(disconnectEth).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });

  it("treats a click event as disconnect-all rather than as a chain", async () => {
    const { result } = setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { BTC: btcWallet, ETH: ethWallet },
      confirmed: true,
    });

    // React's bivariant handler types allow `onClick={disconnect}`, which calls
    // this with a MouseEvent.
    await (result.current.disconnect as (event: unknown) => Promise<void>)({ type: "click" });

    expect(disconnectBtc).toHaveBeenCalled();
    expect(disconnectEth).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });
});
