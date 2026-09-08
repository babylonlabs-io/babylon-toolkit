import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { IChain } from "@/core/types";
import { APPKIT_BTC_CONNECTOR_ID, APPKIT_OPEN_EVENT } from "@/core/wallets/appkit/constants";

import { ChainsContainer } from "../container";

const harness = vi.hoisted(() => ({
  widgetState: {} as Record<string, unknown>,
  connectors: {} as Record<string, unknown>,
  wouldDropEthereum: false,
  onSelectChain: undefined as ((chain: IChain) => Promise<void>) | undefined,
}));

vi.mock("@/hooks/useWidgetState", () => ({
  useWidgetState: () => harness.widgetState,
}));
vi.mock("@/context/Chain.context", () => ({
  useChainProviders: () => harness.connectors,
}));
vi.mock("@/hooks/useWalletConnect", () => ({
  useWalletConnect: () => ({ selected: true }),
}));
vi.mock("@/core/wallets/btc/appkit/sharedConfig", () => ({
  btcDisconnectWouldDropEthereum: () => harness.wouldDropEthereum,
}));

// Stand-in that captures the chain-selection handler instead of rendering the list.
vi.mock("../index", () => ({
  Chains: ({ onSelectChain }: { onSelectChain: (chain: IChain) => Promise<void> }) => {
    harness.onSelectChain = onSelectChain;
    return null;
  },
}));

const BTC_CHAIN = { id: "BTC" } as IChain;

let disconnect: ReturnType<typeof vi.fn>;
let connect: ReturnType<typeof vi.fn>;
let displayWallets: ReturnType<typeof vi.fn>;
let appKitOpened: Mock<(event: Event) => void>;

function selectBtc() {
  render(<ChainsContainer />);
  return harness.onSelectChain!(BTC_CHAIN);
}

beforeEach(() => {
  disconnect = vi.fn().mockResolvedValue(undefined);
  connect = vi.fn().mockResolvedValue(undefined);
  displayWallets = vi.fn();
  appKitOpened = vi.fn<(event: Event) => void>();
  harness.wouldDropEthereum = false;
  harness.onSelectChain = undefined;
  harness.widgetState = {
    chains: { BTC: BTC_CHAIN },
    requiredChainIds: ["BTC"],
    selectedWallets: {},
    displayWallets,
  };
  harness.connectors = {
    BTC: {
      wallets: [{ id: APPKIT_BTC_CONNECTOR_ID }],
      connectedWallet: { id: APPKIT_BTC_CONNECTOR_ID },
      connect,
      disconnect,
    },
  };
  window.addEventListener(APPKIT_OPEN_EVENT, appKitOpened);
});

afterEach(() => {
  window.removeEventListener(APPKIT_OPEN_EVENT, appKitOpened);
});

describe("selecting an already-connected AppKit Bitcoin row", () => {
  it("disconnects bitcoin instead of opening the AppKit modal when the session also carries ethereum", async () => {
    harness.wouldDropEthereum = true;

    await selectBtc();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledWith();
    expect(appKitOpened).not.toHaveBeenCalled();
  });

  it("opens the AppKit modal when bitcoin does not share its session with ethereum", async () => {
    await selectBtc();

    expect(appKitOpened).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("swallows a refused disconnect so the click handler still settles", async () => {
    harness.wouldDropEthereum = true;
    disconnect.mockRejectedValue(new Error("refused"));

    await expect(selectBtc()).resolves.toBeUndefined();

    expect(appKitOpened).not.toHaveBeenCalled();
  });
});
