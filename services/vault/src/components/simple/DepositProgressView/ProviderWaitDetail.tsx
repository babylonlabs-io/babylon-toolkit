import { Loader, Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

interface ProviderWaitDetailProps {
  step: DepositFlowStep;
}

function formatStartedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getWaitDetailCopy(step: DepositFlowStep): {
  status: string;
  nextAction: string;
} {
  const { steps, waitDetails } = COPY.deposit;

  switch (step) {
    case DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS:
      return {
        status: waitDetails.preparingPayouts,
        nextAction: steps.signPayouts,
      };
    case DepositFlowStep.AWAIT_VP_VERIFICATION:
      return {
        status: waitDetails.verifyingDeposit,
        nextAction: steps.downloadArtifact,
      };
    case DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION:
      return {
        status: waitDetails.confirmingActivation,
        nextAction: waitDetails.vaultActive,
      };
    default:
      return {
        status: "",
        nextAction: "",
      };
  }
}

export function ProviderWaitDetail({ step }: ProviderWaitDetailProps) {
  const [startedAt] = useState(() => Date.now());
  const copy = COPY.deposit.waitDetails;
  const detail = getWaitDetailCopy(step);

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-secondary-highlight p-3">
      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          {copy.startedAt}:
        </Text>
        <Text as="span" variant="body2" className="text-accent-primary">
          {formatStartedAt(startedAt)}
        </Text>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          {copy.status}:
        </Text>
        <span className="flex items-center gap-2">
          <Loader size={14} className="text-accent-primary" />
          <Text as="span" variant="body2" className="text-accent-primary">
            {detail.status}
          </Text>
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          {copy.nextAction}:
        </Text>
        <Text as="span" variant="body2" className="text-accent-primary">
          {detail.nextAction}
        </Text>
      </div>
    </div>
  );
}
