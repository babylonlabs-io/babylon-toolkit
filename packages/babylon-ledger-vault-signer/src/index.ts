/**
 * Host-side client for the Ledger Babylon Vault app: DMK session lifecycle,
 * raw APDU framing over the {@link ApduSender} seam, the silent key read,
 * the device envelope gate, the DERIVE_CONTEXT_HASH / APPROVE_VAULT_INTENT
 * ceremony, and the SIGN_PSBT interrupt/continue signing loop
 * ({@link signVaultPsbt}). Wallet-connector's LedgerVaultProvider is the
 * consuming adapter; this package holds everything device-protocol-shaped and
 * nothing wallet-taxonomy-shaped.
 *
 * @module ledger-vault-signer
 */

export { getXOnlyPublicKeyHex } from "./derivation";
export { createDmkApduSender, createDmkRawApduSender } from "./dmkApduSender";
export { closeDmk, connectDmkSession, disconnectDmkSession, isSessionAlive, type DmkSessionHandle } from "./dmkSession";
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
export {
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  type IntentScalars,
  type IntentVaultGroup,
} from "./intentTlv";
export { type Apdu, type AppIdentity, type RawApduResponse, type RawApduSender } from "./rawApdu";
export {
  signPreparedVaultPsbt,
  signVaultPsbt,
  type CollectedYield,
  type SignPreparedVaultPsbtOptions,
  type SignPsbtProgress,
  type SignVaultPsbtParams,
  type SignVaultPsbtResult,
} from "./signPsbt";
export { prepareSignPsbt, type PreparedSignPsbt } from "./signPsbtPrepare";
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
