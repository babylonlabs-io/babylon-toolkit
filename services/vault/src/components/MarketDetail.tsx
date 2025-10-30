import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { BorrowReviewModal } from "./BorrowReviewModal";
import { BorrowSuccessModal } from "./BorrowSuccessModal";
import { LoanCard } from "./LoanCard";
import { MarketInfo } from "./MarketInfo";

export function MarketDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "borrow"; // Default to borrow for new positions

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showBorrowSuccessModal, setShowBorrowSuccessModal] = useState(false);

  // Store last borrow values for modals
  const [lastBorrowData, setLastBorrowData] = useState({
    collateral: 0,
    borrow: 0,
  });

  const handleBack = () => {
    navigate("/");
  };

  // Hardcoded market data (for new positions)
  // TODO: Fetch real market data based on marketId from route params
  const maxCollateral = 10.0; // Available vaults user can use as collateral
  const maxBorrow = 100000; // Market liquidity available for borrowing
  const btcPrice = 112694.16;
  const liquidationLtv = 70;

  // For new positions, there's no existing debt or collateral
  const currentLoanAmount = 0;
  const currentCollateralAmount = 0;

  const marketAttributes = [
    { label: "Collateral", value: "BTC" },
    { label: "Loan", value: "USDC" },
    { label: "Liquidation LTV", value: "70%" },
    {
      label: "Oracle price",
      value: `BTC / USDC = ${btcPrice.toLocaleString()}`,
    },
    { label: "Created on", value: "2025-10-14" },
    { label: "Utilization", value: "90.58%" },
  ];

  const handleBorrow = (collateralAmount: number, borrowAmount: number) => {
    setLastBorrowData({ collateral: collateralAmount, borrow: borrowAmount });
    setShowReviewModal(true);
  };

  const handleConfirmBorrow = async () => {
    setProcessing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setShowReviewModal(false);
      setShowBorrowSuccessModal(true);
    } catch {
      // Handle error silently
    } finally {
      setProcessing(false);
    }
  };

  // Calculate LTV for borrow modal
  const borrowLtv =
    lastBorrowData.collateral === 0
      ? 0
      : (lastBorrowData.borrow / (lastBorrowData.collateral * btcPrice)) * 100;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-6">
      <div className="grid grid-cols-2 items-start gap-6">
        {/* Left Side: Market Info */}
        <MarketInfo
          onBack={handleBack}
          marketPair="BTC / USDC"
          btcIcon="/images/btc.png"
          usdcIcon="/images/usdc.png"
          totalMarketSize="$525.40M"
          totalMarketSizeSubtitle="525.40M USDC"
          totalLiquidity="$182.60M"
          totalLiquiditySubtitle="182.6M USDC"
          borrowRate="6.25%"
          attributes={marketAttributes}
        />

        {/* Right Side: Loan Card (Borrow only for new positions) */}
        <div className="top-24">
          <LoanCard
            defaultTab={defaultTab}
            maxCollateral={maxCollateral}
            maxBorrow={maxBorrow}
            btcPrice={btcPrice}
            liquidationLtv={liquidationLtv}
            onBorrow={handleBorrow}
            currentLoanAmount={currentLoanAmount}
            currentCollateralAmount={currentCollateralAmount}
          />
        </div>
      </div>

      {/* Borrow Modals */}
      <BorrowReviewModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onConfirm={handleConfirmBorrow}
        collateralAmount={lastBorrowData.collateral}
        collateralSymbol="BTC"
        collateralUsdValue={`$${(
          lastBorrowData.collateral * btcPrice
        ).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USD`}
        borrowAmount={lastBorrowData.borrow}
        borrowSymbol="USDC"
        borrowUsdValue={`$${lastBorrowData.borrow.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USD`}
        borrowApy={6.25}
        ltv={borrowLtv}
        liquidationLtv={liquidationLtv}
        processing={processing}
      />

      <BorrowSuccessModal
        open={showBorrowSuccessModal}
        onClose={() => setShowBorrowSuccessModal(false)}
        borrowAmount={lastBorrowData.borrow}
        borrowSymbol="USDC"
      />
    </div>
  );
}
