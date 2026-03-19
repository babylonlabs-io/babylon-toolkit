/**
 * PSBT Builder Primitives
 *
 * Pure functions for building unsigned PSBTs for vault operations.
 * These functions wrap the WASM implementation with a clean TypeScript API.
 *
 * Exports:
 * - {@link buildPeginPsbt} - Create unfunded peg-in transaction
 * - {@link buildPrePeginPsbt} - Create unfunded Pre-PegIn transaction (new peg-in flow)
 * - {@link buildPeginFromPrePeginPsbt} - Build PegIn from funded Pre-PegIn (new peg-in flow)
 * - {@link buildRefundFromPrePeginPsbt} - Build refund from funded Pre-PegIn (new peg-in flow)
 * - {@link getPrePeginHtlcInfo} - Get HTLC scripts and control blocks (new peg-in flow)
 * - {@link buildPayoutPsbt} - Create payout PSBT for signing
 * - {@link extractPayoutSignature} - Extract Schnorr signature from signed PSBT
 * - {@link buildDepositorPayoutPsbt} - Create depositor's own Payout PSBT (depositor-as-claimer path)
 * - {@link buildNoPayoutPsbt} - Create NoPayout PSBT per challenger (depositor-as-claimer path)
 * - {@link buildChallengeAssertPsbt} - Create ChallengeAssert PSBT per challenger (depositor-as-claimer path)
 *
 * @module primitives/psbt
 */

export { buildPeginPsbt } from "./pegin";
export type { PeginParams, PeginPsbtResult } from "./pegin";

// Pre-PegIn primitives — functions and types are staged in
// prepegin.ts but NOT re-exported here until WASM is rebuilt
// with Pre-PegIn support. Wire in exports in a future PR.
export type {
  PrePeginParams,
  PrePeginPsbtResult,
  PeginFromPrePeginPsbtResult,
  PrePeginHtlcInfo,
} from "./prepegin";

export { buildPayoutPsbt, extractPayoutSignature } from "./payout";
export type { PayoutParams, PayoutPsbtResult } from "./payout";

export { buildDepositorPayoutPsbt } from "./depositorPayout";
export type { DepositorPayoutParams } from "./depositorPayout";

export { buildNoPayoutPsbt } from "./noPayout";
export type { NoPayoutParams } from "./noPayout";

export { buildChallengeAssertPsbt } from "./challengeAssert";
export type { ChallengeAssertParams } from "./challengeAssert";
