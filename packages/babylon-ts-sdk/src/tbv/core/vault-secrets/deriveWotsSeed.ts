/**
 * Per-purpose derivation of the per-vault 64-byte `wotsSeed`, fed into
 * `deriveWotsBlocksFromSeed` to produce the one-time signature
 * keypairs used for the BTC vault's BaBe / claim-graph commitments
 * and Assert-path signing.
 *
 * `wallet.deriveContextHash` returns 32 bytes per call but the WOTS
 * algorithm requires a 64-byte seed (matched byte-for-byte against
 * `babe::wots`). The seed is therefore assembled from two
 * independently-labelled `deriveContextHash` calls — one for the low
 * 32 bytes, one for the high 32 bytes — then concatenated.
 *
 * Phishing model: a single phishing approval gives the attacker only
 * one half of the WOTS seed; full WOTS compromise requires both
 * approvals. Same friction property as the per-purpose pattern for
 * the auth and hashlock secrets.
 *
 * Only the `keccak256` hash of the derived public keys appears
 * on-chain as `depositorWotsPkHash`.
 *
 * @module vault-secrets/deriveWotsSeed
 */

import { buildPerVaultContext, type VaultContextInput } from "./context";
import {
  deriveContextHashBytes,
  type DeriveContextHashCapableWallet,
} from "./walletDerive";

const WOTS_HALF_SIZE = 32;
const WOTS_SEED_SIZE = WOTS_HALF_SIZE * 2;

/**
 * Wallet `appName` for the low half of the WOTS seed.
 *
 * @stability frozen — on-chain-binding via `depositorWotsPkHash`. Any
 * change rotates the seed and invalidates existing WOTS commitments.
 */
export const WOTS_SEED_LO_APP_NAME = "babylon-btc-vault-wots-lo";

/**
 * Wallet `appName` for the high half of the WOTS seed.
 *
 * @stability frozen — on-chain-binding via `depositorWotsPkHash`. Any
 * change rotates the seed and invalidates existing WOTS commitments.
 */
export const WOTS_SEED_HI_APP_NAME = "babylon-btc-vault-wots-hi";

/**
 * Derive the per-vault 64-byte WOTS seed via two
 * `deriveContextHash` calls (low half + high half) and concatenate.
 *
 * Both half-buffers (`lo`, `hi`) are zeroed before return, including on
 * the throw path where the `hi` call fails after `lo` succeeded —
 * leaving an unwiped half in memory would defeat the per-purpose
 * isolation we get from the two-call construction.
 *
 * @returns 64-byte seed.
 */
export async function deriveWotsSeed(
  wallet: DeriveContextHashCapableWallet,
  input: VaultContextInput,
  htlcVout: number,
): Promise<Uint8Array> {
  const context = buildPerVaultContext(input, htlcVout);
  const lo = await deriveContextHashBytes(
    wallet,
    WOTS_SEED_LO_APP_NAME,
    context,
  );
  try {
    const hi = await deriveContextHashBytes(
      wallet,
      WOTS_SEED_HI_APP_NAME,
      context,
    );
    try {
      const seed = new Uint8Array(WOTS_SEED_SIZE);
      seed.set(lo, 0);
      seed.set(hi, WOTS_HALF_SIZE);
      return seed;
    } finally {
      hi.fill(0);
    }
  } finally {
    lo.fill(0);
  }
}
