/**
 * PSBT Builder Primitives
 *
 * Pure functions for building unsigned PSBTs for vault operations.
 * These functions wrap the WASM implementation with a clean TypeScript API.
 *
 * Exports:
 * - {@link buildPrePeginPsbt} - Create unfunded Pre-PegIn transaction (HTLC output)
 * - {@link buildPeginTxFromFundedPrePegin} - Derive PegIn tx from funded Pre-PegIn tx
 * - {@link buildPeginInputPsbt} - Create PSBT for depositor to sign PegIn HTLC leaf 0 input
 * - {@link extractPeginInputSignature} - Extract depositor signature from signed PegIn input PSBT
 * - {@link buildPayoutPsbt} - Create payout PSBT for signing
 * - {@link extractPayoutSignature} - Extract Schnorr signature from signed PSBT
 * - {@link buildDepositorPayoutPsbt} - Create depositor's own Payout PSBT (depositor-as-claimer path)
 * - {@link buildNoPayoutPsbt} - Create NoPayout PSBT per challenger (depositor-as-claimer path)
 * - {@link buildChallengeAssertPsbt} - Create ChallengeAssert PSBT per challenger (depositor-as-claimer path)
 *
 * @module primitives/psbt
 */

export { buildPrePeginPsbt, buildPeginTxFromFundedPrePegin } from "./pegin";
export type {
  PrePeginParams,
  PrePeginPsbtResult,
  BuildPeginTxParams,
  PeginTxResult,
} from "./pegin";

export { buildPeginInputPsbt, extractPeginInputSignature } from "./peginInput";
export type {
  BuildPeginInputPsbtParams,
  BuildPeginInputPsbtResult,
} from "./peginInput";

export { buildPayoutPsbt, extractPayoutSignature } from "./payout";
export type { PayoutParams, PayoutPsbtResult } from "./payout";

export { buildDepositorPayoutPsbt } from "./depositorPayout";
export type { DepositorPayoutParams } from "./depositorPayout";

export { buildNoPayoutPsbt } from "./noPayout";
export type { NoPayoutParams } from "./noPayout";

export { buildChallengeAssertPsbt } from "./challengeAssert";
export type { ChallengeAssertParams } from "./challengeAssert";
