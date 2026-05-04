/**
 * Vault secrets — per-purpose `deriveContextHash` helpers for the
 * three Babylon BTC vault secret types: auth anchor, hashlock secret,
 * WOTS seed. Each helper calls the wallet directly with a distinct
 * `appName` label so a single phishing approval cannot compromise
 * more than one secret type.
 *
 * @module tbv/core/vault-secrets
 */

export { buildFundingOutpointsCommitment, buildVaultContext, buildPerVaultContext } from "./context";
export type { FundingOutpoint, VaultContextInput } from "./context";

export { deriveAuthAnchor, AUTH_ANCHOR_APP_NAME } from "./deriveAuthAnchor";
export { deriveHashlockSecret, HASHLOCK_APP_NAME } from "./deriveHashlockSecret";
export {
  deriveWotsSeed,
  WOTS_SEED_LO_APP_NAME,
  WOTS_SEED_HI_APP_NAME,
} from "./deriveWotsSeed";

export type { DeriveContextHashCapableWallet } from "./walletDerive";

export { parseFundingOutpointsFromTx } from "./parseFundingOutpoints";
