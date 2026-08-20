/**
 * Re-derive a stranded deposit's per-vault hashlocks from the wallet and the
 * funded Pre-PegIn transaction alone (#2203).
 *
 * An Ethereum reorg that drops the registration takes the vault row with it,
 * so the depositor pubkey, the HTLC vout and the hashlocks are gone. All three
 * are recoverable without a single `vaultId`-keyed read: the depositor pubkey
 * comes from the connected wallet, the vault count from the transaction's
 * auth-anchor OP_RETURN vout, and the hashlocks from the same HKDF pipeline the
 * deposit used.
 *
 * The parameter search that turns these hashlocks back into a refundable
 * template lives in `reconstructPeginParams` and needs no wallet.
 *
 * @module recovery/deriveHashlocksFromPrePegin
 */

import { sha256 } from "@noble/hashes/sha2.js";

import { findAuthAnchorOpReturn } from "../managers/pegin/assertAuthAnchorOpReturn";
import { expandPerVaultSecrets } from "../managers/pegin/expandPerVaultSecrets";
import {
  hexToUint8Array,
  processPublicKeyToXOnly,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../primitives/utils/bitcoin";
import {
  deriveVaultRoot,
  expandAuthAnchor,
  parseFundingOutpointsFromTx,
  type DeriveContextHashCapableWallet,
} from "../vault-secrets";

import {
  UnanchoredPrePeginError,
  VaultRootMismatchError,
} from "./recoveryErrors";

export interface DeriveHashlocksFromPrePeginInput {
  /** Any wallet implementing `deriveContextHash` — the depositor's own. */
  wallet: DeriveContextHashCapableWallet;
  /**
   * Depositor BTC public key, read from the CONNECTED WALLET. The reorg
   * destroyed the row that would normally supply it, and taking it from any
   * chain read would defeat the recovery.
   *
   * Accepted in whatever form the wallet hands back — x-only, 33-byte
   * compressed or 65-byte uncompressed, `0x` optional — and narrowed to x-only
   * here. Wallets return the compressed form from `getPublicKey`, so requiring
   * x-only would make the common case an error.
   */
  depositorBtcPubkey: string;
  /** Funded (broadcast) Pre-PegIn transaction hex, `0x` optional. */
  fundedPrePeginTxHex: string;
}

export interface DeriveHashlocksFromPrePeginResult {
  /** Number of HTLC outputs the transaction funds, from the anchor's vout. */
  vaultCount: number;
  /** 32-byte hex hashlocks (no `0x`), indexed by `htlcVout`. */
  hashlocks: readonly string[];
  /** The transaction's auth-anchor commitment, `SHA256(authAnchor)` as hex. */
  authAnchorHash: string;
}

/**
 * Derive the per-vault hashlocks committed by a funded Pre-PegIn.
 *
 * Validates the re-derived root against the transaction's auth-anchor
 * OP_RETURN before expanding anything else. That check costs one HKDF call,
 * needs zero protocol parameters, and is what separates "wrong wallet,
 * account or network" from "right wallet, no candidate matched" — otherwise
 * both surface as a fruitless parameter search.
 *
 * @throws {UnanchoredPrePeginError} If the transaction carries no single,
 *   unambiguous auth-anchor OP_RETURN.
 * @throws {VaultRootMismatchError} If the derived root does not commit to the
 *   transaction's anchor.
 */
export async function deriveHashlocksFromPrePegin(
  input: DeriveHashlocksFromPrePeginInput,
): Promise<DeriveHashlocksFromPrePeginResult> {
  const { wallet, depositorBtcPubkey, fundedPrePeginTxHex } = input;

  const cleanTxHex = stripHexPrefix(fundedPrePeginTxHex);
  const anchor = findAuthAnchorOpReturn(cleanTxHex);
  if (anchor === undefined) {
    throw new UnanchoredPrePeginError(
      `Pre-PegIn carries no single, unambiguous auth-anchor OP_RETURN, so the ` +
        `number of HTLC outputs it funds cannot be determined. Legacy ` +
        `pre-anchor deposits are not recoverable by this path.`,
    );
  }
  // The anchor sits immediately after the HTLC outputs, so its vout IS the
  // vault count. At vout 0 it would claim a Pre-PegIn that funds nothing.
  const vaultCount = anchor.vout;
  if (vaultCount === 0) {
    throw new UnanchoredPrePeginError(
      `Pre-PegIn's auth-anchor OP_RETURN is at vout 0, implying zero HTLC ` +
        `outputs; there is nothing to recover.`,
    );
  }

  const fundingOutpoints = parseFundingOutpointsFromTx(cleanTxHex);

  const root = await deriveVaultRoot(wallet, {
    // The vault context takes the 32-byte x-only key; a wallet's compressed
    // key would otherwise fail a byte-length check deep in the encoder with
    // nothing pointing back at the caller.
    depositorBtcPubkey: hexToUint8Array(
      processPublicKeyToXOnly(depositorBtcPubkey),
    ),
    fundingOutpoints,
  });

  // Ordering is load-bearing: `expandPerVaultSecrets` takes ownership of
  // `root` and zeroes it, so the anchor expansion must run first. On any
  // throw in this window nothing else will wipe the root, so wipe it here.
  try {
    const authAnchorBytes = await expandAuthAnchor(root);
    let derivedAuthAnchorHash: string;
    try {
      derivedAuthAnchorHash = uint8ArrayToHex(sha256(authAnchorBytes));
    } finally {
      authAnchorBytes.fill(0);
    }
    if (derivedAuthAnchorHash !== anchor.hash) {
      throw new VaultRootMismatchError(derivedAuthAnchorHash, anchor.hash);
    }
  } catch (err) {
    root.fill(0);
    throw err;
  }

  // Shares the deposit-time expansion rather than a hashlock-only variant, so
  // the two can never drift. Its WOTS output is unused here and dropped with
  // the result object; refunding spends the timelock leaf, not the preimage.
  const { hashlocks } = await expandPerVaultSecrets(root, vaultCount);

  return { vaultCount, hashlocks, authAnchorHash: anchor.hash };
}
