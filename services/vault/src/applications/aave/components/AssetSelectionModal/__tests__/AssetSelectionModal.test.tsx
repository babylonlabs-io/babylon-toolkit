/**
 * AssetSelectionModal — full-screen table behavior.
 *
 * Locks in the column logic that differs by mode: borrow lists borrowable
 * reserves with Price + Available + Borrow APR; repay reuses the same surface
 * with only Asset + Price (APR/liquidity don't apply to repaying). Also guards
 * that selecting a row reports the symbol and closes.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { LOAN_TAB } from "../../../constants";
import { AssetSelectionModal } from "../AssetSelectionModal";

vi.mock("@babylonlabs-io/core-ui", () => ({
  FullScreenDialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: ReactNode;
  }) => (open ? <div>{children}</div> : null),
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const borrowableReserves = [
  {
    reserveId: 1n,
    token: { symbol: "USDC", name: "USD Coin", address: "0xusdc", decimals: 6 },
    reserve: { hub: "0xhub", assetId: 1 },
  },
  {
    reserveId: 2n,
    token: {
      symbol: "WBTC",
      name: "Wrapped BTC",
      address: "0xwbtc",
      decimals: 8,
    },
    reserve: { hub: "0xhub", assetId: 2 },
  },
];

vi.mock("../../../context", () => ({
  useAaveConfig: () => ({
    config: { coreSpokeAddress: "0xspoke" },
    borrowableReserves,
  }),
}));

vi.mock("../../../hooks", () => ({
  useAaveReservesPrices: () => ({
    pricesByReserveId: { "1": 1, "2": 88000 },
    isLoading: false,
  }),
  useAaveBorrowAprs: () => ({
    aprPercentByReserveId: { "1": 3.5, "2": 2.2 },
  }),
  useAaveReserveLiquidity: () => ({
    liquidityByReserveId: {
      // Below 1,000 → shown in full.
      "1": { availableLiquidity: 500.25, utilizationBps: 2500 },
      // Large figure → compact K/M/B notation.
      "2": { availableLiquidity: 1234567, utilizationBps: 6000 },
    },
  }),
}));

vi.mock("@/services/token/tokenService", () => ({
  getCurrencyIconWithFallback: () => "icon.png",
  getTokenByAddress: () => ({ icon: "icon.png" }),
}));

describe("AssetSelectionModal", () => {
  it("renders the full borrow table with live price and borrow APR per reserve", () => {
    render(
      <AssetSelectionModal
        isOpen
        onClose={vi.fn()}
        onSelectAsset={vi.fn()}
        mode={LOAN_TAB.BORROW}
      />,
    );

    expect(screen.getByText("Select asset")).toBeInTheDocument();
    // Borrow-only columns are present.
    expect(screen.getByText("Borrow APR")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    // Live data: a reserve row with its real (formatted) borrow APR.
    expect(screen.getByText("USD Coin")).toBeInTheDocument();
    expect(screen.getByText("3.5%")).toBeInTheDocument();
    expect(screen.getByText("2.2%")).toBeInTheDocument();
    // Available liquidity renders with the asset symbol: small amounts in full,
    // large amounts in compact K/M/B notation.
    expect(screen.getByText("500.25 USDC")).toBeInTheDocument();
    expect(screen.getByText("1.23M WBTC")).toBeInTheDocument();
  });

  it("hides the Available and Borrow APR columns in repay mode", () => {
    render(
      <AssetSelectionModal
        isOpen
        onClose={vi.fn()}
        onSelectAsset={vi.fn()}
        mode={LOAN_TAB.REPAY}
        assets={[{ symbol: "USDC", name: "USD Coin", icon: "i", priceUsd: 1 }]}
      />,
    );

    expect(screen.getByText("Select asset")).toBeInTheDocument();
    expect(screen.getByText("USD Coin")).toBeInTheDocument();
    expect(screen.queryByText("Borrow APR")).not.toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("reports the selected symbol and closes when a row is clicked", () => {
    const onSelectAsset = vi.fn();
    const onClose = vi.fn();
    render(
      <AssetSelectionModal
        isOpen
        onClose={onClose}
        onSelectAsset={onSelectAsset}
        mode={LOAN_TAB.BORROW}
      />,
    );

    screen.getByText("Wrapped BTC").click();

    expect(onSelectAsset).toHaveBeenCalledWith("WBTC");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
