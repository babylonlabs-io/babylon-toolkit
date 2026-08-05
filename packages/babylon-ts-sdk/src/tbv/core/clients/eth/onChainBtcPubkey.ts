/**
 * The single validator that mints {@link OnChainBtcPubkey}.
 *
 * Extracted from `ViemVaultRegistryReader.getVaultProviderBtcPubKey` so that
 * RFC-006 operation-key resolution can produce branded keys through exactly
 * the same checks, rather than casting past the brand. Every producer of an
 * `OnChainBtcPubkey` must go through here.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import type { Hex } from "viem";

import { hexToUint8Array } from "../../primitives/utils/bitcoin";
import type { OnChainBtcPubkey } from "./types";

/**
 * Validate a registry-returned `bytes32` as an x-only BTC pubkey and mint the
 * brand. Checks length, hex form, and secp256k1 curve membership. Returns
 * 64-char lowercase hex without the `0x` prefix.
 *
 * `label` identifies the read site in error messages (e.g.
 * `getVaultProviderBTCKey (vp=0x…)`), so a failure names which participant and
 * which getter produced it.
 *
 * A zero hash fails the curve check, so an unregistered operator or an epoch
 * with no bonded key surfaces as an error rather than a silent all-zero key.
 */
export function assertOnChainBtcPubkey(
  value: Hex,
  label: string,
): OnChainBtcPubkey {
  const lowered = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(lowered)) {
    throw new Error(
      `${label} returned an unexpected value (length ${lowered.length}, prefix "${lowered.slice(0, 2)}")`,
    );
  }
  const stripped = lowered.slice(2);
  if (!ecc.isXOnlyPoint(hexToUint8Array(stripped))) {
    throw new Error(
      `${label} returned a value that is not on the secp256k1 curve`,
    );
  }
  return stripped as OnChainBtcPubkey;
}
