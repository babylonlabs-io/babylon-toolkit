// Withdrawal "TX Hash" row: Claim + Assert hashes, each copyable. Links gated
// on status (txids exist before broadcast) — see getPegoutTxLinkFlags.

import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import { getPegoutTxLinkFlags } from "@/models/pegoutStateMachine";
import { getBtcExplorerTxUrl } from "@/utils/explorer";

import { VaultCardRow } from "./VaultCardShell";

interface PegoutTxHashRowProps {
  /** Claim BTC tx id (hex). From the VP claimer pegout status. */
  claimTxHash?: string;
  /** Assert BTC tx id (hex). From the VP claimer pegout status. */
  assertTxHash?: string;
  /** Claimer status — decides which txs are on-chain and therefore linkable. */
  claimerStatus?: string;
}

function HashSegment({
  label,
  hash,
  explorerUrl,
}: {
  label: string;
  hash: string;
  explorerUrl?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-sm text-accent-secondary">{label}</span>
      <CopyableHash hash={hash} chain="BTC" explorerUrl={explorerUrl} />
    </span>
  );
}

export function PegoutTxHashRow({
  claimTxHash,
  assertTxHash,
  claimerStatus,
}: PegoutTxHashRowProps) {
  if (!claimTxHash && !assertTxHash) return null;

  const { linkClaim, linkAssert } = getPegoutTxLinkFlags(claimerStatus);

  return (
    <VaultCardRow label={COPY.pegout.txHash.label}>
      <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {claimTxHash && (
          <HashSegment
            label={COPY.pegout.txHash.claimLabel}
            hash={claimTxHash}
            explorerUrl={
              linkClaim ? getBtcExplorerTxUrl(claimTxHash) : undefined
            }
          />
        )}
        {claimTxHash && assertTxHash && (
          <span
            aria-hidden
            className="h-4 w-px shrink-0 bg-secondary-strokeLight"
          />
        )}
        {assertTxHash && (
          <HashSegment
            label={COPY.pegout.txHash.assertLabel}
            hash={assertTxHash}
            explorerUrl={
              linkAssert ? getBtcExplorerTxUrl(assertTxHash) : undefined
            }
          />
        )}
      </span>
    </VaultCardRow>
  );
}
