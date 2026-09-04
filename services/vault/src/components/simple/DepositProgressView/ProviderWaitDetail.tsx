import { Loader, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

interface ProviderWaitDetailProps {
  step: DepositFlowStep;
}

function getWaitStatus(step: DepositFlowStep): string {
  const { waitDetails } = COPY.deposit;

  switch (step) {
    case DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS:
      return waitDetails.awaitingBtcDepthAndVpSetup;
    case DepositFlowStep.AWAIT_VP_VERIFICATION:
      return waitDetails.verifyingDeposit;
    case DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION:
      return waitDetails.confirmingActivation;
    default:
      return "";
  }
}

export function ProviderWaitDetail({ step }: ProviderWaitDetailProps) {
  const copy = COPY.deposit.waitDetails;
  const status = getWaitStatus(step);

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-secondary-highlight p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          {copy.status}:
        </Text>
        <span className="flex items-center gap-2">
          <Loader size={14} className="text-accent-primary" />
          <Text as="span" variant="body2" className="text-accent-primary">
            {status}
          </Text>
        </span>
      </div>
    </div>
  );
}
