import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import type { IChain } from "@/core/types";

import { Chains } from "../index";

const BTC_CHAIN: IChain = { id: "BTC", name: "Bitcoin", icon: "", wallets: [], config: {} };
const ETH_CHAIN: IChain = { id: "ETH", name: "Ethereum", icon: "", wallets: [], config: {} };

it("marks a chain outside the required set as optional without changing its title", () => {
  render(<Chains chains={[BTC_CHAIN, ETH_CHAIN]} requiredChainIds={["ETH"]} />);

  const bitcoinRow = screen.getByTestId("select-bitcoin-wallet-button");
  expect(bitcoinRow.getAttribute("data-optional")).toBe("true");
  expect(bitcoinRow.textContent).not.toContain("Optional");
  expect(screen.getByTestId("select-ethereum-wallet-button").getAttribute("data-optional")).toBe("false");
});

it("shows each chain's description in its row", () => {
  render(
    <Chains
      chains={[BTC_CHAIN, ETH_CHAIN]}
      chainDescriptions={{
        BTC: "Used to deposit and manage your Bitcoin collateral.",
        ETH: "Used to manage your positions, transactions, and account activity.",
      }}
    />,
  );

  expect(screen.getByTestId("select-bitcoin-wallet-button").textContent).toContain(
    "Used to deposit and manage your Bitcoin collateral.",
  );
  expect(screen.getByTestId("select-ethereum-wallet-button").textContent).toContain(
    "Used to manage your positions, transactions, and account activity.",
  );
});
