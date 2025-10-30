import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useMarketDetail } from "../hooks/useMarketDetail";

import { BorrowReviewModal } from "./BorrowReviewModal";
import { BorrowSuccessModal } from "./BorrowSuccessModal";
import { LoanCard } from "./LoanCard";
import { MarketInfo } from "./MarketInfo";
import { RepayReviewModal } from "./RepayReviewModal";
import { RepaySuccessModal } from "./RepaySuccessModal";

export function MarketDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "borrow";

  const {
    isMarketLoading,
    marketError,
    marketData,
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    marketAttributes,
    positionData,
    maxCollateral,
    maxBorrow,
  } = useMarketDetail();

  // UI state and handlers kept in component
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showRepayReviewModal, setShowRepayReviewModal] = useState(false);
  const [showBorrowSuccessModal, setShowBorrowSuccessModal] = useState(false);
  const [showRepaySuccessModal, setShowRepaySuccessModal] = useState(false);

  const [lastBorrowData, setLastBorrowData] = useState({
    collateral: 0,
    borrow: 0,
  });
  const [lastRepayData, setLastRepayData] = useState({
    repay: 0,
    withdraw: 0,
  });

  const handleBack = () => navigate("/");

  const handleBorrow = (collateralAmount: number, borrowAmount: number) => {
    setLastBorrowData({ collateral: collateralAmount, borrow: borrowAmount });
    setShowReviewModal(true);
  };

  const handleRepay = (
    repayAmount: number,
    withdrawCollateralAmount: number,
  ) => {
    setLastRepayData({
      repay: repayAmount,
      withdraw: withdrawCollateralAmount,
    });
    setShowRepayReviewModal(true);
  };

  const handleConfirmBorrow = async () => {
    setProcessing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setShowReviewModal(false);
      setShowBorrowSuccessModal(true);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmRepay = async () => {
    setProcessing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setShowRepayReviewModal(false);
      setShowRepaySuccessModal(true);
    } finally {
      setProcessing(false);
    }
  };

  const borrowLtv = useMemo(() => {
    return lastBorrowData.collateral === 0
      ? 0
      : (lastBorrowData.borrow / (lastBorrowData.collateral * btcPrice)) * 100;
  }, [lastBorrowData.borrow, lastBorrowData.collateral, btcPrice]);

  const repayLtv = useMemo(() => {
    const remainingCollateral =
      currentCollateralAmount - lastRepayData.withdraw;
    if (remainingCollateral === 0) return 0;
    const remainingLoan = currentLoanAmount - lastRepayData.repay;
    return (remainingLoan / (remainingCollateral * btcPrice)) * 100;
  }, [
    currentCollateralAmount,
    lastRepayData.withdraw,
    currentLoanAmount,
    lastRepayData.repay,
    btcPrice,
  ]);

  if (isMarketLoading) return null;
  if (marketError) return null;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-6">
      <div className="grid grid-cols-2 items-start gap-6">
        {/* Left Side: Market Info */}
        <MarketInfo
          onBack={handleBack}
          marketPair="BTC / USDC"
          btcIcon="/images/btc.png"
          usdcIcon="/images/usdc.png"
          totalMarketSize={
            marketData
              ? `$${(Number(marketData.totalSupplyAssets) / 1e12).toFixed(2)}M`
              : "?"
          }
          totalMarketSizeSubtitle={
            marketData
              ? `${(Number(marketData.totalSupplyAssets) / 1e12).toFixed(2)}M USDC`
              : "?"
          }
          totalLiquidity={
            marketData
              ? `$${(Number(marketData.totalBorrowAssets) / 1e12).toFixed(2)}M`
              : "?"
          }
          totalLiquiditySubtitle={
            marketData
              ? `${(Number(marketData.totalBorrowAssets) / 1e12).toFixed(2)}M USDC`
              : "?"
          }
          borrowRate="?"
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
            onBorrow={handleBorrow}
            currentLoanAmount={currentLoanAmount}
            currentCollateralAmount={currentCollateralAmount}
            onRepay={handleRepay}
          />
        </div>
      </div>

      {/* Modals remain in parent for state management */}
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

      <RepayReviewModal
        open={showRepayReviewModal}
        onClose={() => setShowRepayReviewModal(false)}
        onConfirm={handleConfirmRepay}
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

      <BorrowSuccessModal
        open={showBorrowSuccessModal}
        onClose={() => setShowBorrowSuccessModal(false)}
        borrowAmount={lastBorrowData.borrow}
        borrowSymbol="USDC"
      />

      <RepaySuccessModal
        open={showRepaySuccessModal}
        onClose={() => setShowRepaySuccessModal(false)}
        repayAmount={lastRepayData.repay}
        withdrawAmount={lastRepayData.withdraw}
        repaySymbol="USDC"
        withdrawSymbol="BTC"
      />
    </div>
  );
}
