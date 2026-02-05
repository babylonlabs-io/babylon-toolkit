/**
 * @packageDocumentation
 *
 * # Vault Primitives
 *
 * Pure functions for vault operations with no wallet dependencies.
 * These functions wrap the WASM implementation and provide:
 *
 * - **PSBT Building** - Create unsigned PSBTs for peg-in and payout transactions
 * - **Script Creation** - Generate taproot scripts for vault spending conditions
 * - **Signature Extraction** - Extract Schnorr signatures from signed PSBTs
 * - **Bitcoin Utilities** - Public key conversion, hex manipulation, validation
 *
 * ## Architecture
 *
 * Primitives are the lowest level of the SDK, sitting directly above the Rust WASM core:
 *
 * ```
 * Your Application
 *       ↓
 * Managers (Level 2)      ← High-level orchestration with wallet integration
 *       ↓
 * Primitives (Level 1)    ← Pure functions (this module)
 *       ↓
 * WASM (Rust Core)        ← Cryptographic operations
 * ```
 *
 * ## When to Use Primitives
 *
 * Use primitives when you need:
 * - **Full control** over every operation
 * - **Custom wallet integrations** (KMS/HSM, hardware wallets)
 * - **Backend services** with custom signing flows
 * - **Serverless environments** with specific requirements
 *
 * For frontend apps with browser wallet integration, consider using
 * the managers module instead (PeginManager and PayoutManager).
 *
 * ## Key Exports
 *
 * ### PSBT Builders
 * - {@link buildPeginPsbt} - Create unfunded peg-in transaction
 * - {@link buildPayoutPsbt} - Create payout PSBT for signing
 * - {@link extractPayoutSignature} - Extract Schnorr signature from signed PSBT
 *
 * ### Script Generators
 * - {@link createPayoutScript} - Generate taproot payout script
 *
 * ### Bitcoin Utilities
 * - {@link processPublicKeyToXOnly} - Convert any pubkey format to x-only
 * - {@link validateWalletPubkey} - Validate wallet matches expected depositor
 * - {@link hexToUint8Array} / {@link uint8ArrayToHex} - Hex conversion
 * - {@link stripHexPrefix} / {@link isValidHex} - Hex validation
 * - {@link toXOnly} - Convert compressed pubkey bytes to x-only
 *
 * @see {@link https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/primitives.md | Primitives Quickstart}
 *
 * @module primitives
 */

// Core types from WASM package
export type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

// PSBT builders
export { buildPeginPsbt } from "./psbt/pegin";
export type { PeginParams, PeginPsbtResult } from "./psbt/pegin";

export {
  buildPayoutOptimisticPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
} from "./psbt/payout";
export type {
  PayoutOptimisticParams,
  PayoutParams,
  PayoutPsbtResult,
} from "./psbt/payout";

// Script generators
export { createPayoutScript } from "./scripts/payout";
export type { PayoutScriptParams, PayoutScriptResult } from "./scripts/payout";

// Bitcoin utilities
export {
  hexToUint8Array,
  isValidHex,
  processPublicKeyToXOnly,
  stripHexPrefix,
  toXOnly,
  uint8ArrayToHex,
  validateWalletPubkey,
  type WalletPubkeyValidationResult,
} from "./utils/bitcoin";
