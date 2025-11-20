/**
 * Vault Primitives
 *
 * Pure functions for vault operations with no wallet dependencies.
 * These functions wrap the WASM implementation and provide:
 * - PSBT building
 * - Script creation
 * - Transaction parsing
 * - Signature extraction
 *
 * All functions are pure: input → output, no side effects.
 * Works in Node.js, browsers, and serverless environments.
 *
 * @module primitives
 */

// Core types from WASM package
export type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

// PSBT builders
export { buildPeginPsbt } from "./psbt/pegin";
export type { PeginParams, PeginPsbtResult } from "./psbt/pegin";

// Script generators
export { createPayoutScript } from "./scripts/payout";
export type {
  PayoutScriptParams,
  PayoutScriptResult,
} from "./scripts/payout";
