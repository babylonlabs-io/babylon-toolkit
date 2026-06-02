/**
 * CopyableHash — displays a truncated transaction hash with copy-to-clipboard.
 *
 * BTC hashes are displayed without the 0x prefix (Bitcoin convention).
 * EVM hashes keep the 0x prefix (Ethereum convention).
 * If explorerUrl is provided, the hash text opens the explorer in a new tab.
 */

import { CheckIcon, CopyIcon, useCopy } from "@babylonlabs-io/core-ui";
import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { truncateHash } from "@/utils/addressUtils";

const COPY_ICON_SIZE = 14;

export type HashChain = "BTC" | "ETH";

interface CopyableHashProps {
  /** Raw hash (may have 0x prefix) */
  hash: string;
  /** Source chain — determines whether the 0x prefix is stripped for display */
  chain: HashChain;
  /** Optional explorer URL. When set, the hash text becomes an external link. */
  explorerUrl?: string;
  /** When true, render a small BTC/ETH tag in front of the hash (useful in mixed-chain lists). */
  showChainBadge?: boolean;
  /** Whether the value is a transaction hash (default) or an address. Affects
   *  the copy button's aria-label so screen readers announce the correct kind. */
  kind?: "tx" | "address";
}

function formatForChain(hash: string, chain: HashChain): string {
  return chain === "BTC" ? stripHexPrefix(hash) : hash;
}

export function CopyableHash({
  hash,
  chain,
  explorerUrl,
  showChainBadge = false,
  kind = "tx",
}: CopyableHashProps) {
  const { isCopied, copyToClipboard } = useCopy();
  const displayHash = formatForChain(hash, chain);
  const truncated = truncateHash(displayHash);
  const copyLabel = `Copy ${chain} ${kind === "address" ? "address" : "transaction hash"} ${truncated}`;

  return (
    <span className="flex items-center gap-1.5 font-mono text-sm">
      {showChainBadge && (
        <span
          className="tracking-wide rounded border border-secondary-strokeLight px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase text-accent-secondary"
          aria-label={`${chain} chain`}
        >
          {chain}
        </span>
      )}
      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-primary"
        >
          {truncated}
        </a>
      ) : (
        // No explorer link — render in the secondary (dimmer) color so the
        // hash reads as informational text, not a clickable link. Without
        // this, non-linked hashes pick up `text-accent-primary` and look
        // identical to the linked siblings sitting next to them.
        <span className="text-accent-secondary">{truncated}</span>
      )}
      <button
        type="button"
        onClick={() => copyToClipboard(hash, displayHash)}
        aria-label={copyLabel}
        className="flex cursor-pointer items-center text-accent-secondary transition-colors hover:text-accent-primary"
      >
        {isCopied(hash) ? (
          <CheckIcon size={COPY_ICON_SIZE} variant="success" />
        ) : (
          <CopyIcon size={COPY_ICON_SIZE} />
        )}
      </button>
    </span>
  );
}
