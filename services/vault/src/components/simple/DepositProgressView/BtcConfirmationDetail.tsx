import { Loader, Text } from "@babylonlabs-io/core-ui";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import { getBtcExplorerTxUrl } from "@/utils/explorer";

import { computeRemainingEstimateMinutes } from "./btcConfirmationProgress";

interface BtcConfirmationDetailProps {
  /** Date.now() when the AWAIT_BTC_CONFIRMATION step was first entered. */
  startedAt: number;
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
  /** Confirmations of the Pre-PegIn tx; null while the first reading loads. */
  confirmations: number | null;
  /** Protocol-required confirmation depth (`minPrepeginDepth`). */
  requiredDepth: number;
}

function formatStartedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BtcConfirmationDetail({
  startedAt,
  prePeginTxid,
  confirmations,
  requiredDepth,
}: BtcConfirmationDetailProps) {
  const copy = COPY.deposit.btcConfirmation;

  // undefined = still loading; null = depth reached (finalizing); number = wait.
  const estimateMinutes =
    confirmations === null
      ? undefined
      : computeRemainingEstimateMinutes(confirmations, requiredDepth);

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
          {copy.confirmations}:
        </Text>
        {confirmations === null ? (
          <Loader size={14} className="text-accent-primary" />
        ) : (
          <Text as="span" variant="body2" className="text-accent-primary">
            {copy.confirmationProgress(
              Math.min(confirmations, requiredDepth),
              requiredDepth,
            )}
          </Text>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          {copy.estRemaining}:
        </Text>
        {estimateMinutes === undefined ? (
          <Loader size={14} className="text-accent-primary" />
        ) : (
          <Text as="span" variant="body2" className="text-accent-primary">
            {estimateMinutes === null
              ? copy.finalizing
              : copy.estRemainingValue(estimateMinutes)}
          </Text>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          {copy.bitcoinTx}:
        </Text>
        <CopyableHash
          hash={prePeginTxid}
          chain="BTC"
          explorerUrl={getBtcExplorerTxUrl(prePeginTxid)}
        />
      </div>
    </div>
  );
}
