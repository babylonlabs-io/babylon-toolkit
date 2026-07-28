/**
 * ReserveIdentityBlock
 *
 * Shown in place of the entire reserve detail when the reserve's asset can't be
 * proven on-chain (audit F7). Two distinct cases, deliberately worded apart:
 *
 * - `compromised` — verification completed and *failed*: the on-chain reserve
 *   maps to a different token than the indexer claimed, or no trusted label
 *   exists for it. Deterministic, so no Retry is offered; retrying a proven
 *   mismatch only trains the user to click past a security warning.
 * - otherwise — verification couldn't complete (RPC/network). Neutral copy and
 *   a Retry button.
 */

import { Button, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

export interface ReserveIdentityBlockProps {
  /** True when the failure is a proven mismatch rather than an RPC fault. */
  compromised: boolean;
  /** Re-run verification. Only rendered when `compromised` is false. */
  onRetry: () => void;
}

export function ReserveIdentityBlock({
  compromised,
  onRetry,
}: ReserveIdentityBlockProps) {
  const { title, description } = compromised
    ? {
        title: COPY.loans.detail.identityBlockedTitle,
        description: COPY.loans.detail.identityBlockedDescription,
      }
    : {
        title: COPY.loans.detail.identityUnavailableTitle,
        description: COPY.loans.detail.identityUnavailableDescription,
      };

  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <Text variant="body1" className="text-center text-accent-primary">
        {title}
      </Text>
      <Text variant="body2" className="text-center text-warning-main">
        {description}
      </Text>
      {!compromised && (
        <Button onClick={onRetry}>{COPY.loans.detail.retry}</Button>
      )}
    </div>
  );
}
