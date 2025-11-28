/**
 * Core Vault Protocol Functionality
 *
 * This module contains:
 * - Primitives (Level 1): Pure functions wrapping WASM
 * - Utils (Level 2): UTXO selection, transaction funding, fee calculation
 * - Managers (Level 2): Wallet orchestration
 * - Services: Fee estimation, broadcasting
 * - Clients: Contract and API clients
 *
 * @module tbv/core
 */

export * from "./primitives";
export * from "./utils";
