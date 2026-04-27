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
