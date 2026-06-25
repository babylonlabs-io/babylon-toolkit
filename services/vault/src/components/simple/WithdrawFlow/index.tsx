import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState } from "react";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
import {
  computeProjectedHealthFactor,
  getEffectiveVaultSelection,
  getUniquePayoutAddresses,
} from "@/applications/aave/utils";
import {
  ProtocolParamsProvider,
  useProtocolParamsContext,
} from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import type { CollateralVaultEntry } from "@/types/collateral";
import { maxAssertTimelockBlocks } from "@/utils/pegoutTiming";

import { FadeTransition } from "../FadeTransition";

import { useWithdrawFlow, WithdrawStep } from "./useWithdrawFlow";
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
}

function WithdrawFlowContent({
  open,
  onClose,
  collateralVaults,
  collateralBtc,
  collateralValueUsd,
  currentHealthFactor,
  preSelectedVaultIds,
}: WithdrawFlowProps) {
  const { step, goToProgress, reset } = useWithdrawFlow();
  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();
  const { getOffchainParamsByVersion, config } = useProtocolParamsContext();

  const renderedStep = useDialogStep(open, step, reset);

  // Snapshots captured at confirm time. Needed by the Progress view because the
  // underlying vaults are removed from the user's collateral list after
  // withdraw — without snapshotting, this data would disappear by the time we
  // navigate to PROGRESS.
  const [submittedPayoutAddresses, setSubmittedPayoutAddresses] = useState<
    string[]
  >([]);
  const [submittedAssertTimelockBlocks, setSubmittedAssertTimelockBlocks] =
    useState(0);

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

  // Conservative payout ETA for the batch: the largest `timelockAssert` across
  // the selected vaults' offchain-params versions. Falls back to the latest
  // version's value when a vault's version can't be resolved.
  const selectedAssertTimelockBlocks = useMemo(
    () =>
      maxAssertTimelockBlocks(
        effectiveSelectedVaults.map((v) => v.offchainParamsVersion),
        (version) => getOffchainParamsByVersion(version)?.timelockAssert,
        Number(config.offchainParams.timelockAssert),
      ),
    [effectiveSelectedVaults, getOffchainParamsByVersion, config],
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
    const success = await executeWithdraw(effectiveSelectedVaultIds);
    if (success) {
      setSubmittedPayoutAddresses(selectedPayoutAddresses);
      setSubmittedAssertTimelockBlocks(selectedAssertTimelockBlocks);
      goToProgress();
    }
  }, [
    executeWithdraw,
    effectiveSelectedVaultIds,
    selectedPayoutAddresses,
    selectedAssertTimelockBlocks,
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
          <div className="mx-auto w-full max-w-[612px]">
            <WithdrawReviewContent
              totalAmountBtc={selectedBtc}
              totalAmountUsd={selectedUsd}
              currentHealthFactor={currentHealthFactor}
              projectedHealthFactor={projectedHealthFactor}
              payoutAddresses={selectedPayoutAddresses}
              assertTimelockBlocks={selectedAssertTimelockBlocks}
              isProcessing={isProcessing}
              onConfirm={handleConfirm}
            />
          </div>
        )}
        {renderedStep === WithdrawStep.PROGRESS && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawProgressView
              payoutAddresses={submittedPayoutAddresses}
              assertTimelockBlocks={submittedAssertTimelockBlocks}
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
