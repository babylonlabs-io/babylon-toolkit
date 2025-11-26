/**
 * PSBT Builder Primitives
 *
 * Pure functions for building unsigned PSBTs for vault operations.
 * These functions wrap the WASM implementation with a clean TypeScript API.
 *
 * @module primitives/psbt
 */

export { buildPeginPsbt } from "./pegin";
export type { PeginParams, PeginPsbtResult } from "./pegin";

export { buildPayoutPsbt, extractPayoutSignature } from "./payout";
export type { PayoutParams, PayoutPsbtResult } from "./payout";
