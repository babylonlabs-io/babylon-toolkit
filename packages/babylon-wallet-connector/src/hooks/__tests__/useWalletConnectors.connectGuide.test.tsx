import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { HashMap, IChain, IWallet, Network } from "@/core/types";
import { useWalletConnectors } from "@/hooks/useWalletConnectors";

const harness = vi.hoisted(() => ({
  connect: vi.fn(),
  displayConnectGuide: vi.fn(),
}));

vi.mock("@/context/Chain.context", () => ({
  useChainProviders: () => ({
    BTC: {
      id: "BTC",
      config: { network: Network.MAINNET },
      connectedWallet: null,
      connect: harness.connect,
      disconnect: vi.fn(),
      on: () => () => {},
    },
  }),
}));

vi.mock("@/context/LifecycleHooks.context", () => ({
  useLifeCycleHooks: () => ({}),
}));

vi.mock("@/hooks/useWidgetState", () => ({
  useWidgetState: () => ({
    visible: true,
    selectWallet: vi.fn(),
    removeWallet: vi.fn(),
    displayLoader: vi.fn(),
    displayChains: vi.fn(),
    displayConnectGuide: harness.displayConnectGuide,
    displayError: vi.fn(),
    confirm: vi.fn(),
    unconfirm: vi.fn(),
    requiredChainIds: [],
  }),
}));

const accountStorage: HashMap = { get: vi.fn(), set: vi.fn(), has: vi.fn(), delete: vi.fn() };

const BTC_CHAIN: IChain = { id: "BTC", name: "Bitcoin", icon: "/btc.svg", wallets: [], config: {} };

const SOFTWARE_WALLET: IWallet = {
  id: "unisat",
  name: "UniSat",
  icon: "/unisat.svg",
  docs: "",
  installed: true,
  provider: null,
  account: null,
  label: "",
};

const GUIDED_WALLET: IWallet = {
  ...SOFTWARE_WALLET,
  id: "ledger_btc_vault",
  name: "Ledger Vault",
  hardware: true,
  connectGuide: { steps: ["Open the vault app."] },
};

beforeEach(() => {
  harness.connect.mockReset();
  harness.displayConnectGuide.mockReset();
});

it("shows the connect guide instead of connecting a wallet that has one", async () => {
  const { result } = renderHook(() => useWalletConnectors({ persistent: false, accountStorage }));

  await act(() => result.current.chooseWallet(BTC_CHAIN, GUIDED_WALLET));

  expect(harness.displayConnectGuide).toHaveBeenCalledWith("BTC", "ledger_btc_vault");
  expect(harness.connect).not.toHaveBeenCalled();
});

it("connects a wallet with no connect guide at once", async () => {
  const { result } = renderHook(() => useWalletConnectors({ persistent: false, accountStorage }));

  await act(() => result.current.chooseWallet(BTC_CHAIN, SOFTWARE_WALLET));

  expect(harness.connect).toHaveBeenCalledWith("unisat");
  expect(harness.displayConnectGuide).not.toHaveBeenCalled();
});
