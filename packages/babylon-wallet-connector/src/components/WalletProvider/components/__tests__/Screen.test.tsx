import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, it, vi } from "vitest";

import { StateProvider } from "@/context/State.context";
import type { IChain, IWallet } from "@/core/types";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Screen } from "../Screen";

const GUIDED_WALLET: IWallet = {
  id: "ledger_btc_vault",
  name: "Ledger Vault",
  icon: "/ledger.svg",
  docs: "",
  installed: true,
  provider: null,
  account: null,
  label: "",
  connectGuide: { steps: ["Open the vault app."] },
};

const BTC_CHAIN: IChain = { id: "BTC", name: "Bitcoin", icon: "/btc.svg", wallets: [GUIDED_WALLET], config: {} };

type WalletHandler = (chain: IChain, wallet: IWallet) => void;

interface HandlerProps {
  onSelectWallet: WalletHandler;
  onConnectWallet: WalletHandler;
}

function WalletsScreen({ onSelectWallet, onConnectWallet }: HandlerProps) {
  const { screen: current, displayWallets } = useWidgetState();
  useEffect(() => {
    displayWallets?.("BTC");
  }, [displayWallets]);
  return <Screen current={current} onSelectWallet={onSelectWallet} onConnectWallet={onConnectWallet} />;
}

function GuideScreen({ onSelectWallet, onConnectWallet }: HandlerProps) {
  const { screen: current, displayConnectGuide } = useWidgetState();
  useEffect(() => {
    displayConnectGuide?.("BTC", "ledger_btc_vault");
  }, [displayConnectGuide]);
  return <Screen current={current} onSelectWallet={onSelectWallet} onConnectWallet={onConnectWallet} />;
}

it("calls onSelectWallet, not onConnectWallet, when a wallet is picked from the list", () => {
  const onSelectWallet = vi.fn();
  const onConnectWallet = vi.fn();
  render(
    <StateProvider chains={[BTC_CHAIN]} requiredChainIds={[]}>
      <WalletsScreen onSelectWallet={onSelectWallet} onConnectWallet={onConnectWallet} />
    </StateProvider>,
  );

  fireEvent.click(screen.getByTestId("wallet-option-ledger-vault"));

  expect(onSelectWallet).toHaveBeenCalledWith(BTC_CHAIN, GUIDED_WALLET);
  expect(onConnectWallet).not.toHaveBeenCalled();
});

it("calls onConnectWallet, not onSelectWallet, when Connect is selected on the guide", () => {
  const onSelectWallet = vi.fn();
  const onConnectWallet = vi.fn();
  render(
    <StateProvider chains={[BTC_CHAIN]} requiredChainIds={[]}>
      <GuideScreen onSelectWallet={onSelectWallet} onConnectWallet={onConnectWallet} />
    </StateProvider>,
  );

  fireEvent.click(screen.getByTestId("connect-guide-connect-button"));

  expect(onConnectWallet).toHaveBeenCalledWith(BTC_CHAIN, GUIDED_WALLET);
  expect(onSelectWallet).not.toHaveBeenCalled();
});
