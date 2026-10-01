/**
 * The vault context of an existing deposit, rebuilt at claim time from chain
 * and mempool instead of from the deposit flow's in-memory state.
 *
 * A composer over the frozen primitives, not a new derivation: it hands
 * `buildVaultContext` exactly the bytes the deposit-time path hands it — the
 * on-chain `depositorBtcPubKey` as raw bytes, and the funding outpoints parsed
 * out of the Pre-PegIn (`htlcSecretDerivation.ts` in services/vault builds the
 * same pair). Nothing here changes a byte layout, so no golden vector moves.
 *
 * @module vault-secrets/buildVaultContextInputForClaim
 */

import type { Hex } from "viem";

import { hexToUint8Array } from "../primitives/utils/bitcoin";
import { calculateBtcTxHash } from "../utils/transaction/btcTxHash";
import { X_ONLY_PUBKEY_HEX_LEN } from "../utils/validation";
import type { VaultContextInput } from "./context";
import { parseFundingOutpointsFromTx } from "./parseFundingOutpoints";

const X_ONLY_PUBKEY_BYTES = X_ONLY_PUBKEY_HEX_LEN / 2;

/** @experimental */
export interface BuildVaultContextInputForClaimParams {
  /** `VaultBasicInfo.depositorBtcPubKey`, the registered 32-byte x-only key. */
  depositorBtcPubKey: Hex;
  /** The Pre-PegIn as broadcast; its inputs are the vault's funding outpoints. */
  fundedPrePeginTxHex: string;
  /** `VaultProtocolInfo.prePeginTxHash`, which the hex must hash to. */
  prePeginTxHash: Hex;
}

/**
 * @throws When the transaction does not hash to the vault's `prePeginTxHash`,
 *         or the registered key is not 32 bytes.
 * @experimental
 */
export function buildVaultContextInputForClaim(
  params: BuildVaultContextInputForClaimParams,
): VaultContextInput {
  const computed = calculateBtcTxHash(params.fundedPrePeginTxHex).toLowerCase();
  const expected = params.prePeginTxHash.toLowerCase();
  if (computed !== expected) {
    throw new Error(
      `Pre-PegIn transaction hashes to ${computed}, expected ${expected} ` +
        `(on-chain prePeginTxHash); refusing to derive from it.`,
    );
  }

  const depositorBtcPubkey = hexToUint8Array(params.depositorBtcPubKey);
  if (depositorBtcPubkey.length !== X_ONLY_PUBKEY_BYTES) {
    throw new Error(
      `depositorBtcPubKey must be ${X_ONLY_PUBKEY_BYTES} bytes (x-only), got ` +
        `${depositorBtcPubkey.length}.`,
    );
  }

  return {
    depositorBtcPubkey,
    fundingOutpoints: parseFundingOutpointsFromTx(params.fundedPrePeginTxHex),
  };
}
