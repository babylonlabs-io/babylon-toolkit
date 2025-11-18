/**
 * Market Detail Page
 *
 * Handles both:
 * 1. Browse markets and open new positions (when user has no position)
 * 2. Manage existing positions (when user has a position for this market)
 *
 * The page automatically detects if the user has a position for this market.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { parseUnits } from "viem";

import { MarketInfo } from "../Info";

import { LoanCard } from "./components/LoanCard";
import { TransactionSuccessModal } from "./components/LoanCard/Borrow/SuccessModal";
import { RepaySuccessModal } from "./components/LoanCard/Repay/SuccessModal";
import { MarketDetailProvider } from "./context/MarketDetailContext";
import { useBorrowRepayModals } from "./hooks/useBorrowRepayModals";
import { useBorrowTransaction } from "./hooks/useBorrowTransaction";
import { useMarketDetail } from "./hooks/useMarketDetail";
import { useRepayTransaction } from "./hooks/useRepayTransaction";

export function MarketDetail() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { marketId } = useParams<{ marketId: string }>();

  // Fetch market data and user's position (if exists)
  const {
    isMarketLoading,
    marketError,
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    borrowableVaults,
    availableLiquidity,
    marketAttributes,
    positionData,
    userPosition,
    marketDisplayValues,
    tokenPair,
    refetch,
  } = useMarketDetail();

  // Check if user has a position for this market
  const hasPosition = !!userPosition;

  // Default tab based on whether user has a position:
  // - Has position → default to "repay"
  // - No position → default to "borrow"
  // If URL has ?tab=repay but no position exists, override to "borrow"
  const urlTab = searchParams.get("tab");
  const defaultTab =
    urlTab === "repay" && !hasPosition
      ? "borrow" // Force borrow tab if repay was requested but no position
      : urlTab || (hasPosition ? "repay" : "borrow");

  // Clean up URL when position disappears after withdrawal
  useEffect(() => {
    if (urlTab === "repay" && !hasPosition) {
      // Remove the tab parameter from URL to reflect that we're now on borrow tab
      setSearchParams({}, { replace: true });
    }
  }, [urlTab, hasPosition, setSearchParams]);

  // Modal state management
  const {
    showBorrowSuccessModal,
    lastBorrowData,
    openBorrowReview,
    showBorrowSuccess,
    closeBorrowSuccess,
    showRepaySuccessModal,
    lastRepayData,
    openRepayReview,
    showRepaySuccess,
    closeRepaySuccess,
    processing,
    setProcessing,
  } = useBorrowRepayModals();

  // Borrow transaction handler
  const { handleConfirmBorrow } = useBorrowTransaction({
    hasPosition,
    marketId,
    borrowableVaults,
    refetch,
    onBorrowSuccess: showBorrowSuccess,
    setProcessing,
  });

  // Repay transaction handler
  const { handleConfirmRepay } = useRepayTransaction({
    hasPosition,
    userPosition,
    currentLoanAmount,
    currentCollateralAmount,
    refetch,
    onRepaySuccess: showRepaySuccess,
    setProcessing,
  });

  // Direct transaction handlers (skip review modal)
  const handleBorrowDirect = async (
    collateralAmount: number,
    borrowAmount: number,
  ) => {
    // Set the data for success modal display
    openBorrowReview(collateralAmount, borrowAmount);
    // Convert to blockchain units and execute transaction
    const collateralSatoshis = parseUnits(collateralAmount.toString(), 8);
    const borrowAmountRaw = parseUnits(borrowAmount.toString(), 6);
    await handleConfirmBorrow(collateralSatoshis, borrowAmountRaw);
  };

  const handleRepayDirect = async (
    repayAmount: number,
    withdrawAmount: number,
  ) => {
    // Set the data for success modal display
    openRepayReview(repayAmount, withdrawAmount);
    // Execute transaction immediately with the amounts
    await handleConfirmRepay(repayAmount, withdrawAmount);
  };

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

  // Ensure tokenPair is available
  if (!tokenPair) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-sm text-accent-secondary">
          Market configuration not available
        </div>
      </div>
    );
  }

  return (
    <MarketDetailProvider
      value={{
        btcPrice,
        liquidationLtv,
        currentLoanAmount,
        currentCollateralAmount,
        borrowableVaults,
        availableLiquidity,
        tokenPair,
      }}
    >
      <Container className="pb-6">
        <div className="grid grid-cols-2 items-start gap-6 max-lg:grid-cols-1">
          {/* Left Side: Market Info */}
          <MarketInfo
            onBack={handleBack}
            marketPair={tokenPair.pairName}
            btcIcon={tokenPair.collateral.icon}
            usdcIcon={tokenPair.loan.icon}
            collateralSymbol={tokenPair.collateral.symbol}
            loanSymbol={tokenPair.loan.symbol}
            totalMarketSize={marketDisplayValues.totalMarketSize}
            totalMarketSizeSubtitle={
              marketDisplayValues.totalMarketSizeSubtitle
            }
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
              onBorrow={handleBorrowDirect}
              onRepay={handleRepayDirect}
              processing={processing}
            />
          </div>
        </div>

        {/* Success Modals */}
        <TransactionSuccessModal
          open={showBorrowSuccessModal}
          onClose={closeBorrowSuccess}
          borrowAmount={lastBorrowData.borrow}
          borrowSymbol={tokenPair.loan.symbol}
          collateralAmount={lastBorrowData.collateral}
        />
        <RepaySuccessModal
          open={showRepaySuccessModal}
          onClose={closeRepaySuccess}
          repayAmount={lastRepayData.repay}
          withdrawAmount={lastRepayData.withdraw}
          repaySymbol={tokenPair.loan.symbol}
          withdrawSymbol={tokenPair.collateral.symbol}
        />
      </Container>
    </MarketDetailProvider>
  );
}
