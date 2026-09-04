import { Loader, Text } from "@babylonlabs-io/core-ui";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import { getBtcExplorerTxUrl } from "@/utils/explorer";

import { computeRemainingEstimateMinutes } from "./btcConfirmationProgress";

interface BtcConfirmationDetailProps {
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
  /** Confirmations of the Pre-PegIn tx; null while the first reading loads. */
  confirmations: number | null;
  /** Protocol-required confirmation depth (`minPrepeginDepth`). */
  requiredDepth: number;
}

/**
 * Combined estimate text: minutes left plus the count of BTC blocks still
 * to be mined. Once the depth is reached there is no wait left to estimate,
 * so it switches to the provider payout-prep wait.
 */
function formatEstimate(confirmations: number, requiredDepth: number): string {
  const copy = COPY.deposit.btcConfirmation;
  const minutes = computeRemainingEstimateMinutes(confirmations, requiredDepth);
  if (minutes === null) return copy.waitingForPayoutPrep;
  return copy.estRemainingValue(minutes, requiredDepth - confirmations);
}

export function BtcConfirmationDetail({
  prePeginTxid,
  confirmations,
  requiredDepth,
}: BtcConfirmationDetailProps) {
  const copy = COPY.deposit.btcConfirmation;
  const depthReached = confirmations !== null && confirmations >= requiredDepth;

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-secondary-highlight p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          {depthReached ? COPY.deposit.waitDetails.status : copy.estRemaining}:
        </Text>
        {confirmations === null ? (
          <Loader size={14} className="text-accent-primary" />
        ) : (
          <Text as="span" variant="body2" className="text-accent-primary">
            {formatEstimate(confirmations, requiredDepth)}
          </Text>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
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
