import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState } from "react";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
import type { AavePositionWithLiveData } from "@/applications/aave/services";
import {
  computeProjectedHealthFactor,
  getEffectiveVaultSelection,
  getUniquePayoutAddresses,
} from "@/applications/aave/utils";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import type { CollateralVaultEntry } from "@/types/collateral";

import { FadeTransition } from "../FadeTransition";

import { useWithdrawFlow, WithdrawStep } from "./useWithdrawFlow";
import { validateFreshWithdraw } from "./withdrawPreSignValidation";
import { WithdrawProgressView } from "./WithdrawProgressView";
import { WithdrawReviewContent } from "./WithdrawReviewContent";

export interface WithdrawFlowProps {
  open: boolean;
  onClose: () => void;
  collateralVaults: CollateralVaultEntry[];
  collateralBtc: number;
  /** Total collateral USD for display-only rendering of the selected amount. */
  collateralValueUsd: number;
  /** User's current on-chain health factor (null when no debt). */
  currentHealthFactor: number | null;
  /** Vault IDs selected inline on the collateral list before opening the dialog. */
  preSelectedVaultIds: string[];
  /**
   * True when the cached Aave position used for the projected-HF computation
   * exceeded the staleness threshold. Drives the Confirm button's disabled
   * state so the user cannot sign on stale safety data.
   */
  isPositionDataStale: boolean;
  /**
   * Refetch the Aave position. Resolves to the freshly fetched position (or
   * null if the user has no position). Invoked at the pre-sign boundary to
   * re-validate the projected HF against on-chain values before broadcast.
   */
  refetchPosition: () => Promise<AavePositionWithLiveData | null>;
}

function WithdrawFlowContent({
  open,
  onClose,
  collateralVaults,
  collateralBtc,
  collateralValueUsd,
  currentHealthFactor,
  preSelectedVaultIds,
  isPositionDataStale,
  refetchPosition,
}: WithdrawFlowProps) {
  const { step, goToProgress, reset } = useWithdrawFlow();
  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();

  const renderedStep = useDialogStep(open, step, reset);

  // Snapshot of payout addresses captured at confirm time. Needed by the
  // Progress view because the underlying vaults are removed from the user's
  // collateral list after withdraw — without snapshotting, the addresses
  // would disappear by the time we navigate to PROGRESS.
  const [submittedPayoutAddresses, setSubmittedPayoutAddresses] = useState<
    string[]
  >([]);

  const {
    selectedVaultIds: effectiveSelectedVaultIds,
    selectedVaults: effectiveSelectedVaults,
  } = useMemo(
    () => getEffectiveVaultSelection(collateralVaults, preSelectedVaultIds),
    [collateralVaults, preSelectedVaultIds],
  );

  const selectedPayoutAddresses = useMemo(
    () => getUniquePayoutAddresses(effectiveSelectedVaults),
    [effectiveSelectedVaults],
  );

  // Aggregate amounts and projected HF for the current selection.
  const { selectedBtc, selectedUsd, projectedHealthFactor } = useMemo(() => {
    const btc = effectiveSelectedVaults.reduce(
      (sum, v) => sum + v.amountBtc,
      0,
    );
    const usd =
      collateralBtc > 0 ? collateralValueUsd * (btc / collateralBtc) : 0;
    const projectedHF = computeProjectedHealthFactor(
      currentHealthFactor,
      collateralBtc,
      btc,
    );
    return {
      selectedBtc: btc,
      selectedUsd: usd,
      projectedHealthFactor: projectedHF,
    };
  }, [
    effectiveSelectedVaults,
    collateralBtc,
    collateralValueUsd,
    currentHealthFactor,
  ]);

  const handleConfirm = useCallback(async () => {
    // Pre-sign re-validation: refetch the position and re-check the projected
    // HF against fresh on-chain values immediately before broadcast. Throws
    // abort the in-flight confirm; `executeWithdraw`'s catch surfaces the
    // error through the standard modal. The refetch also updates React Query
    // so the dialog re-renders with fresh `currentHealthFactor` for re-review.
    const preSignValidation = async () => {
      const fresh = await refetchPosition();
      validateFreshWithdraw(fresh, selectedBtc);
    };

    const success = await executeWithdraw(
      effectiveSelectedVaultIds,
      preSignValidation,
    );
    if (success) {
      setSubmittedPayoutAddresses(selectedPayoutAddresses);
      goToProgress();
    }
  }, [
    executeWithdraw,
    effectiveSelectedVaultIds,
    selectedBtc,
    refetchPosition,
    selectedPayoutAddresses,
    goToProgress,
  ]);

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      className="items-center justify-center p-6"
    >
      <FadeTransition stepKey={renderedStep}>
        {renderedStep === WithdrawStep.REVIEW && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawReviewContent
              totalAmountBtc={selectedBtc}
              totalAmountUsd={selectedUsd}
              currentHealthFactor={currentHealthFactor}
              projectedHealthFactor={projectedHealthFactor}
              payoutAddresses={selectedPayoutAddresses}
              isProcessing={isProcessing}
              isPositionDataStale={isPositionDataStale}
              onConfirm={handleConfirm}
            />
          </div>
        )}
        {renderedStep === WithdrawStep.PROGRESS && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawProgressView
              payoutAddresses={submittedPayoutAddresses}
              onClose={onClose}
            />
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
