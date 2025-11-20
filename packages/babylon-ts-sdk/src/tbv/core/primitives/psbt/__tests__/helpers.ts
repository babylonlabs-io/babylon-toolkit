/**
 * Test helpers and constants for PSBT primitive tests
 *
 * This module provides deterministic test keys and utilities for testing
 * peg-in PSBT functionality. The keys are derived from simple secret keys
 * to ensure reproducible test results.
 *
 * @module primitives/psbt/__tests__/helpers
 */

import { readFile } from "node:fs/promises";

/**
 * Test public key constants derived from deterministic secret keys.
 *
 * These are valid secp256k1 x-only public keys (32 bytes, 64 hex chars)
 */
export const TEST_KEYS = {
  DEPOSITOR: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",

  CLAIMER: "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",

  LIQUIDATOR_1:
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",

  LIQUIDATOR_2:
    "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
} as const;

/**
 * Common test amounts used in peg-in scenarios (in satoshis)
 */
export const TEST_AMOUNTS = {
  /** Minimum dust amount (546 sats) */
  DUST: 546n,

  /** Small test amount (1,000 sats) */
  SMALL: 1_000n,

  /** Small peg-in amount (50,000 sats) */
  PEGIN_SMALL: 50_000n,

  /** Standard peg-in amount (90,000 sats) */
  PEGIN: 90_000n,

  /** Medium peg-in amount (0.001 BTC = 100,000 sats) */
  PEGIN_MEDIUM: 100_000n,

  /** Large peg-in amount (0.01 BTC = 1,000,000 sats) */
  PEGIN_LARGE: 1_000_000n,

  /** 1 BTC amount (100,000,000 sats) */
  ONE_BTC: 100_000_000n,

  /** Maximum Bitcoin supply (21M BTC in sats) */
  MAX: 2_100_000_000_000_000n,
} as const;

/**
 * Initialize WASM module for Node.js testing environment.
 *
 * This function loads the WASM binary from the workspace and initializes it
 * properly for the test environment. It uses require.resolve() to find the
 * WASM file reliably regardless of the workspace structure.
 *
 * **Note:** This should be called once in beforeAll() for each test suite.
 *
 * @returns Promise that resolves when WASM is initialized
 *
 * @example
 * ```typescript
 * describe("buildPeginPsbt", () => {
 *   beforeAll(async () => {
 *     await initializeWasmForTests();
 *   });
 *   // ... tests
 * });
 * ```
 */
export async function initializeWasmForTests(): Promise<void> {
  try {
    // Use require.resolve to reliably find the WASM file in the workspace
    const wasmPath = require.resolve(
      "@babylonlabs-io/babylon-tbv-rust-wasm/dist/generated/btc_vault_bg.wasm",
    );

    // Load the WASM binary
    const wasmBuffer = await readFile(wasmPath);
    const wasmModule = new WebAssembly.Module(wasmBuffer.buffer as ArrayBuffer);

    // Import the WASM initialization function
    const init = (
      await import(
        "@babylonlabs-io/babylon-tbv-rust-wasm/dist/generated/btc_vault.js"
      )
    ).default;

    // Initialize WASM with the loaded module
    await init(wasmModule);
  } catch (error) {
    throw new Error(
      `Failed to initialize WASM for tests: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
