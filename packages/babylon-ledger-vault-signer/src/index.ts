/**
 * Host-side client for the Ledger Babylon Vault app: DMK session lifecycle,
 * raw APDU framing over the {@link ApduSender} seam, the silent key read,
 * the device envelope gate, the DERIVE_CONTEXT_HASH / APPROVE_VAULT_INTENT
 * ceremony, the SIGN_PSBT interrupt/continue signing loop
 * ({@link signVaultPsbt}), and the wallet-policy plumbing and the PoP PSBT
 * builder (#2221). Wallet-connector's LedgerVaultProvider is the
 * consuming adapter; this package holds everything device-protocol-shaped and
 * nothing wallet-taxonomy-shaped.
 *
 * @module ledger-vault-signer
 */

// The BIP-86 branch numbers are re-exported, not redefined: the adapter that
// enumerates fundable addresses must label a branch with the same number this
// package encodes into the path the device matches against the policy.
export { BIP86_CHANGE_BRANCH, BIP86_RECEIVE_BRANCH } from "./bip86Path";
export { getExtendedPublicKey, getMasterFingerprintHex, getXOnlyPublicKeyHex } from "./derivation";
export { createDmkApduSender, createDmkRawApduSender } from "./dmkApduSender";
export {
  closeDmk,
  connectDmkSession,
  disconnectDmkSession,
  isSessionAlive,
  refreshSessionApp,
  type DmkSessionHandle,
} from "./dmkSession";
export { assertDepositTermsDeviceCompatible } from "./envelope";
export {
  LEDGER_DEVICE_ERROR_NAME,
  LEDGER_DEVICE_LOCKED_ERROR_NAME,
  LEDGER_SIGN_PSBT_ABORTED_ERROR_NAME,
  LEDGER_SIGN_PSBT_INCOMPLETE_ERROR_NAME,
  LEDGER_SIGN_PSBT_PROTOCOL_ERROR_NAME,
  LEDGER_USER_REFUSED_ERROR_NAME,
  LEDGER_YIELD_MISMATCH_ERROR_NAME,
  LedgerDeviceError,
  LedgerDeviceLockedError,
  LedgerSignPsbtAbortedError,
  LedgerSignPsbtIncompleteError,
  LedgerSignPsbtProtocolError,
  LedgerUserRefusedError,
  LedgerYieldMismatchError,
  isLedgerDeviceError,
  isLedgerDeviceLockedError,
  isLedgerSignPsbtAbortedError,
  isLedgerSignPsbtIncompleteError,
  isLedgerSignPsbtProtocolError,
  isLedgerUserRefusedError,
  isLedgerYieldMismatchError,
  type CollectedYieldRef,
  type LedgerYieldMismatchKind,
} from "./errors";
export type { AuthorizedKeyPathLeaf, ExpectedSignatureTable, InputSigExpectation } from "./expectedSignatures";
export {
  deriveAuthorizedKeyPathLeaves,
  type AuthorizedKeyPathLeaves,
  type DeriveAuthorizedKeyPathLeavesParams,
  type KeyPathLeaf,
} from "./keyPathLeaves";
export {
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  type IntentScalars,
  type IntentVaultGroup,
} from "./intentTlv";
export {
  augmentPsbtForWalletPolicy,
  deriveChangeXOnlyHex,
  deriveReceiveXOnlyHex,
  psbtPaysChangeScript,
  type AugmentPsbtForWalletPolicyParams,
} from "./policyPsbt";
export { buildPopPsbtHex, type BuildPopPsbtParams } from "./popPsbt";
export {
  SW_BAD_STATE,
  SW_CAP_EXCEEDED,
  SW_CLA_NOT_SUPPORTED,
  SW_INS_NOT_SUPPORTED,
  type Apdu,
  type AppIdentity,
  type RawApduResponse,
  type RawApduSender,
} from "./rawApdu";
export {
  assertRefundPsbtSignable,
  augmentPsbtForRefund,
  classifyRefundPsbt,
  type AugmentPsbtForRefundParams,
  type RefundPsbtClassification,
} from "./refundPsbt";
export {
  signPreparedVaultPsbt,
  signVaultPsbt,
  type CollectedYield,
  type SignPreparedVaultPsbtOptions,
  type SignPsbtProgress,
  type SignVaultPsbtParams,
  type SignVaultPsbtResult,
} from "./signPsbt";
export { prepareSignPsbt, type PrepareSignPsbtParams, type PreparedSignPsbt } from "./signPsbtPrepare";
export {
  DEPOSIT_TERMS_REJECTED_ERROR_NAME,
  DepositTermsRejectedError,
  type DepositTerms,
  type DepositTermsRejectionReason,
  type DepositTermsVaultGroup,
} from "./types";
export {
  approveVaultIntent,
  deriveContextHash,
  type ApduSender,
  type ApproveVaultIntentParams,
  type DeriveContextHashParams,
} from "./vaultCommands";
export {
  buildDefaultTaprootPolicy,
  type BuildDefaultTaprootPolicyParams,
  type DefaultTaprootWalletPolicy,
} from "./walletPolicy";
