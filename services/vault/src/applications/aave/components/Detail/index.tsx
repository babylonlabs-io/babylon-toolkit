/**
 * Aave Market Detail Page (UI-only)
 *
 * This is a UI-only duplicate of the Morpho detail page structure
 * with static placeholder data. Transaction flows are stubbed.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import {
  MarketDetailProvider,
  type MarketDetailContextValue,
} from "../context/MarketDetailContext";
import { MarketInfo } from "../Info";
import { LoanCard } from "../LoanCard";

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

  // Stub handlers for UI-only mode
  const handleBorrow = (collateralAmount: number, borrowAmount: number) => {
    // TODO: wire to Aave borrow transaction flow
    void collateralAmount;
    void borrowAmount;
  };

  const handleRepay = (
    repayAmount: number,
    withdrawCollateralAmount: number,
  ) => {
    // TODO: wire to Aave repay transaction flow
    void repayAmount;
    void withdrawCollateralAmount;
  };

  const handleBack = () => navigate("/");

  // Get token pair from context (using default values)
  const tokenPair = {
    pairName: "BTC/USDC",
    collateral: {
      name: "Bitcoin",
      symbol: "BTC",
      icon: "/images/btc.png",
    },
    loan: {
      name: "USD Coin",
      symbol: "USDC",
      icon: "/images/usdc.png",
    },
  };

  return (
    <MarketDetailProvider value={staticMarketData}>
      <Container className="pb-6">
        <div className="grid grid-cols-2 items-start gap-6 max-lg:grid-cols-1">
          {/* Left Side: Market Info */}
          <MarketInfo
            onBack={handleBack}
            marketPair={tokenPair.loan.symbol}
            usdcIcon={tokenPair.loan.icon}
            loanSymbol={tokenPair.loan.symbol}
            priceDisplay={{
              value: "$1.00",
              label: "Price",
            }}
          />

          {/* Right Side: Loan Card */}
          <div className="top-24">
            <LoanCard
              defaultTab="borrow"
              onBorrow={handleBorrow}
              onRepay={handleRepay}
            />
          </div>
        </div>
      </Container>
    </MarketDetailProvider>
  );
}
