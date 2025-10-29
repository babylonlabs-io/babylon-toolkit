import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { BorrowReviewModal } from "./BorrowReviewModal";
import { BorrowSuccessModal } from "./BorrowSuccessModal";
import { LoanCard } from "./LoanCard";
import { MarketInfo } from "./MarketInfo";
import { RepayReviewModal } from "./RepayReviewModal";
import { RepaySuccessModal } from "./RepaySuccessModal";
import { Morpho } from "../clients/eth-contract";
import type { MorphoMarketSummary } from "../clients/eth-contract";

export function MarketDetail() {
  const navigate = useNavigate();
  const { marketId } = useParams<{ marketId: string }>();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "borrow";

  // Fetch market data using Morpho client contract calls directly
  const {
    data: marketData,
    isLoading: isMarketLoading,
    error: marketError
  } = useQuery<MorphoMarketSummary>({
    queryKey: ["marketData", marketId],
    queryFn: () => Morpho.getMarketWithData(marketId!),
    enabled: !!marketId,
    retry: 2,
    staleTime: 30000, // 30 seconds
  });

  // Log the marketId and data for debugging
  console.log("MarketDetail - marketId:", marketId);
  console.log("MarketDetail - marketData:", marketData);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showRepayReviewModal, setShowRepayReviewModal] = useState(false);
  const [showBorrowSuccessModal, setShowBorrowSuccessModal] = useState(false);
  const [showRepaySuccessModal, setShowRepaySuccessModal] = useState(false);

  // Store last borrow/repay values for modals
  const [lastBorrowData, setLastBorrowData] = useState({
    collateral: 0,
    borrow: 0,
  });
  const [lastRepayData, setLastRepayData] = useState({ repay: 0, withdraw: 0 });

  const handleBack = () => {
    navigate("/vault");
  };

  // Helper function to format bigint values to USDC (6 decimals)
  const formatUSDC = (value: bigint) => {
    return Number(value) / 1e6;
  };

  // Helper function to format bigint values to BTC (8 decimals)
  // Note: Currently unused but available for future BTC-related calculations
  const formatBTC = (value: bigint) => {
    return Number(value) / 1e8;
  };

  // Dynamic data from market service (with fallbacks)
  const maxCollateral = 10.0; // This would come from user's BTC balance
  const maxBorrow = marketData ? formatUSDC(marketData.totalSupplyAssets) : 100000;
  const btcPrice = 112694.16; // This would come from oracle price feed
  const liquidationLtv = marketData ? marketData.lltvPercent : 70;
  const currentLoanAmount = 788859; // This would come from user's position
  const currentCollateralAmount = 10.0; // This would come from user's position

  const marketAttributes = [
    { label: "Market ID", value: marketId || "Unknown" },
    { label: "Collateral", value: "BTC" },
    { label: "Loan", value: "USDC" },
    {
      label: "Liquidation LTV",
      value: marketData ? `${marketData.lltvPercent.toFixed(1)}%` : "70%"
    },
    {
      label: "Oracle price",
      value: `BTC / USDC = ${btcPrice.toLocaleString()}`,
    },
    { label: "Created on", value: "2025-10-14" },
    {
      label: "Utilization",
      value: marketData ? `${marketData.utilizationPercent.toFixed(2)}%` : "90.58%"
    },
  ];

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
    } catch {
      // Handle error silently
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
    } catch {
      // Handle error silently
    } finally {
      setProcessing(false);
    }
  };

  // Calculate LTV for modals
  const borrowLtv =
    lastBorrowData.collateral === 0
      ? 0
      : (lastBorrowData.borrow / (lastBorrowData.collateral * btcPrice)) * 100;

  const repayLtv = (() => {
    const remainingCollateral =
      currentCollateralAmount - lastRepayData.withdraw;
    if (remainingCollateral === 0) return 0;
    const remainingLoan = currentLoanAmount - lastRepayData.repay;
    return (remainingLoan / (remainingCollateral * btcPrice)) * 100;
  })();

  // Loading state
  if (isMarketLoading) {
    return "Loading...";
  }

  if (marketError) {
    return null;
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
          totalMarketSize={marketData ? `$${(formatUSDC(marketData.totalSupplyAssets) / 1e6).toFixed(2)}M` : "$525.40M"}
          totalMarketSizeSubtitle={marketData ? `${(formatUSDC(marketData.totalSupplyAssets) / 1e6).toFixed(2)}M USDC` : "525.40M USDC"}
          totalLiquidity={marketData ? `$${(formatUSDC(marketData.totalBorrowAssets) / 1e6).toFixed(2)}M` : "$182.60M"}
          totalLiquiditySubtitle={marketData ? `${(formatUSDC(marketData.totalBorrowAssets) / 1e6).toFixed(2)}M USDC` : "182.6M USDC"}
          borrowRate="6.25%"
          attributes={marketAttributes}
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
