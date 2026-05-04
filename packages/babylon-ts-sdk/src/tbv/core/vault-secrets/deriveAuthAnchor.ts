/**
 * Per-purpose derivation of the depositor `authAnchor` — a 32-byte
 * preimage shared across every BTC vault funded by the same Pre-PegIn
 * transaction.
 *
 * `SHA256(authAnchor)` is committed in the single `OP_RETURN` output
 * of the Pre-PegIn. The raw preimage is revealed off-chain to the
 * vault provider's `auth_createDepositorToken` RPC in exchange for a
 * short-lived CWT bearer token.
 *
 * @module vault-secrets/deriveAuthAnchor
 */

import { buildVaultContext, type VaultContextInput } from "./context";
import {
  deriveContextHashBytes,
  type DeriveContextHashCapableWallet,
} from "./walletDerive";

/**
 * Wallet `appName` for auth-anchor derivation. Shown in the wallet's
 * approval dialog so the user can recognise the request as a Babylon
 * vault auth-token derivation.
 *
 * @stability frozen — on-chain-binding (commits to the Pre-PegIn
 * `OP_RETURN`). Any change rotates the anchor and breaks the auth
 * surface for existing Pre-PegIns.
 */
export const AUTH_ANCHOR_APP_NAME = "babylon-btc-vault-auth";

/**
 * Derive the per-Pre-PegIn auth anchor by calling the wallet's
 * `deriveContextHash` directly with a per-purpose label.
 *
 * @returns 32-byte anchor returned by the wallet.
 */
export async function deriveAuthAnchor(
  wallet: DeriveContextHashCapableWallet,
  input: VaultContextInput,
): Promise<Uint8Array> {
  return deriveContextHashBytes(
    wallet,
    AUTH_ANCHOR_APP_NAME,
    buildVaultContext(input),
  );
}
