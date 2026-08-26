/**
 * Test setup file for Vitest
 * This file runs before all test files
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { beforeEach, vi } from "vitest";

// Initialize ECC library for bitcoinjs-lib (required by P2TR / Taproot operations).
initEccLib(ecc);

// Clear all mocks before each test to prevent test interference
beforeEach(() => {
  vi.clearAllMocks();
});
