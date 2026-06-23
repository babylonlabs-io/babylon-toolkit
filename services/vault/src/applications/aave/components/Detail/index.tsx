/**
 * Aave Reserve Detail
 *
 * Borrow/Repay card with real position data from Aave oracle, rendered as a
 * full-screen modal (like the deposit flow). The reserve (token symbol) and
 * mode (`tab`) come from ReserveDetailModalContext via props; closing calls
 * `onRequestClose` to clear that modal state.
 */

import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { EmptyState } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useConnection, useETHWallet } from "@/context/wallet";

import type { LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import { useAaveOracleAddress } from "../../hooks";
import { LoanProvider } from "../context/LoanContext";
import { LoanCard } from "../LoanCard";
import { LoanSuccessModal } from "../LoanCard/LoanSuccessModal";

import { useAaveReserveDetail, useBorrowRepayModals } from "./hooks";
import { PositionGate } from "./PositionGate";

const btcConfig = getNetworkConfigBTC();

export function AaveReserveDetail({
  reserveSymbol,
  tab,
  onRequestClose,
}: {
  reserveSymbol: string;
  tab: LoanTab;
  onRequestClose: () => void;
}) {
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
  } = useAaveReserveDetail({ reserveId: reserveSymbol, address });

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

  // True while a borrow/repay tx is signing or submitting. Lifted from the
  // Borrow/Repay forms (via LoanContext.onProcessingChange) so the dialog can
  // refuse to close mid-transaction — otherwise an ESC/backdrop/X dismiss
  // unmounts the flow and the success screen never shows even though the tx
  // completes on-chain.
  const [isTxInFlight, setIsTxInFlight] = useState(false);

  const handleClose = onRequestClose;

  const handleCloseBorrowSuccess = () => {
    closeBorrowSuccess();
    onRequestClose();
  };

  const handleCloseRepaySuccess = () => {
    closeRepaySuccess();
    onRequestClose();
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
      onProcessingChange: setIsTxInFlight,
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
        // Withholding `onClose` hides the close button and no-ops the backdrop
        // click; `disableEscapeClose` covers the ESC key — together they lock
        // all three dismiss paths while a tx is in flight.
        onClose={isTxInFlight ? undefined : handleClose}
        disableEscapeClose={isTxInFlight}
        className="items-center justify-center p-6"
      >
        <div className="mx-auto w-full max-w-[520px]">{renderContent()}</div>
      </FullScreenDialog>

      {selectedReserve && assetConfig && (
        <>
          <LoanSuccessModal
            variant="borrow"
            open={showBorrowSuccess}
            onClose={handleCloseBorrowSuccess}
            onDone={handleCloseBorrowSuccess}
            amount={borrowSuccessData.amount}
            symbol={assetConfig.symbol}
            decimals={selectedReserve.token.decimals}
            assetIcon={assetConfig.icon}
          />

          <LoanSuccessModal
            variant="repay"
            open={showRepaySuccess}
            onClose={handleCloseRepaySuccess}
            onDone={handleCloseRepaySuccess}
            amount={repaySuccessData.repayAmount}
            symbol={assetConfig.symbol}
            decimals={selectedReserve.token.decimals}
            assetIcon={assetConfig.icon}
          />
        </>
      )}
    </>
  );
}
