import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback } from "react";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";

import { FadeTransition } from "../FadeTransition";

import { useWithdrawFlow, WithdrawStep } from "./useWithdrawFlow";
import { WithdrawProgressView } from "./WithdrawProgressView";
import { WithdrawReviewContent } from "./WithdrawReviewContent";

export interface WithdrawFlowProps {
  open: boolean;
  onClose: () => void;
  totalAmountBtc: number;
  totalAmountUsd: number;
  vaultIds: string[];
}

function WithdrawFlowContent({
  open,
  onClose,
  totalAmountBtc,
  totalAmountUsd,
  vaultIds,
}: WithdrawFlowProps) {
  const { step, goToProgress, reset } = useWithdrawFlow();
  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();

  const renderedStep = useDialogStep(open, step, reset);

  const handleConfirm = useCallback(async () => {
    const success = await executeWithdraw(vaultIds);
    if (success) {
      goToProgress();
    }
  }, [executeWithdraw, vaultIds, goToProgress]);

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
              totalAmountBtc={totalAmountBtc}
              totalAmountUsd={totalAmountUsd}
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
  return (
    <ProtocolParamsProvider>
      <WithdrawFlowContent {...props} />
    </ProtocolParamsProvider>
  );
}
