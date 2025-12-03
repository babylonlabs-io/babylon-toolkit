/**
 * Core Vault Protocol Functionality
 *
 * This module contains:
 * - Primitives (Level 1): Pure functions wrapping WASM
 * - Utils (Level 2): UTXO selection, transaction funding, fee calculation
 * - Managers (Level 2): Wallet orchestration
 * - Clients: API clients (mempool)
 * - Contracts: Smart contract ABIs
 *
 * @module tbv/core
 */

export * from "./primitives";
export * from "./utils";
export * from "./managers";
export * from "./clients";
export * from "./contracts";
