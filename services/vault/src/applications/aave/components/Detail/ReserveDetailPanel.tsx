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
import { ReserveIdentityBlock } from "../ReserveIdentityBlock";

import { useAaveReserveDetail } from "./hooks";
import { PositionGate } from "./PositionGate";

const btcConfig = getNetworkConfigBTC();

export interface LoanSuccessState {
  /** Reserve the transaction settled on; the overlay drops the success step
   *  once the route leaves it. */
  reserveId: string;
  variant: "borrow" | "repay";
  amount: number;
  symbol: string;
  decimals: number;
  assetIcon: string;
}

interface ReserveDetailPanelProps {
  /** Raw `?reserve=` value — the reserve's on-chain id as a decimal string. */
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
    tokenIdentity,
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
    identityError,
    isIdentityCompromised,
    retryIdentity,
    isLegacyReserveParam,
    isPositionDataStale,
    refetchPosition,
    refetchSplitParams,
  } = useAaveReserveDetail({ reserveId, address });

  // One narrowing point for everything that depends on a proven identity, so
  // the context value below cannot be assembled from a half-verified reserve.
  const verified =
    selectedReserve &&
    tokenIdentity &&
    assetConfig &&
    vbtcReserve &&
    currentDebtAmount != null
      ? {
          selectedReserve,
          tokenIdentity,
          assetConfig,
          vbtcReserve,
          currentDebtAmount,
        }
      : null;

  // First: this branch renders no reserve-derived label or number, and the
  // identity query runs without a wallet — leaving it below the gate would park
  // a disconnected user behind an RPC before telling them to connect.
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

  // Before `isLoading`: that flag ORs four sources, so a still-pending price
  // query would otherwise pin a spinner over a resolved integrity failure.
  if (identityError) {
    return (
      <ReserveIdentityBlock
        compromised={isIdentityCompromised}
        onRetry={() => void retryIdentity()}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-accent-secondary">{COPY.common.loading}</p>
      </div>
    );
  }

  // Unresolvable: missing/legacy/non-numeric param, no id match, more than one
  // id match, or a missing vBTC reserve. Don't gate on oracleAddress — repay
  // doesn't need it; lookup failure surfaces via ancillaryError on Borrow.
  if (!verified) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-accent-secondary">
          {isLegacyReserveParam
            ? COPY.loans.detail.reserveLinkOutdated
            : COPY.loans.reserveNotFound}
        </p>
      </div>
    );
  }

  const settled = (variant: "borrow" | "repay", amount: number) => ({
    reserveId,
    variant,
    amount,
    symbol: verified.assetConfig.symbol,
    // Proven decimals, so the success screen can't report a different amount
    // than the one that was signed.
    decimals: verified.tokenIdentity.decimals,
    assetIcon: verified.assetConfig.icon,
  });

  const loanContextValue = {
    collateralValueUsd,
    currentDebtAmount: verified.currentDebtAmount,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve: verified.selectedReserve,
    tokenIdentity: verified.tokenIdentity,
    assetConfig: verified.assetConfig,
    proxyContract,
    oracleAddress,
    tokenPriceUsd,
    isPriceStale,
    isPositionDataStale,
    refetchPosition,
    refetchSplitParams,
    onBorrowSuccess: (amount: number) => onSuccess(settled("borrow", amount)),
    onRepaySuccess: (repayAmount: number) =>
      onSuccess(settled("repay", repayAmount)),
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
