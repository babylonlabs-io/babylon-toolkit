import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { IChain } from "@/core/types";
import { APPKIT_BTC_CONNECTOR_ID, APPKIT_OPEN_EVENT } from "@/core/wallets/appkit/constants";
import { ERROR_CODES, WalletError } from "@/error";

import { ChainsContainer } from "../container";

const harness = vi.hoisted(() => ({
  widgetState: {} as Record<string, unknown>,
  connectors: {} as Record<string, unknown>,
  disconnect: vi.fn(),
  onSelectChain: undefined as ((chain: IChain) => Promise<void>) | undefined,
}));

vi.mock("@/hooks/useWidgetState", () => ({
  useWidgetState: () => harness.widgetState,
}));
vi.mock("@/context/Chain.context", () => ({
  useChainProviders: () => harness.connectors,
}));
vi.mock("@/hooks/useWalletConnect", () => ({
  useWalletConnect: () => ({ selected: true, disconnect: harness.disconnect }),
}));

// Stand-in that captures the chain-selection handler instead of rendering the list.
vi.mock("../index", () => ({
  Chains: ({ onSelectChain }: { onSelectChain: (chain: IChain) => Promise<void> }) => {
    harness.onSelectChain = onSelectChain;
    return null;
  },
}));

const BTC_CHAIN = { id: "BTC" } as IChain;

let connect: ReturnType<typeof vi.fn>;
let displayWallets: ReturnType<typeof vi.fn>;
let appKitOpened: Mock<(event: Event) => void>;

function selectBtc() {
  render(<ChainsContainer />);
  return harness.onSelectChain!(BTC_CHAIN);
}

beforeEach(() => {
  harness.disconnect.mockReset();
  harness.disconnect.mockResolvedValue(undefined);
  connect = vi.fn().mockResolvedValue(undefined);
  displayWallets = vi.fn();
  appKitOpened = vi.fn<(event: Event) => void>();
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
    },
  };
  window.addEventListener(APPKIT_OPEN_EVENT, appKitOpened);
});

afterEach(() => {
  window.removeEventListener(APPKIT_OPEN_EVENT, appKitOpened);
});

describe("selecting an already-connected AppKit Bitcoin row", () => {
  it("disconnects bitcoin through the connector instead of opening the AppKit modal", async () => {
    await selectBtc();

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.disconnect).toHaveBeenCalledWith("BTC");
    expect(appKitOpened).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("settles quietly when the disconnect is refused for a shared session", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.disconnect.mockRejectedValue(
      new WalletError({ code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED, message: "shared", chainId: "BTC" }),
    );

    await expect(selectBtc()).resolves.toBeUndefined();

    expect(consoleError).not.toHaveBeenCalled();
    expect(appKitOpened).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("logs any other disconnect failure and still settles", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.disconnect.mockRejectedValue(new Error("relay down"));

    await expect(selectBtc()).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith("Failed to disconnect AppKit BTC:", "relay down");
    expect(appKitOpened).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
