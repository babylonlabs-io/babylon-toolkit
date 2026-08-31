/**
 * Core Vault Protocol Functionality
 *
 * This module contains:
 * - Primitives (Level 1): Pure functions wrapping WASM
 * - Utils (Level 2): UTXO selection, transaction funding, fee calculation
 * - Managers (Level 2): Wallet orchestration
 * - Clients: API clients (mempool, vault provider)
 * - Contracts: Smart contract ABIs
 * - Services: Deposit validation, peg-in protocol state, pegout state
 * - WOTS: Winternitz one-time signature utilities
 * - Vault Secrets: HKDF-Expand pipeline producing hashlock / auth-anchor /
 *   wots-seed from a spec-opaque 32-byte root.
 * - Recovery: reconstruction of a Pre-PegIn whose Ethereum registration was
 *   lost to a reorg, from the wallet and the transaction alone.
 *
 * @module tbv/core
 */

export * from "./primitives";
export * from "./utils";
export * from "./managers";
export * from "./clients";
export * from "./contracts";
export * from "./wots";
export * from "./services";
export * from "./vault-secrets";
export * from "./deposit-terms";
export * from "./recovery";
// Keep the lenient utility on the core barrel. The ETH subpath has the strict parser.
export { calculateBtcTxHash } from "./utils";
