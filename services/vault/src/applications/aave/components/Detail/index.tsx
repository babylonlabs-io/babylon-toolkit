/**
 * Aave Reserve Detail
 *
 * Borrow/Repay card with real position data from Aave oracle, rendered as a
 * full-screen modal (like the deposit flow). The reserve comes from the route
 * (`/app/aave/reserve/:reserveId/borrow` or `/repay`) and the mode is passed in
 * as `tab`, so the route stays deep-linkable; closing navigates back to the
 * dashboard.
 */

import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useNavigate, useParams } from "react-router";

import { EmptyState } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useConnection, useETHWallet } from "@/context/wallet";

import type { LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import { useAaveOracleAddress } from "../../hooks";
import { LoanProvider } from "../context/LoanContext";
import { LoanCard } from "../LoanCard";
import { BorrowSuccessModal } from "../LoanCard/Borrow/SuccessModal";
import { RepaySuccessModal } from "../LoanCard/Repay/SuccessModal";

import { useAaveReserveDetail, useBorrowRepayModals } from "./hooks";
import { PositionGate } from "./PositionGate";

const btcConfig = getNetworkConfigBTC();

export function AaveReserveDetail({ tab }: { tab: LoanTab }) {
  const navigate = useNavigate();
  const { reserveId } = useParams<{ reserveId: string }>();

  const { isConnected } = useConnection();
  const { address } = useETHWallet();
  const { config } = useAaveConfig();
  // Loading/error surfaces via useAaveReservePrice (shared cache key).
  const { oracleAddress } = useAaveOracleAddress({
    spokeAddress: config?.coreSpokeAddress,
  });

  // Fetch reserve and position data
  const {
    isLoading,
    selectedReserve,
    assetConfig,
    vbtcReserve,
    liquidationThresholdBps,
    proxyContract,
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd,
    healthFactor,
    tokenPriceUsd,
    isPriceStale,
    positionError,
    ancillaryError,
    isPositionDataStale,
    refetchPosition,
    refetchSplitParams,
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

  const handleClose = () => navigate("/");

  const handleCloseBorrowSuccess = () => {
    closeBorrowSuccess();
    navigate("/");
  };

  const handleCloseRepaySuccess = () => {
    closeRepaySuccess();
    navigate("/");
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-accent-secondary">Loading...</p>
        </div>
      );
    }

    if (!isConnected) {
      return (
        <EmptyState
          avatarUrl={btcConfig.icon}
          avatarAlt={btcConfig.name}
          title="Connect to manage position"
          description="Please connect your wallet to manage your position."
          isConnected={false}
          withCard
        />
      );
    }

    // Don't gate on oracleAddress — repay doesn't need it; lookup failure
    // surfaces via ancillaryError on Borrow.
    if (!selectedReserve || !assetConfig || !vbtcReserve) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-accent-secondary">Reserve not found</p>
        </div>
      );
    }

    const loanContextValue = {
      collateralValueUsd,
      currentDebtAmount,
      totalDebtValueUsd,
      healthFactor,
      liquidationThresholdBps,
      selectedReserve,
      assetConfig,
      proxyContract,
      oracleAddress,
      tokenPriceUsd,
      isPriceStale,
      isPositionDataStale,
      refetchPosition,
      refetchSplitParams,
      onBorrowSuccess: openBorrowSuccess,
      onRepaySuccess: openRepaySuccess,
    };

    return (
      <LoanProvider value={loanContextValue}>
        <PositionGate
          positionError={positionError}
          ancillaryError={ancillaryError}
          refetchPosition={refetchPosition}
        >
          <LoanCard defaultTab={tab} />
        </PositionGate>
      </LoanProvider>
    );
  };

  const showSuccess = showBorrowSuccess || showRepaySuccess;

  return (
    <>
      <FullScreenDialog
        open={!showSuccess}
        onClose={handleClose}
        className="items-center justify-center p-6"
      >
        <div className="mx-auto w-full max-w-[520px]">{renderContent()}</div>
      </FullScreenDialog>

      {selectedReserve && assetConfig && (
        <>
          <BorrowSuccessModal
            open={showBorrowSuccess}
            onClose={handleCloseBorrowSuccess}
            onDone={handleCloseBorrowSuccess}
            borrowAmount={borrowSuccessData.amount}
            borrowSymbol={assetConfig.symbol}
            decimals={selectedReserve.token.decimals}
            assetIcon={assetConfig.icon}
          />

          <RepaySuccessModal
            open={showRepaySuccess}
            onClose={handleCloseRepaySuccess}
            onDone={handleCloseRepaySuccess}
            repaySymbol={assetConfig.symbol}
            repayAmount={repaySuccessData.repayAmount}
            decimals={selectedReserve.token.decimals}
            assetIcon={assetConfig.icon}
          />
        </>
      )}
    </>
  );
}
