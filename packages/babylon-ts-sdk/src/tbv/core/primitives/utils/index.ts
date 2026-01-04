/**
 * Utility Functions
 *
 * Pure utility functions for Bitcoin operations
 *
 * @module primitives/utils
 */

export {
  hexToUint8Array,
  isValidHex,
  processPublicKeyToXOnly,
  stripHexPrefix,
  toXOnly,
  uint8ArrayToHex,
  validateWalletPubkey,
  type WalletPubkeyValidationResult,
} from "./bitcoin";
