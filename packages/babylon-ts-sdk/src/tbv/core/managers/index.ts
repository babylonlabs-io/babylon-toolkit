/**
 * Manager Layer - Wallet Orchestration (Level 2)
 *
 * High-level managers that orchestrate complex flows using primitives and utilities.
 * These managers accept wallet interfaces and handle the complete operation lifecycle.
 *
 * @module managers
 */

export { PeginManager } from "./PeginManager";
export type {
  CreatePeginParams,
  PeginManagerConfig,
  PeginResult,
  RegisterPeginParams,
  SignAndBroadcastParams,
} from "./PeginManager";

export { PayoutManager } from "./PayoutManager";
export type {
  PayoutManagerConfig,
  PayoutSignatureResult,
  SignPayoutParams,
} from "./PayoutManager";
