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
 * - {@link buildDepositorPayoutPsbt} - Create depositor's own Payout PSBT (depositor-as-claimer path)
 * - {@link buildNoPayoutPsbt} - Create NoPayout PSBT per challenger (depositor-as-claimer path)
 * - {@link buildChallengeAssertPsbt} - Create ChallengeAssert PSBT per challenger (depositor-as-claimer path)
 *
 * ### Script Generators
 * - {@link createPayoutScript} - Generate taproot payout script
 *
 * ### Challenger Counting
 * - {@link computeNumLocalChallengers} - Compute number of local challengers for a vault
 *
 * ### WASM Functions
 * - {@link computeMinClaimValue} - Compute the minimum claim value accepted by the vault provider
 *
 * ### Connector Parameter Types
 * - `AssertPayoutNoPayoutConnectorParams` - Connector params for NoPayout/AssertPayout PSBTs
 * - `ChallengeAssertConnectorParams` - Connector params for ChallengeAssert PSBTs
 * - `PayoutConnectorParams` - Connector params for Payout PSBTs
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

// Challenger counting
export { computeNumLocalChallengers } from "./challengers";

// Core types and functions from WASM package
export type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
export { computeMinClaimValue, deriveVaultId } from "@babylonlabs-io/babylon-tbv-rust-wasm";

/**
 * 0x-prefixed bytes32, keccak256(abi.encode(peginTxHash, depositor)).
 * On-chain vault identifier used by BTCVaultRegistry contract.
 *
 * Type alias for documentation — not branded.
 * Derive with `deriveVaultId(peginTxHash, depositorAddress)`.
 */
export type VaultId = `0x${string}`;
export type {
  AssertPayoutNoPayoutConnectorParams,
  ChallengeAssertConnectorParams,
  PayoutConnectorParams,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

// PSBT builders
export { buildPrePeginPsbt, buildPeginTxFromFundedPrePegin } from "./psbt/pegin";
export type {
  PrePeginParams,
  PrePeginPsbtResult,
  BuildPeginTxParams,
  PeginTxResult,
} from "./psbt/pegin";

export { buildPeginInputPsbt, extractPeginInputSignature, finalizePeginInputPsbt } from "./psbt/peginInput";
export type {
  BuildPeginInputPsbtParams,
  BuildPeginInputPsbtResult,
} from "./psbt/peginInput";

export { buildRefundPsbt } from "./psbt/refund";
export type {
  BuildRefundPsbtParams,
  BuildRefundPsbtResult,
} from "./psbt/refund";

export { buildPayoutPsbt, extractPayoutSignature } from "./psbt/payout";
export type { PayoutParams, PayoutPsbtResult } from "./psbt/payout";

export { buildDepositorPayoutPsbt } from "./psbt/depositorPayout";
export type { DepositorPayoutParams } from "./psbt/depositorPayout";

export { buildNoPayoutPsbt } from "./psbt/noPayout";
export type { NoPayoutParams } from "./psbt/noPayout";

export { buildChallengeAssertPsbt } from "./psbt/challengeAssert";
export type { ChallengeAssertParams } from "./psbt/challengeAssert";

// Script generators
export { createPayoutScript } from "./scripts/payout";
export type { PayoutScriptParams, PayoutScriptResult } from "./scripts/payout";

// Bitcoin utilities
export {
  deriveNativeSegwitAddress,
  deriveTaprootAddress,
  hexToUint8Array,
  isAddressFromPublicKey,
  isValidHex,
  ensureHexPrefix,
  formatSatoshisToBtc,
  processPublicKeyToXOnly,
  stripHexPrefix,
  toXOnly,
  uint8ArrayToHex,
  validateWalletPubkey,
  type WalletPubkeyValidationResult,
} from "./utils/bitcoin";
