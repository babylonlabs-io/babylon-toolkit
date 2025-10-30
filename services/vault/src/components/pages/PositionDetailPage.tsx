/**
 * Position Detail Page
 *
 * Displays details for an existing position and allows users to:
 * - Repay debt
 * - Borrow more against existing collateral
 * - Withdraw collateral
 *
 * Accessed when user clicks on a position from PositionOverview
 */

import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useWalletClient } from "wagmi";

import { CONTRACTS } from "../../config/contracts";
import { useSinglePosition } from "../../hooks/useSinglePosition";
import {
  repayDebtFull,
  repayDebtPartial,
  withdrawCollateralFromPosition,
} from "../../services/position/positionTransactionService";
import { BorrowReviewModal } from "../BorrowReviewModal";
import { BorrowSuccessModal } from "../BorrowSuccessModal";
import { LoanCard } from "../LoanCard";
import { MarketInfo } from "../MarketInfo";
import { RepayReviewModal } from "../RepayReviewModal";
import { RepaySuccessModal } from "../RepaySuccessModal";

export function PositionDetailPage() {
  const navigate = useNavigate();
  const { positionId } = useParams<{ positionId: string }>();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "repay"; // Default to repay for existing positions

  // Get ETH wallet client for transactions
  // This component is inside WagmiProvider (via AppKitProvider), so it's safe to call useWalletClient
  const { data: walletClient } = useWalletClient();
  const chain = walletClient?.chain;

  // Fetch real position data
  const { position, loading, refetch } = useSinglePosition(
    positionId as Hex | undefined,
  );

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
    navigate("/");
  };

  // Calculate real values from position data
  const {
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    maxCollateral,
    maxBorrow,
    utilizationPercent,
  } = useMemo(() => {
    if (!position) {
      // Return default/placeholder values while loading
      return {
        btcPrice: 0,
        liquidationLtv: 0,
        currentLoanAmount: 0,
        currentCollateralAmount: 0,
        maxCollateral: 0,
        maxBorrow: 0,
        utilizationPercent: 0,
      };
    }

    const { morphoPosition, marketData, btcPriceUSD } = position;

    // Current debt including accrued interest (USDC has 6 decimals)
    const currentDebt = Number(formatUnits(morphoPosition.borrowAssets, 6));

    // Current collateral (vBTC has 18 decimals)
    const collateralBTC = Number(formatUnits(morphoPosition.collateral, 18));

    // Liquidation LTV from market (stored with 18 decimals, 1e18 = 100%)
    const lltv = Math.round(Number(formatUnits(marketData.lltv, 16)));

    // For borrow more flow - use current collateral as max
    // TODO: Could allow adding more vaults as collateral
    const maxCollateralValue = collateralBTC;

    // For borrow more flow - calculate available borrow based on LTV
    // TODO: Implement proper maxBorrow from market liquidity and remaining LTV headroom
    const maxBorrowValue = 100000; // Placeholder: hardcoded for now

    return {
      btcPrice: btcPriceUSD,
      liquidationLtv: lltv,
      currentLoanAmount: currentDebt,
      currentCollateralAmount: collateralBTC,
      maxCollateral: maxCollateralValue,
      maxBorrow: maxBorrowValue,
      utilizationPercent: marketData.utilizationPercent,
    };
  }, [position]);

  const marketAttributes = [
    { label: "Collateral", value: "BTC" },
    { label: "Loan", value: "USDC" },
    { label: "Liquidation LTV", value: `${liquidationLtv}%` },
    {
      label: "Oracle price",
      value: `BTC / USDC = ${btcPrice.toLocaleString()}`,
    },
    { label: "Created on", value: "2025-10-14" },
    { label: "Utilization", value: `${utilizationPercent.toFixed(2)}%` },
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
      // Validate wallet connection
      if (!walletClient || !chain) {
        throw new Error("Wallet not connected. Please connect your wallet.");
      }

      // Validate position data
      if (!position) {
        throw new Error("Position data not loaded");
      }

      const marketId = position.position.marketId;

      // Determine if this is a full or partial repayment
      // Full repayment triggers when:
      // 1. User clicks "Max" button → sets repayAmount to currentLoanAmount
      // 2. User drags slider all the way right → repayAmount equals currentLoanAmount
      // Use small tolerance to handle floating point precision
      const tolerance = 0.01; // 0.01 USDC tolerance
      const isFullRepayment =
        Math.abs(lastRepayData.repay - currentLoanAmount) < tolerance;

      // Step 1: Repay debt
      if (isFullRepayment) {
        // Full repayment - use repayDebtFull with buffer
        // Buffer accounts for interest accrual between tx submission and execution
        // This ensures the position is completely closed even if interest accrues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await repayDebtFull(
          walletClient as any,
          chain,
          CONTRACTS.VAULT_CONTROLLER,
          positionId!,
          marketId,
        );
      } else {
        // Partial repayment - use repayDebtPartial with exact amount
        // No buffer - user pays exactly what they specify via slider
        // Convert USDC amount to bigint (6 decimals)
        const repayAmountBigint = parseUnits(lastRepayData.repay.toString(), 6);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await repayDebtPartial(
          walletClient as any,
          chain,
          CONTRACTS.VAULT_CONTROLLER,
          positionId!,
          marketId,
          repayAmountBigint,
        );
      }

      // Step 2: Withdraw collateral if user requested it
      // Note: The contract withdraws ALL available collateral (not a specific amount)
      // TODO: The UI shows a withdrawal amount slider, but the contract doesn't support partial withdrawal
      if (lastRepayData.withdraw > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await withdrawCollateralFromPosition(
          walletClient as any,
          chain,
          CONTRACTS.VAULT_CONTROLLER,
          marketId,
        );
      }

      // Refetch position data to update UI with new balances
      await refetch();

      // Success - show success modal
      setShowRepayReviewModal(false);
      setShowRepaySuccessModal(true);
    } catch (error) {
      // Show error to user
      console.error("Repayment failed:", error);
      alert(
        `Repayment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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

  // Show loading state while fetching position data
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-sm text-accent-secondary">
          Loading position data...
        </div>
      </div>
    );
  }

  // Show error if position not found
  if (!position) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-sm text-accent-secondary">
          Position not found
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
          totalMarketSize="$525.40M"
          totalMarketSizeSubtitle="525.40M USDC"
          totalLiquidity="$182.60M"
          totalLiquiditySubtitle="182.6M USDC"
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
