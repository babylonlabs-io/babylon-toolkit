/**
 * Per-purpose derivation of the per-vault HTLC `hashlockSecret` — a
 * 32-byte preimage. `SHA256(hashlockSecret)` is committed as the HTLC
 * taproot hashlock at vout = `htlcVout` in the Pre-PegIn. The raw
 * preimage is revealed on Ethereum via `activateVaultWithSecret`.
 *
 * @module vault-secrets/deriveHashlockSecret
 */

import { buildPerVaultContext, type VaultContextInput } from "./context";
import {
  deriveContextHashBytes,
  type DeriveContextHashCapableWallet,
} from "./walletDerive";

/**
 * Wallet `appName` for hashlock-secret derivation. Shown in the
 * wallet's approval dialog so the user can recognise the request as a
 * Babylon vault hashlock derivation.
 *
 * @stability frozen — on-chain-binding (commits to the HTLC taproot
 * script). Any change rotates the secret and prevents activation of
 * existing vaults.
 */
export const HASHLOCK_APP_NAME = "babylon-btc-vault-hashlock";

/**
 * Derive the per-vault HTLC hashlock secret by calling the wallet's
 * `deriveContextHash` directly with a per-purpose label and a context
 * that includes the BTC vault's `htlcVout`.
 *
 * @returns 32-byte secret returned by the wallet.
 */
export async function deriveHashlockSecret(
  wallet: DeriveContextHashCapableWallet,
  input: VaultContextInput,
  htlcVout: number,
): Promise<Uint8Array> {
  return deriveContextHashBytes(
    wallet,
    HASHLOCK_APP_NAME,
    buildPerVaultContext(input, htlcVout),
  );
}
