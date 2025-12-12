/**
 * Aave Market Detail Page (UI-only)
 *
 * Borrow card layout.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { BackButton } from "@/components/shared";

import {
  MarketDetailProvider,
  type MarketDetailContextValue,
} from "../context/MarketDetailContext";
import { LoanCard } from "../LoanCard";

// TODO: Replace with actual assets from a registry
const ASSET_CONFIG: Record<
  string,
  { name: string; symbol: string; icon: string }
> = {
  usdc: {
    name: "USD Coin",
    symbol: "USDC",
    icon: "/images/usdc.png",
  },
  usdt: {
    name: "Tether",
    symbol: "USDT",
    icon: "/images/usdt.png",
  },
  wbtc: {
    name: "Wrapped BTC",
    symbol: "WBTC",
    icon: "/images/wbtc.png",
  },
};

// Static market data for UI-only rendering
const staticMarketData: Partial<MarketDetailContextValue> = {
  btcPrice: 86694.16,
  liquidationLtv: 75,
  currentLoanAmount: 1000, // Show repay tab with existing position
  currentCollateralAmount: 0.02, // 0.02 BTC collateral
  availableLiquidity: 500_000,
  borrowableVaults: [{ amountSatoshis: 5_000_000n }], // 0.05 BTC
};

export function AaveMarketDetail() {
  const navigate = useNavigate();
  const { marketId } = useParams<{ marketId: string }>();
  const [borrowedAmount, setBorrowedAmount] = useState(0);

  // Get asset config from URL param
  const assetKey = marketId?.toLowerCase() || "usdc";
  const assetConfig = ASSET_CONFIG[assetKey] || ASSET_CONFIG.usdc;

  // Stub handlers for UI-only mode
  const handleBorrow = (collateralAmount: number, borrowAmount: number) => {
    void collateralAmount;
    setBorrowedAmount(borrowAmount);
  };

  const handleRepay = (
    repayAmount: number,
    withdrawCollateralAmount: number,
  ) => {
    // TODO: wire to Aave repay transaction flow
    void repayAmount;
    void withdrawCollateralAmount;
  };

  const handleBack = () => navigate("/app/aave");

  const handleViewLoan = () => {
    // Navigate back to dashboard with borrowedAssets state
    navigate("/app/aave", {
      state: {
        borrowedAssets: [
          {
            symbol: assetConfig.symbol,
            icon: assetConfig.icon,
            amount: String(borrowedAmount),
          },
        ],
      },
    });
  };

  return (
    <MarketDetailProvider value={staticMarketData}>
      <Container className="pb-6">
        <div className="space-y-6">
          {/* Back Button */}
          <BackButton label="Aave" onClick={handleBack} />

          {/* Loan Card - Full width like other cards */}
          <LoanCard
            defaultTab="borrow"
            onBorrow={handleBorrow}
            onRepay={handleRepay}
            onViewLoan={handleViewLoan}
          />
        </div>
      </Container>
    </MarketDetailProvider>
  );
}
