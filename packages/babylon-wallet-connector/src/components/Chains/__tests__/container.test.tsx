import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { IChain } from "@/core/types";
import { APPKIT_BTC_CONNECTOR_ID, APPKIT_ETH_CONNECTOR_ID, APPKIT_OPEN_EVENT } from "@/core/wallets/appkit/constants";
import { __resetSharedBtcAppKitConfigForTests, setSharedBtcAppKitConfig } from "@/core/wallets/btc/appkit/sharedConfig";
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

function selectChain(id: "BTC" | "ETH") {
  render(<ChainsContainer />);
  return harness.onSelectChain!({ id } as IChain);
}

function configureEthereum(providerType: string, btcConnected = true) {
  harness.connectors.ETH = {
    wallets: [{ id: APPKIT_ETH_CONNECTOR_ID }],
    connectedWallet: { id: APPKIT_ETH_CONNECTOR_ID },
    connect,
  };
  setSharedBtcAppKitConfig({
    modal: {
      getProviderType: (namespace: string) => (namespace === "eip155" ? providerType : "ANNOUNCED"),
      getAccount: (namespace: string) => (namespace === "bip122" ? { isConnected: btcConnected } : undefined),
    } as never,
    adapter: {} as never,
    network: "signet",
  });
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
  __resetSharedBtcAppKitConfigForTests();
});

it.each(["BTC", "ETH"] as const)("connects the selected %s wallet when disconnected", async (chain) => {
  if (chain === "ETH") configureEthereum("WALLET_CONNECT");
  const connector = harness.connectors[chain] as { connectedWallet?: unknown };
  connector.connectedWallet = undefined;

  await selectChain(chain);

  expect(connect).toHaveBeenCalledWith(chain === "ETH" ? APPKIT_ETH_CONNECTOR_ID : APPKIT_BTC_CONNECTOR_ID);
  expect(harness.disconnect).not.toHaveBeenCalled();
  expect(appKitOpened).not.toHaveBeenCalled();
});

describe.each(["BTC", "ETH"] as const)("selecting a connected AppKit %s row in a shared session", (chain) => {
  beforeEach(() => {
    if (chain === "ETH") configureEthereum("WALLET_CONNECT");
  });

  it("uses the guarded disconnect without opening the AppKit modal", async () => {
    await selectChain(chain);

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.disconnect).toHaveBeenCalledWith(chain);
    expect(appKitOpened).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("settles quietly when the disconnect is refused for a shared session", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.disconnect.mockRejectedValue(
      new WalletError({ code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED, message: "shared", chainId: chain }),
    );

    await expect(selectChain(chain)).resolves.toBeUndefined();

    expect(consoleError).not.toHaveBeenCalled();
    expect(appKitOpened).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("logs any other disconnect failure and still settles", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.disconnect.mockRejectedValue(new Error("relay down"));

    await expect(selectChain(chain)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(`Failed to disconnect AppKit ${chain}:`, "relay down");
    expect(appKitOpened).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

it("allows the Ethereum account modal for an independent Auth session", async () => {
  configureEthereum("AUTH");

  await selectChain("ETH");

  expect(harness.disconnect).not.toHaveBeenCalled();
  expect(appKitOpened).toHaveBeenCalledTimes(1);
});

it.each([
  ["ANNOUNCED", true],
  ["WALLET_CONNECT", false],
] as const)(
  "allows the Ethereum account modal for %s with Bitcoin connected=%s",
  async (providerType, btcConnected) => {
    configureEthereum(providerType, btcConnected);

    await selectChain("ETH");

    expect(harness.disconnect).not.toHaveBeenCalled();
    expect(appKitOpened).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  },
);
