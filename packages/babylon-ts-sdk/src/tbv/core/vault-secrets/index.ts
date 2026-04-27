/**
 * Vault secrets: HKDF-Expand-based derivation of three domain-separated
 * secrets (HTLC hashlock preimage, depositor auth anchor, WOTS seed)
 * from a single 32-byte root.
 *
 * Implements `derive-vault-secrets.md` §2.2 and Appendix A. The root is
 * spec-opaque — callers produce it however they like (today: BIP-39
 * mnemonic → HKDF; tomorrow: `wallet.deriveContextHash`). The SDK is
 * provenance-agnostic and only consumes the 32 bytes.
 *
 * @module tbv/core/vault-secrets
 */

export {
  expandAuthAnchor,
  expandHashlockSecret,
  expandWotsSeed,
} from "./expand";

export { buildFundingOutpointsCommitment, buildVaultContext } from "./context";

export type { FundingOutpoint, VaultContextInput } from "./context";
