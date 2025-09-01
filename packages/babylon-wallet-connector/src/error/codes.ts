export const ERROR_CODES = {
  // ===== General/Common Errors =====
  UNKNOWN_ERROR: "UNKNOWN_ERROR", // Fallback
  INVALID_PARAMS: "INVALID_PARAMS", // Validation error
  CONNECTION_FAILED: "CONNECTION_FAILED", // Connection error
  METHOD_NOT_IMPLEMENTED: "METHOD_NOT_IMPLEMENTED", // Unimplemented feature
  MAX_ITERATION_EXCEEDED: "MAX_ITERATION_EXCEEDED", // Exceeded allowed iterations

  // ===== Wallet Extension/Provider =====
  EXTENSION_NOT_FOUND: "EXTENSION_NOT_FOUND", // Extension missing
  EXTENSION_CONTEXT_INVALIDATED: "EXTENSION_CONTEXT_INVALIDATED", // Context invalidated
  CONNECTION_REJECTED: "CONNECTION_REJECTED", // User rejected
  CONNECTION_CANCELED: "CONNECTION_CANCELED", // User canceled
  CHAIN_ID_NOT_INITIALIZED: "CHAIN_ID_NOT_INITIALIZED", // Chain ID missing
  RPC_URL_NOT_INITIALIZED: "RPC_URL_NOT_INITIALIZED", // RPC URL missing
  FAILED_TO_ADD_CHAIN: "FAILED_TO_ADD_CHAIN", // Add chain failed
  FAILED_TO_GET_KEY: "FAILED_TO_GET_KEY", // Key fetch failed
  WALLET_INITIALIZATION_FAILED: "WALLET_INITIALIZATION_FAILED", // Wallet initialization failed
  WALLET_NOT_CONNECTED: "WALLET_NOT_CONNECTED", // Not connected
  INCOMPATIBLE_WALLET_VERSION: "INCOMPATIBLE_WALLET_VERSION", // Version mismatch
  NETWORK_NOT_ENABLED_IN_WALLET: "NETWORK_NOT_ENABLED_IN_WALLET", // Network not enabled

  // ===== Bitcoin/PSBT/Address =====
  INVALID_PUBLIC_KEY: "INVALID_PUBLIC_KEY", // Invalid public key
  ADDRESS_GENERATION_FAILED: "ADDRESS_GENERATION_FAILED", // Address generation failed
  UNSUPPORTED_NETWORK: "UNSUPPORTED_NETWORK", // Network unsupported
  INVALID_ADDRESS_PREFIX: "INVALID_ADDRESS_PREFIX", // Address prefix invalid
  MISSING_PSBT_HEX: "MISSING_PSBT_HEX", // PSBT hex missing
  PSBT_HEX_REQUIRED: "PSBT_HEX_REQUIRED", // PSBT hex required
  PSBTS_HEXES_REQUIRED: "PSBTS_HEXES_REQUIRED", // Multiple PSBT hexes required
  SIGNATURE_EXTRACT_ERROR: "SIGNATURE_EXTRACT_ERROR", // Signature extraction failed
  GENERATION_ERROR: "GENERATION_ERROR", // General generation error
  ADDRESS_NOT_FOUND: "ADDRESS_NOT_FOUND", // Address not found
  PUBLIC_KEY_NOT_FOUND: "PUBLIC_KEY_NOT_FOUND", // Public key not found
  EMPTY_WITNESS_STACK: "EMPTY_WITNESS_STACK", // Witness stack is empty

  // ===== QR/Hardware Wallet =====
  QR_READ_ERROR: "QR_READ_ERROR", // QR read failed
  QR_SCAN_ERROR: "QR_SCAN_ERROR", // QR scan failed

  // ===== Inscriptions/Network =====
  INSCRIPTIONS_UNSUPPORTED_NETWORK: "INSCRIPTIONS_UNSUPPORTED_NETWORK", // Inscriptions unsupported
  INSCRIPTION_FETCH_ERROR: "INSCRIPTION_FETCH_ERROR", // Inscription fetch failed
};
