import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState } from "react";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
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
}

function WithdrawFlowContent({
  open,
  onClose,
  collateralVaults,
  collateralBtc,
  collateralValueUsd,
}: WithdrawFlowProps) {
  const { step, goToReview, goToProgress, reset } = useWithdrawFlow();
  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);

  const renderedStep = useDialogStep(open, step, reset);

  // Compute amounts for only the selected vaults
  const { selectedBtc, selectedUsd } = useMemo(() => {
    const selected = collateralVaults.filter(
      (v) => v.inUse && selectedVaultIds.includes(v.vaultId),
    );
    const btc = selected.reduce((sum, v) => sum + v.amountBtc, 0);
    const usd =
      collateralBtc > 0 ? collateralValueUsd * (btc / collateralBtc) : 0;
    return { selectedBtc: btc, selectedUsd: usd };
  }, [collateralVaults, selectedVaultIds, collateralBtc, collateralValueUsd]);

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
              onNext={handleSelectVaults}
            />
          </div>
        )}
        {renderedStep === WithdrawStep.REVIEW && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawReviewContent
              totalAmountBtc={selectedBtc}
              totalAmountUsd={selectedUsd}
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
