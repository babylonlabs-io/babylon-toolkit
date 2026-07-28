/**
 * Borrow / repay form step of the loan overlay.
 *
 * Panel, not a dialog: `LoanFlowOverlay` owns the one full-screen shell every
 * step renders into, so this reports transaction progress and completion
 * upwards instead of opening dialogs of its own.
 */

import { EmptyState } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";

import type { LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import { useAaveOracleAddress } from "../../hooks";
import { LoanProvider } from "../context/LoanContext";
import { LoanCard } from "../LoanCard";

import { useAaveReserveDetail } from "./hooks";
import { PositionGate } from "./PositionGate";

const btcConfig = getNetworkConfigBTC();

/** What the success step needs to render, reported when a tx settles. */
export interface LoanSuccessState {
  variant: "borrow" | "repay";
  amount: number;
  symbol: string;
  decimals: number;
  assetIcon: string;
}

interface ReserveDetailPanelProps {
  reserveId: string;
  tab: LoanTab;
  /** True while a borrow/repay tx is signing or submitting. */
  onProcessingChange: (isProcessing: boolean) => void;
  onSuccess: (state: LoanSuccessState) => void;
}

export function ReserveDetailPanel({
  reserveId,
  tab,
  onProcessingChange,
  onSuccess,
}: ReserveDetailPanelProps) {
  const { isConnected } = useConnection();
  const { address } = useETHWallet();
  const { config } = useAaveConfig();
  // Loading/error surfaces via useAaveReservePrice (shared cache key).
  const { oracleAddress } = useAaveOracleAddress({
    spokeAddress: config?.coreSpokeAddress,
  });

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-accent-secondary">{COPY.common.loading}</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <EmptyState
        avatarUrl={btcConfig.icon}
        avatarAlt={btcConfig.name}
        variant="compact"
        title={COPY.loans.connectToManage.title}
        description={COPY.loans.connectToManage.body}
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
        <p className="text-accent-secondary">{COPY.loans.reserveNotFound}</p>
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
    onBorrowSuccess: (amount: number) =>
      onSuccess({
        variant: "borrow",
        amount,
        symbol: assetConfig.symbol,
        decimals: selectedReserve.token.decimals,
        assetIcon: assetConfig.icon,
      }),
    // The second argument is the withdraw amount, which the success step does
    // not show — the Repay form always passes 0 today.
    onRepaySuccess: (repayAmount: number) =>
      onSuccess({
        variant: "repay",
        amount: repayAmount,
        symbol: assetConfig.symbol,
        decimals: selectedReserve.token.decimals,
        assetIcon: assetConfig.icon,
      }),
    onProcessingChange,
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
}
