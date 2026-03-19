/**
 * @packageDocumentation
 *
 * # Manager Layer - Wallet Orchestration (Level 2)
 *
 * High-level managers that orchestrate complex flows using primitives and utilities.
 * These managers accept wallet interfaces and handle the complete operation lifecycle.
 *
 * ## Architecture
 *
 * Managers sit between your application and the primitives layer:
 *
 * ```
 * Your Application
 *       ↓
 * Managers (Level 2)    ← This module
 *       ↓
 * Primitives (Level 1)  ← Pure functions
 *       ↓
 * WASM (Rust Core)      ← Cryptographic operations
 * ```
 *
 * ## When to Use Managers
 *
 * Use managers when you have:
 * - **Frontend apps** with browser wallet integration (UniSat, OKX, etc.)
 * - **Quick integration** needs with minimal code
 * - **Standard flows** that don't require custom signing logic
 *
 * Use primitives instead when you need:
 * - Backend services with KMS/HSM signing
 * - Full control over every operation
 * - Custom wallet integrations
 *
 * ## Available Managers
 *
 * ### {@link PeginManager}
 * Orchestrates the peg-in deposit flow:
 * - {@link PeginManager.preparePegin | preparePegin()} - Build and fund transaction (current flow)
 * - {@link PeginManager.registerPeginOnChain | registerPeginOnChain()} - Submit to Ethereum
 * - {@link PeginManager.signAndBroadcast | signAndBroadcast()} - Broadcast to Bitcoin (current flow)
 *
 * New peg-in flow (Pre-PegIn) methods (planned):
 * - `preparePrePegin()` - Build Pre-PegIn + derive PegIn
 * - `buildRefundTransaction()` - Build refund for timed-out Pre-PegIn
 * - `getPrePeginHtlcInfo()` - Get HTLC scripts/control blocks
 *
 * ### {@link PayoutManager}
 * Signs payout authorization transactions (Step 3 of peg-in).
 * - {@link PayoutManager.signPayoutTransaction | signPayoutTransaction()} - Sign payout (uses Assert tx as reference)
 *
 * ## Complete Peg-in Flow (Current)
 *
 * The 4-step peg-in flow uses both managers:
 *
 * | Step | Manager | Method |
 * |------|---------|--------|
 * | 1 | PeginManager | `preparePegin()` |
 * | 2 | PeginManager | `registerPeginOnChain()` |
 * | 3 | PayoutManager | `signPayoutTransaction()` |
 * | 4 | PeginManager | `signAndBroadcast()` |
 *
 * ## New Peg-in Flow (Pre-PegIn)
 *
 * | Step | Manager | Method |
 * |------|---------|--------|
 * | 1 | PeginManager | `preparePrePegin()` |
 * | 2 | PeginManager | Sign & broadcast Pre-PegIn, register on Ethereum |
 * | 3 | PayoutManager | `signPayoutTransaction()` |
 * | 4 | PeginManager | Reveal secret to activate vault |
 *
 * **Step 3 Details:** The vault provider provides 3 transactions per claimer:
 * - `claim_tx` - Claim transaction
 * - `assert_tx` - Assert transaction
 * - `payout_tx` - Payout transaction
 *
 * You must sign the Payout transaction (uses assert_tx as input reference) for each claimer.
 *
 * @see {@link https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md | Managers Quickstart}
 *
 * @module managers
 */

export { PeginManager } from "./PeginManager";
export type {
  CreatePeginParams,
  CreatePrePeginParams,
  PeginManagerConfig,
  PeginResult,
  PeginFromPrePeginResult,
  PrePeginResult,
  PrePeginTransactionParams,
  PrePeginWithPeginResult,
  RegisterPeginParams,
  RegisterPeginResult,
  SignAndBroadcastParams,
} from "./PeginManager";

export { PayoutManager } from "./PayoutManager";
export type {
  PayoutManagerConfig,
  PayoutSignatureResult,
  SignPayoutParams,
} from "./PayoutManager";

// Re-export dependent types for complete API documentation
export type { UTXO } from "../utils/utxo/selectUtxos";
export type {
  BitcoinNetwork,
  BitcoinWallet,
  SignInputOptions,
  SignPsbtOptions,
} from "../../../shared/wallets/interfaces/BitcoinWallet";
