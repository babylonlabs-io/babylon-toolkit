/**
 * RepaySelectionPanel — the repay picker names each debt's hub and amount, so
 * two debts in one token stay distinguishable, and routes by reserve id.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BorrowedAsset } from "../../../hooks/useAaveBorrowedAssets";
import { RepaySelectionPanel } from "../RepaySelectionPanel";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
  Hint: () => null,
}));

const babylonUsdcDebt: BorrowedAsset = {
  reserveId: "0",
  symbol: "USDC",
  name: "USD Coin",
  hub: {
    source: "registry",
    address: "0xb3283508a0E96F80CF79DC2a1135F10dA170138D",
    label: "Babylon Hub",
  },
  amount: "5,000",
  icon: "usdc.svg",
};

const coreUsdcDebt: BorrowedAsset = {
  ...babylonUsdcDebt,
  reserveId: "4",
  hub: {
    source: "registry",
    address: "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca",
    label: "Core Hub",
  },
  amount: "1,250",
};

describe("RepaySelectionPanel", () => {
  it("lists each debt with its amount and hub", () => {
    render(
      <RepaySelectionPanel
        assets={[babylonUsdcDebt, coreUsdcDebt]}
        assetsLoading={false}
        onSelectReserve={vi.fn()}
      />,
    );

    expect(screen.getByTestId("repay-option-0")).toHaveTextContent(
      "USDC on Babylon Hub",
    );
    expect(screen.getByTestId("repay-option-0")).toHaveTextContent(
      "5,000 USDC",
    );
    expect(screen.getByTestId("repay-option-4")).toHaveTextContent(
      "USDC on Core Hub",
    );
    expect(screen.getByTestId("repay-option-4")).toHaveTextContent(
      "1,250 USDC",
    );
  });

  it("routes by reserve id when two debts share a token", () => {
    const onSelectReserve = vi.fn();
    render(
      <RepaySelectionPanel
        assets={[babylonUsdcDebt, coreUsdcDebt]}
        assetsLoading={false}
        onSelectReserve={onSelectReserve}
      />,
    );

    fireEvent.click(screen.getByTestId("repay-option-4"));

    expect(onSelectReserve).toHaveBeenCalledWith(4n);
  });

  it("holds the loading state while repay assets are still resolving", () => {
    render(
      <RepaySelectionPanel
        assets={[]}
        assetsLoading
        onSelectReserve={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading assets...")).toBeInTheDocument();
    expect(screen.queryByText("No assets available")).not.toBeInTheDocument();
  });

  it("disables a god-mode demo debt whose id resolves to no reserve", () => {
    render(
      <RepaySelectionPanel
        assets={[{ ...babylonUsdcDebt, reserveId: "demo-reserve-1" }]}
        assetsLoading={false}
        onSelectReserve={vi.fn()}
      />,
    );

    expect(screen.getByTestId("repay-option-demo-reserve-1")).toBeDisabled();
  });
});
