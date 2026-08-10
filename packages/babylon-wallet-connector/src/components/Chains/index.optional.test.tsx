import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { IChain } from "@/core/types";

import { Chains } from "./index";

describe("Chains optional-chain copy", () => {
  it("labels visible chains outside the requirement set as optional", () => {
    const chains = [
      { id: "BTC", name: "Bitcoin", icon: "", wallets: [], config: {} },
      { id: "ETH", name: "Ethereum", icon: "", wallets: [], config: {} },
    ] as IChain[];

    render(<Chains chains={chains} requiredChainIds={["ETH"]} />);

    expect(screen.getByText("Select Bitcoin Wallet (Optional)")).toBeTruthy();
    expect(screen.getByText("Select Ethereum Wallet")).toBeTruthy();
  });
});
