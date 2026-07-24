/**
 * ActivityHashLink — the v3 activity row's transaction-hash cell.
 *
 * The v3 design drops copy-to-clipboard in favour of a single open-in-explorer
 * affordance: the truncated hash, underlined, followed by an external-link
 * arrow (Figma 10233:50689). The whole thing is one link. Rows outside the v3
 * activity list keep using CopyableHash.
 *
 * BTC hashes are displayed without the 0x prefix (Bitcoin convention); EVM
 * hashes keep it.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { RiArrowRightUpLine } from "react-icons/ri";

import type { HashChain } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import { truncateHash } from "@/utils/addressUtils";

const EXTERNAL_ICON_SIZE = 16;

interface ActivityHashLinkProps {
  /** Raw hash (may have 0x prefix) */
  hash: string;
  /** Source chain — determines whether the 0x prefix is stripped for display */
  chain: HashChain;
  /** Explorer URL the row opens in a new tab. */
  explorerUrl: string;
}

export function ActivityHashLink({
  hash,
  chain,
  explorerUrl,
}: ActivityHashLinkProps) {
  const truncated = truncateHash(chain === "BTC" ? stripHexPrefix(hash) : hash);

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={COPY.activity.viewTransaction(chain, truncated)}
      className="flex items-center gap-2 text-sm leading-[1.43] tracking-[0.17px] text-accent-primary transition-colors hover:text-accent-secondary"
    >
      {/* The underline sits on the text alone: on the anchor it propagates to
          the arrow, and a descendant `no-underline` does not lift it. */}
      <span className="underline">{truncated}</span>
      <RiArrowRightUpLine
        size={EXTERNAL_ICON_SIZE}
        aria-hidden
        className="shrink-0"
      />
    </a>
  );
}
