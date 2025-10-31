/**
 * Market Detail Page
 *
 * Handles both:
 * 1. Browse markets and open new positions (when user has no position)
 * 2. Manage existing positions (when user has a position for this market)
 *
 * The page automatically detects if the user has a position for this market.
 */

import { useNavigate, useSearchParams } from "react-router";

import { useLtvCalculations } from "../../../hooks/useLtvCalculations";
import { LoanCard } from "../../shared/LoanCard";
import { BorrowReviewModal } from "../../shared/LoanCard/Borrow/ReviewModal";
import { BorrowSuccessModal } from "../../shared/LoanCard/Borrow/SuccessModal";
import { RepayReviewModal } from "../../shared/LoanCard/Repay/ReviewModal";
import { RepaySuccessModal } from "../../shared/LoanCard/Repay/SuccessModal";
import { MarketInfo } from "../Info";

import { useMarketDetail } from "./hooks/useMarketDetail";
import { useMarketDetailModals } from "./hooks/useMarketDetailModals";
import { useTransactionHandlers } from "./hooks/useTransactionHandlers";

export function MarketDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Fetch market data and user's position (if exists)
  const {
    isMarketLoading,
    marketError,
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    maxCollateral,
    maxBorrow,
    marketAttributes,
    positionData,
    userPosition,
    marketDisplayValues,
    refetch,
  } = useMarketDetail();

  // Check if user has a position for this market
  const hasPosition = !!userPosition;

  // Default tab based on whether user has a position:
  // - Has position → default to "repay"
  // - No position → default to "borrow"
  const defaultTab =
    searchParams.get("tab") || (hasPosition ? "repay" : "borrow");

  // Modal state management
  const {
    showBorrowReviewModal,
    showBorrowSuccessModal,
    lastBorrowData,
    openBorrowReview,
    closeBorrowReview,
    showBorrowSuccess,
    closeBorrowSuccess,
    showRepayReviewModal,
    showRepaySuccessModal,
    lastRepayData,
    openRepayReview,
    closeRepayReview,
    showRepaySuccess,
    closeRepaySuccess,
    processing,
    setProcessing,
  } = useMarketDetailModals();

  // Transaction handlers
  const { handleConfirmBorrow, handleConfirmRepay } = useTransactionHandlers({
    hasPosition,
    userPosition,
    currentLoanAmount,
    refetch,
    onBorrowSuccess: showBorrowSuccess,
    onRepaySuccess: showRepaySuccess,
    setProcessing,
  });

  // LTV calculations
  const { borrowLtv, repayLtv } = useLtvCalculations({
    borrowData: lastBorrowData,
    repayData: lastRepayData,
    btcPrice,
    currentLoanAmount,
    currentCollateralAmount,
  });

  const handleBack = () => navigate("/");

  // Show loading state
  if (isMarketLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-sm text-accent-secondary">
          Loading market data...
        </div>
      </div>
    );
  }

  // Show error state
  if (marketError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-sm text-accent-secondary">
          Market not found
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-6">
      <div className="grid grid-cols-2 items-start gap-6">
        {/* Left Side: Market Info */}
        <MarketInfo
          onBack={handleBack}
          marketPair="BTC / USDC"
          btcIcon="/images/btc.png"
          usdcIcon="/images/usdc.png"
          totalMarketSize={marketDisplayValues.totalMarketSize}
          totalMarketSizeSubtitle={marketDisplayValues.totalMarketSizeSubtitle}
          totalLiquidity={marketDisplayValues.totalLiquidity}
          totalLiquiditySubtitle={marketDisplayValues.totalLiquiditySubtitle}
          borrowRate={marketDisplayValues.borrowRate}
          attributes={marketAttributes}
          positions={positionData}
        />

        {/* Right Side: Loan Card */}
        <div className="top-24">
          <LoanCard
            defaultTab={defaultTab}
            maxCollateral={maxCollateral}
            maxBorrow={maxBorrow}
            btcPrice={btcPrice}
            liquidationLtv={liquidationLtv}
            onBorrow={openBorrowReview}
            currentLoanAmount={currentLoanAmount}
            currentCollateralAmount={currentCollateralAmount}
            onRepay={openRepayReview}
          />
        </div>
      </div>

      {/* Borrow Modals */}
      <BorrowReviewModal
        open={showBorrowReviewModal}
        onClose={closeBorrowReview}
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
        onClose={closeBorrowSuccess}
        borrowAmount={lastBorrowData.borrow}
        borrowSymbol="USDC"
      />

      {/* Repay Modals */}
      <RepayReviewModal
        open={showRepayReviewModal}
        onClose={closeRepayReview}
        onConfirm={() =>
          handleConfirmRepay(lastRepayData.repay, lastRepayData.withdraw)
        }
        repayAmount={lastRepayData.repay}
        repaySymbol="USDC"
        repayUsdValue={`$${lastRepayData.repay.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USDC`}
        withdrawAmount={lastRepayData.withdraw}
        withdrawSymbol="BTC"
        withdrawUsdValue={`$${(
          lastRepayData.withdraw * btcPrice
        ).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USD`}
        ltv={repayLtv}
        liquidationLtv={liquidationLtv}
        processing={processing}
      />

      <RepaySuccessModal
        open={showRepaySuccessModal}
        onClose={closeRepaySuccess}
        repayAmount={lastRepayData.repay}
        withdrawAmount={lastRepayData.withdraw}
        repaySymbol="USDC"
        withdrawSymbol="BTC"
      />
    </div>
  );
}
