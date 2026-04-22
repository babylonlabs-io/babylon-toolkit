import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState } from "react";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
import {
  computeProjectedHealthFactor,
  isVaultIndividuallyWithdrawable,
  type PositionSnapshot,
} from "@/applications/aave/utils";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import type { CollateralVaultEntry } from "@/types/collateral";

import { FadeTransition } from "../FadeTransition";

import { useWithdrawFlow, WithdrawStep } from "./useWithdrawFlow";
import { WithdrawProgressView } from "./WithdrawProgressView";
import { WithdrawReviewContent } from "./WithdrawReviewContent";
import { WithdrawVaultSelector } from "./WithdrawVaultSelector";

export interface WithdrawFlowProps {
  open: boolean;
  onClose: () => void;
  collateralVaults: CollateralVaultEntry[];
  collateralBtc: number;
  collateralValueUsd: number;
  debtValueUsd: number;
  liquidationThresholdBps: number;
  /** User's current on-chain health factor (null when no debt). */
  currentHealthFactor: number | null;
}

function WithdrawFlowContent({
  open,
  onClose,
  collateralVaults,
  collateralBtc,
  collateralValueUsd,
  debtValueUsd,
  liquidationThresholdBps,
  currentHealthFactor,
}: WithdrawFlowProps) {
  const { step, goToReview, goToProgress, reset } = useWithdrawFlow();
  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);

  const renderedStep = useDialogStep(open, step, reset);

  const position: PositionSnapshot = useMemo(
    () => ({
      collateralBtc,
      collateralValueUsd,
      debtValueUsd,
      liquidationThresholdBps,
    }),
    [collateralBtc, collateralValueUsd, debtValueUsd, liquidationThresholdBps],
  );

  // Eligibility map: which in-use vaults can be withdrawn individually
  // without breaching HF 1.0. Used by the selector to grey unsafe vaults.
  const vaultEligibility = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const v of collateralVaults) {
      if (!v.inUse) continue;
      map.set(
        v.vaultId,
        isVaultIndividuallyWithdrawable(v.amountBtc, position),
      );
    }
    return map;
  }, [collateralVaults, position]);

  // Aggregate amounts and projected HF for the current selection.
  const { selectedBtc, selectedUsd, projectedHealthFactor } = useMemo(() => {
    const selected = collateralVaults.filter(
      (v) => v.inUse && selectedVaultIds.includes(v.vaultId),
    );
    const btc = selected.reduce((sum, v) => sum + v.amountBtc, 0);
    const usd =
      collateralBtc > 0 ? collateralValueUsd * (btc / collateralBtc) : 0;
    const projectedHF = computeProjectedHealthFactor(
      collateralValueUsd,
      usd,
      debtValueUsd,
      liquidationThresholdBps,
    );
    return {
      selectedBtc: btc,
      selectedUsd: usd,
      projectedHealthFactor: projectedHF,
    };
  }, [
    collateralVaults,
    selectedVaultIds,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    liquidationThresholdBps,
  ]);

  const handleSelectVaults = useCallback(
    (vaultIds: string[]) => {
      setSelectedVaultIds(vaultIds);
      goToReview();
    },
    [goToReview],
  );

  const handleConfirm = useCallback(async () => {
    const success = await executeWithdraw(selectedVaultIds);
    if (success) {
      goToProgress();
    }
  }, [executeWithdraw, selectedVaultIds, goToProgress]);

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      className="items-center justify-center p-6"
    >
      <FadeTransition stepKey={renderedStep}>
        {renderedStep === WithdrawStep.SELECT && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawVaultSelector
              vaults={collateralVaults}
              vaultEligibility={vaultEligibility}
              onNext={handleSelectVaults}
            />
          </div>
        )}
        {renderedStep === WithdrawStep.REVIEW && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawReviewContent
              totalAmountBtc={selectedBtc}
              totalAmountUsd={selectedUsd}
              currentHealthFactor={currentHealthFactor}
              projectedHealthFactor={projectedHealthFactor}
              isProcessing={isProcessing}
              onConfirm={handleConfirm}
            />
          </div>
        )}
        {renderedStep === WithdrawStep.PROGRESS && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawProgressView onClose={onClose} />
          </div>
        )}
      </FadeTransition>
    </FullScreenDialog>
  );
}

export default function WithdrawFlow(props: WithdrawFlowProps) {
  if (!props.open) return null;

  return (
    <ProtocolParamsProvider>
      <WithdrawFlowContent {...props} />
    </ProtocolParamsProvider>
  );
}
