import { Loader, Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

interface ProviderWaitDetailProps {
  step: DepositFlowStep;
  persistKey?: string;
}

const waitStartedAtCache = new Map<string, number>();

function resolveStartedAt(cacheKey: string | undefined): number {
  if (!cacheKey) return Date.now();
  const existing = waitStartedAtCache.get(cacheKey);
  if (existing !== undefined) return existing;
  const now = Date.now();
  waitStartedAtCache.set(cacheKey, now);
  return now;
}

function formatStartedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getWaitStatus(step: DepositFlowStep): string {
  const { waitDetails } = COPY.deposit;

  switch (step) {
    case DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS:
      return waitDetails.preparingPayouts;
    case DepositFlowStep.AWAIT_VP_VERIFICATION:
      return waitDetails.verifyingDeposit;
    case DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION:
      return waitDetails.confirmingActivation;
    default:
      return "";
  }
}

export function ProviderWaitDetail({
  step,
  persistKey,
}: ProviderWaitDetailProps) {
  const cacheKey = persistKey ? `${persistKey}:${step}` : undefined;
  const [startedAt] = useState(() => resolveStartedAt(cacheKey));
  const copy = COPY.deposit.waitDetails;
  const status = getWaitStatus(step);

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
            {status}
          </Text>
        </span>
      </div>
    </div>
  );
}
