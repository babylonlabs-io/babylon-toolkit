import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { type BTCConfig, type IChain, type IWallet, Network } from "@/core/types";

import { Wallets } from "../index";

const UNISAT: IWallet = {
  id: "unisat",
  name: "UniSat",
  icon: "/unisat.svg",
  docs: "https://unisat.io",
  installed: true,
  provider: null,
  account: null,
  label: "",
};

const SIGNET_BTC: IChain = {
  id: "BTC",
  name: "Bitcoin",
  icon: "/btc.svg",
  wallets: [UNISAT],
  config: { network: Network.SIGNET } as BTCConfig,
};

it("breaks the faucet prompt onto its own line", () => {
  render(<Wallets chain={SIGNET_BTC} />);

  const faucetLine = screen.getByText(/Don't have testnet BTC yet\?/).closest("span");

  expect(faucetLine?.classList.contains("block")).toBe(true);
});

it("spaces the wallet rows 8px apart", () => {
  render(<Wallets chain={SIGNET_BTC} />);

  expect(screen.getByTestId("wallet-option-unisat").parentElement?.classList.contains("gap-2")).toBe(true);
});
