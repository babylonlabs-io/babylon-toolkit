/**
 * AssetSelectionPanel — the column logic that differs by mode, and that Market
 * Info routes to the markets data page instead of selecting the asset.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOAN_TAB } from "../../../constants";
import { AssetSelectionPanel } from "../AssetSelectionPanel";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

// The markets data route is v3-only and carries its own flag, so Market Info
// only renders when both are on.
const featureFlagsState = vi.hoisted(() => ({
  isV3UiEnabled: true,
  isMarketDetailPageEnabled: true,
}));

vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsState,
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

// Frozen reserve: carries debt so it stays repayable, but is no longer
// borrowable, so it appears only in allBorrowReserves.
const frozenReserve = {
  reserveId: 3n,
  token: { symbol: "DAI", name: "Dai", address: "0xdai", decimals: 18 },
  reserve: { hub: "0xhub", assetId: 3 },
};

vi.mock("../../../context", () => ({
  useAaveConfig: () => ({
    config: { coreSpokeAddress: "0xspoke" },
    borrowableReserves,
    allBorrowReserves: [...borrowableReserves, frozenReserve],
  }),
}));

vi.mock("../../../hooks", () => ({
  useAaveReservesPrices: ({ reserveIds }: { reserveIds: bigint[] }) => ({
    pricesByReserveId: Object.fromEntries(
      reserveIds.map((id) => [
        id.toString(),
        { "1": 1, "2": 88000, "3": 0.99 }[id.toString()],
      ]),
    ),
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

function LocationDisplay() {
  const { pathname } = useLocation();
  return <div data-testid="location">{pathname}</div>;
}

function renderPanel(ui: ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/loans"]}>
      {ui}
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("AssetSelectionPanel", () => {
  beforeEach(() => {
    featureFlagsState.isV3UiEnabled = true;
    featureFlagsState.isMarketDetailPageEnabled = true;
  });

  it("renders the full borrow table with live price and borrow APR per reserve", () => {
    renderPanel(
      <AssetSelectionPanel onSelectAsset={vi.fn()} mode={LOAN_TAB.BORROW} />,
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
    renderPanel(
      <AssetSelectionPanel
        onSelectAsset={vi.fn()}
        mode={LOAN_TAB.REPAY}
        assets={[
          {
            reserveId: 1n,
            symbol: "USDC",
            name: "USD Coin",
            icon: "i",
            priceUsd: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText("Select asset")).toBeInTheDocument();
    expect(screen.getByText("USD Coin")).toBeInTheDocument();
    expect(screen.queryByText("Borrow APR")).not.toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("omits the Market Info button in repay mode, which has no market data", () => {
    renderPanel(
      <AssetSelectionPanel
        onSelectAsset={vi.fn()}
        mode={LOAN_TAB.REPAY}
        assets={[
          {
            reserveId: 1n,
            symbol: "USDC",
            name: "USD Coin",
            icon: "i",
            priceUsd: 1,
          },
        ]}
      />,
    );

    expect(screen.queryByText("Market Info")).not.toBeInTheDocument();
  });

  it("omits the Market Info button when the market detail flag is off", () => {
    featureFlagsState.isMarketDetailPageEnabled = false;

    renderPanel(
      <AssetSelectionPanel onSelectAsset={vi.fn()} mode={LOAN_TAB.BORROW} />,
    );

    expect(screen.getByText("USD Coin")).toBeInTheDocument();
    expect(screen.queryByText("Market Info")).not.toBeInTheDocument();
  });

  it("reports the selected symbol when a row is clicked", () => {
    const onSelectAsset = vi.fn();
    renderPanel(
      <AssetSelectionPanel
        onSelectAsset={onSelectAsset}
        mode={LOAN_TAB.BORROW}
      />,
    );

    screen.getByText("Wrapped BTC").click();

    expect(onSelectAsset).toHaveBeenCalledWith(2n);
  });

  it("routes to the asset's markets data page when Market Info is clicked", () => {
    const onSelectAsset = vi.fn();
    renderPanel(
      <AssetSelectionPanel
        onSelectAsset={onSelectAsset}
        mode={LOAN_TAB.BORROW}
      />,
    );

    fireEvent.click(screen.getByTestId("asset-market-info-wbtc"));

    expect(screen.getByTestId("location")).toHaveTextContent("/markets/2");
    expect(onSelectAsset).not.toHaveBeenCalled();
  });

  it("prices a repay row whose reserve is frozen and no longer borrowable", () => {
    renderPanel(
      <AssetSelectionPanel
        onSelectAsset={vi.fn()}
        mode={LOAN_TAB.REPAY}
        assets={[{ reserveId: 3n, symbol: "DAI", name: "Dai", icon: "i" }]}
      />,
    );

    expect(screen.getByText("$0.99")).toBeInTheDocument();
  });

  it("holds the loading state while repay assets are still resolving", () => {
    renderPanel(
      <AssetSelectionPanel
        onSelectAsset={vi.fn()}
        mode={LOAN_TAB.REPAY}
        assets={[]}
        assetsLoading
      />,
    );

    // A cold load of the repay picker must not claim the user has no debt.
    expect(screen.getByText("Loading assets...")).toBeInTheDocument();
    expect(screen.queryByText("No assets available")).not.toBeInTheDocument();
  });
});
