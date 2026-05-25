/**
 * PeginTxHashRow — the "TX Hash" row showing a deposit's Pegin and Pre-Pegin
 * Bitcoin transaction hashes side by side, each with copy-to-clipboard.
 *
 * The depositor broadcasts the Pre-PegIn tx early in the flow, so it is
 * generally linkable to the explorer. The peg-in tx is only on Bitcoin once the
 * vault provider broadcasts it (vault active), so its explorer link is gated via
 * `linkPegin` — copy-only otherwise.
 *
 * Renders nothing when neither hash is available.
 */

import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import { getBtcExplorerTxUrl } from "@/utils/explorer";

import { VaultCardRow } from "./VaultCardShell";

interface PeginTxHashRowProps {
  /** Raw BTC peg-in transaction hash (hex, may include 0x prefix). */
  peginTxHash?: string;
  /** Pre-PegIn transaction hash (hex, may include 0x prefix). */
  prePeginTxHash?: string;
  /**
   * Link the peg-in hash to the BTC explorer. Off by default because the peg-in
   * tx is not on Bitcoin until the vault provider broadcasts it (vault active).
   */
  linkPegin?: boolean;
  /**
   * Link the Pre-PegIn hash to the BTC explorer. On by default — the depositor
   * broadcasts the Pre-PegIn early in the deposit flow.
   */
  linkPrePegin?: boolean;
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

export function PeginTxHashRow({
  peginTxHash,
  prePeginTxHash,
  linkPegin = false,
  linkPrePegin = true,
}: PeginTxHashRowProps) {
  if (!peginTxHash && !prePeginTxHash) return null;

  return (
    <VaultCardRow label={COPY.pegin.txHash.label}>
      <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {peginTxHash && (
          <HashSegment
            label={COPY.pegin.txHash.pegin}
            hash={peginTxHash}
            explorerUrl={
              linkPegin ? getBtcExplorerTxUrl(peginTxHash) : undefined
            }
          />
        )}
        {peginTxHash && prePeginTxHash && (
          <span
            aria-hidden
            className="h-4 w-px shrink-0 bg-secondary-strokeLight"
          />
        )}
        {prePeginTxHash && (
          <HashSegment
            label={COPY.pegin.txHash.prePegin}
            hash={prePeginTxHash}
            explorerUrl={
              linkPrePegin ? getBtcExplorerTxUrl(prePeginTxHash) : undefined
            }
          />
        )}
      </span>
    </VaultCardRow>
  );
}
