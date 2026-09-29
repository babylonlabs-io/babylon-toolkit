import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, it, vi } from "vitest";

import { StateProvider } from "@/context/State.context";
import type { IChain, IWallet } from "@/core/types";
import { useWidgetState } from "@/hooks/useWidgetState";

import { ConnectGuideContainer } from "../container";

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

const OTHER_GUIDED_WALLET: IWallet = {
  ...GUIDED_WALLET,
  id: "other_hardware",
  name: "Other Hardware",
  connectGuide: { steps: ["Open the other app."] },
};

const BTC_CHAIN: IChain = {
  id: "BTC",
  name: "Bitcoin",
  icon: "/btc.svg",
  wallets: [OTHER_GUIDED_WALLET, GUIDED_WALLET],
  config: {},
};

function GuideScreen({ onConnect }: { onConnect: (chain: IChain, wallet: IWallet) => void }) {
  const { displayConnectGuide } = useWidgetState();
  useEffect(() => {
    displayConnectGuide?.("BTC", "ledger_btc_vault");
  }, [displayConnectGuide]);
  return <ConnectGuideContainer onConnect={onConnect} />;
}

it("shows the guide of the wallet the user picked", () => {
  render(
    <StateProvider chains={[BTC_CHAIN]} requiredChainIds={[]}>
      <GuideScreen onConnect={vi.fn()} />
    </StateProvider>,
  );

  expect(screen.getByText("Open the vault app.")).toBeTruthy();
  expect(screen.queryByText("Open the other app.")).toBeNull();
});

it("connects the wallet the user picked when the user selects Connect", () => {
  const onConnect = vi.fn();
  render(
    <StateProvider chains={[BTC_CHAIN]} requiredChainIds={[]}>
      <GuideScreen onConnect={onConnect} />
    </StateProvider>,
  );

  fireEvent.click(screen.getByTestId("connect-guide-connect-button"));

  expect(onConnect).toHaveBeenCalledWith(BTC_CHAIN, GUIDED_WALLET);
});
