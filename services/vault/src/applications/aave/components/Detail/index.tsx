/**
 * Aave Reserve Detail Page
 *
 * Borrow/Repay card with real position data from Aave oracle.
 * Reserve is selected from the overview page and passed via URL param.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { BackButton, EmptyState } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useConnection, useETHWallet } from "@/context/wallet";

import { LOAN_TAB } from "../../constants";
import { LoanProvider } from "../context/LoanContext";
import { LoanCard } from "../LoanCard";
import { BorrowSuccessModal } from "../LoanCard/Borrow/SuccessModal";
import { RepaySuccessModal } from "../LoanCard/Repay/SuccessModal";

import { useAaveReserveDetail, useBorrowRepayModals } from "./hooks";

const btcConfig = getNetworkConfigBTC();

export function AaveReserveDetail() {
  const navigate = useNavigate();
  const { reserveId } = useParams<{ reserveId: string }>();
  const [searchParams] = useSearchParams();

  // Read tab from URL query params (defaults to "borrow")
  const tabParam = searchParams.get("tab");
  const defaultTab =
    tabParam === LOAN_TAB.REPAY ? LOAN_TAB.REPAY : LOAN_TAB.BORROW;

  const { isConnected } = useConnection();
  const { address } = useETHWallet();

  // Fetch reserve and position data
  const {
    isLoading,
    selectedReserve,
    assetConfig,
    vbtcReserve,
    liquidationThresholdBps,
    positionId,
    proxyContract,
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd,
    healthFactor,
  } = useAaveReserveDetail({ reserveId, address });

  // Modal state management
  const {
    showBorrowSuccess,
    borrowSuccessData,
    openBorrowSuccess,
    closeBorrowSuccess,
    showRepaySuccess,
    repaySuccessData,
    openRepaySuccess,
    closeRepaySuccess,
  } = useBorrowRepayModals();

  const handleBack = () => navigate("/app/aave");

  const handleCloseBorrowSuccess = () => {
    closeBorrowSuccess();
    navigate("/app/aave");
  };

  const handleCloseRepaySuccess = () => {
    closeRepaySuccess();
    navigate("/app/aave");
  };

  // Loading state
  if (isLoading) {
    return (
      <Container className="pb-6">
        <div className="space-y-6">
          <BackButton label="Aave" onClick={handleBack} />
          <div className="flex items-center justify-center py-12">
            <p className="text-accent-secondary">Loading...</p>
          </div>
        </div>
      </Container>
    );
  }

  // Disconnected state
  if (!isConnected) {
    return (
      <Container className="pb-6">
        <div className="space-y-6">
          <BackButton label="Aave" onClick={handleBack} />
          <EmptyState
            avatarUrl={btcConfig.icon}
            avatarAlt={btcConfig.name}
            title="Connect to manage position"
            description="Please connect your wallet to manage your position."
            isConnected={false}
            withCard
          />
        </div>
      </Container>
    );
  }

  // Reserve not found
  if (!selectedReserve || !assetConfig || !vbtcReserve) {
    return (
      <Container className="pb-6">
        <div className="space-y-6">
          <BackButton label="Aave" onClick={handleBack} />
          <div className="flex items-center justify-center py-12">
            <p className="text-accent-secondary">Reserve not found</p>
          </div>
        </div>
      </Container>
    );
  }

  // Build loan context with all data needed by Borrow/Repay components
  const loanContextValue = {
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    assetConfig,
    positionId,
    proxyContract,
    onBorrowSuccess: openBorrowSuccess,
    onRepaySuccess: openRepaySuccess,
  };

  return (
    <LoanProvider value={loanContextValue}>
      <Container className="pb-6">
        <div className="space-y-6">
          <BackButton label="Aave" onClick={handleBack} />
          <LoanCard defaultTab={defaultTab} />
        </div>
      </Container>

      <BorrowSuccessModal
        open={showBorrowSuccess}
        onClose={handleCloseBorrowSuccess}
        onViewLoan={handleCloseBorrowSuccess}
        borrowAmount={borrowSuccessData.amount}
        borrowSymbol={assetConfig.symbol}
        assetIcon={assetConfig.icon}
      />

      <RepaySuccessModal
        open={showRepaySuccess}
        onClose={handleCloseRepaySuccess}
        onViewLoan={handleCloseRepaySuccess}
        repayAmount={repaySuccessData.repayAmount}
        repaySymbol={assetConfig.symbol}
        assetIcon={assetConfig.icon}
      />
    </LoanProvider>
  );
}
