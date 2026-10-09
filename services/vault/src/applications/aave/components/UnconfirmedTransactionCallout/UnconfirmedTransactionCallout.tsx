/**
 * UnconfirmedTransactionCallout
 *
 * Takes the place of a loan or collateral form's status callout while an Aave
 * transaction from this wallet has been broadcast but has not confirmed
 * within the receipt wait. Nothing about it is a failure, so it is an info
 * callout, never "Transaction failed".
 *
 * The hash link opens the explorer in a new tab, or copies the hash on
 * touch-first devices, so following it never navigates this page away and
 * drops the in-memory lock (see `pendingAaveWrite.ts`).
 */

import { Callout } from "@babylonlabs-io/core-ui";

import { ActivityHashLink } from "@/components/Activity/ActivityHashLink";
import { COPY } from "@/copy";
import { getExplorerTxUrl } from "@/utils/explorer";

import type { UnconfirmedAaveWrite } from "../../services/pendingAaveWrite";

const UNCONFIRMED_COPY = COPY.common.unconfirmedTransaction;

interface UnconfirmedTransactionCalloutProps {
  write: UnconfirmedAaveWrite;
  className?: string;
}

export function UnconfirmedTransactionCallout({
  write,
  className,
}: UnconfirmedTransactionCalloutProps) {
  const { hash, stopWaiting } = write;

  return (
    <Callout
      variant="info"
      title={UNCONFIRMED_COPY.title}
      className={className}
      actions={
        stopWaiting
          ? [
              {
                label: UNCONFIRMED_COPY.stopWaiting,
                onClick: stopWaiting,
                emphasis: "secondary",
              },
            ]
          : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <span>{UNCONFIRMED_COPY.body}</span>
        {stopWaiting && <span>{UNCONFIRMED_COPY.stopWaitingHint}</span>}
        <ActivityHashLink
          hash={hash}
          chain="ETH"
          explorerUrl={getExplorerTxUrl("ETH", hash)}
        />
      </div>
    </Callout>
  );
}
