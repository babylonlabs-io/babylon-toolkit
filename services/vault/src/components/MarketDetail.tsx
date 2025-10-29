import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { BorrowReviewModal } from "./BorrowReviewModal";
import { BorrowSuccessModal } from "./BorrowSuccessModal";
import { LoanCard } from "./LoanCard";
import { MarketInfo } from "./MarketInfo";
import { RepayReviewModal } from "./RepayReviewModal";
import { RepaySuccessModal } from "./RepaySuccessModal";
import { useMarketDetailData } from "../hooks/useMarketDetailData";
import { blockToDateString, estimateDateFromBlock } from "../utils/blockUtils";

export function MarketDetail() {
  const navigate = useNavigate();
  const { marketId } = useParams<{ marketId: string }>();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "borrow";

  // Fetch comprehensive market detail data
  const {
    marketData,
    marketConfig,
    userPosition,
    btcBalance,
    btcPriceUSD,
    loading: isMarketLoading,
    error: marketError
  } = useMarketDetailData(marketId);

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

  // State for creation date
  const [creationDate, setCreationDate] = useState<string>("Loading...");

  // Fetch creation date when marketConfig changes
  useEffect(() => {
    const fetchCreationDate = async () => {
      if (!marketConfig?.created_block) {
        setCreationDate("Unknown");
        return;
      }

      try {
        // First try to get the actual block timestamp
        const actualDate = await blockToDateString(marketConfig.created_block);
        if (actualDate !== "Unknown") {
          setCreationDate(actualDate);
          return;
        }
      } catch (error) {
        console.warn("Failed to fetch actual block timestamp, using estimation:", error);
      }

      // Fallback to estimation if actual block fetch fails
      const estimatedDate = estimateDateFromBlock(marketConfig.created_block);
      setCreationDate(estimatedDate);
    };

    fetchCreationDate();
  }, [marketConfig?.created_block]);

  const handleBack = () => {
    navigate("/");
  };

  // Helper function to format bigint values to USDC (6 decimals)
  const formatUSDC = (value: bigint) => {
    return Number(value) / 1e6;
  };

  // Helper function to format bigint values to BTC (8 decimals)
  const formatBTC = (value: bigint) => {
    return Number(value) / 1e8;
  };

  // Real data from API and wallet
  const maxCollateral = formatBTC(btcBalance);
  const maxBorrow = marketData ? formatUSDC(marketData.totalSupplyAssets) : 0;
  const btcPrice = btcPriceUSD;

  // Get LLTV from market data (contract) or market config (API)
  const liquidationLtv = marketData
    ? marketData.lltvPercent
    : marketConfig
      ? Number(marketConfig.lltv) / 1e16 // Convert from 18 decimals to percentage
      : 70;

  const currentLoanAmount = userPosition ? formatUSDC(userPosition.borrowAssets) : 0;
  const currentCollateralAmount = userPosition ? formatBTC(userPosition.collateral) : 0;

  console.log(marketConfig)

  // Format LLTV value from API (18 decimals to percentage)
  const formatLLTV = (lltvString: string) => {
    const lltvNumber = Number(lltvString);
    return (lltvNumber / 1e16).toFixed(1); // Convert from 18 decimals to percentage
  };

  const marketAttributes = [
    { label: "Market ID", value: marketId || "Unknown" },
    { label: "Collateral", value: "BTC" },
    { label: "Loan", value: "USDC" },
    {
      label: "Liquidation LTV",
      value: marketConfig
        ? `${formatLLTV(marketConfig.lltv)}%`
        : `${liquidationLtv.toFixed(1)}%`
    },
    {
      label: "Oracle price",
      value: `BTC / USDC = ${btcPrice.toLocaleString()}`,
    },
    {
      label: "Created on",
      value: creationDate
    },
    {
      label: "Utilization",
      value: marketData ? `${marketData.utilizationPercent.toFixed(2)}%` : "Unknown"
    },
    ...(marketConfig ? [
      { label: "Oracle Address", value: marketConfig.oracle },
      { label: "IRM Address", value: marketConfig.irm },
    ] : []),
  ];

  // Create position data for the user's current position
  const positionData = userPosition ? [
    { label: "Current Loan", value: `${currentLoanAmount.toLocaleString()} USDC` },
    { label: "Current Collateral", value: `${currentCollateralAmount.toFixed(8)} BTC` },
    { label: "Market", value: "BTC/USDC" },
    {
      label: "Current LTV",
      value: currentCollateralAmount > 0
        ? `${((currentLoanAmount / (currentCollateralAmount * btcPrice)) * 100).toFixed(1)}%`
        : "0%"
    },
    {
      label: "Liquidation LTV",
      value: marketConfig
        ? `${formatLLTV(marketConfig.lltv)}%`
        : `${liquidationLtv.toFixed(1)}%`
    },
  ] : [
    { label: "Current Loan", value: "0 USDC" },
    { label: "Current Collateral", value: "0 BTC" },
    { label: "Market", value: "BTC/USDC" },
    { label: "Current LTV", value: "0%" },
    {
      label: "Liquidation LTV",
      value: marketConfig
        ? `${formatLLTV(marketConfig.lltv)}%`
        : `${liquidationLtv.toFixed(1)}%`
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
    return null;
  }

  // Error state
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
