/**
 * Borrow / repay form step of the loan overlay. Reports progress and completion
 * upwards — `LoanFlowOverlay` owns the shell every step renders into.
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
