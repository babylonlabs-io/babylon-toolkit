/**
 * Host-side client for the Ledger Babylon Vault app: DMK session lifecycle,
 * raw APDU framing over the {@link ApduSender} seam, the silent key read,
 * the device envelope gate, and the DERIVE_CONTEXT_HASH / APPROVE_VAULT_INTENT
 * ceremony. Wallet-connector's LedgerVaultProvider is the consuming adapter;
 * this package holds everything device-protocol-shaped and nothing
 * wallet-taxonomy-shaped.
 *
 * @module ledger-vault-signer
 */

export { getXOnlyPublicKeyHex } from "./derivation";
export { createDmkApduSender } from "./dmkApduSender";
export { closeDmk, connectDmkSession, disconnectDmkSession, isSessionAlive, type DmkSessionHandle } from "./dmkSession";
export { assertDepositTermsDeviceCompatible } from "./envelope";
export {
  LEDGER_DEVICE_ERROR_NAME,
  LEDGER_DEVICE_LOCKED_ERROR_NAME,
  LEDGER_USER_REFUSED_ERROR_NAME,
  LedgerDeviceError,
  LedgerDeviceLockedError,
  LedgerUserRefusedError,
  isLedgerDeviceError,
  isLedgerDeviceLockedError,
  isLedgerUserRefusedError,
} from "./errors";
export {
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  type IntentScalars,
  type IntentVaultGroup,
} from "./intentTlv";
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
