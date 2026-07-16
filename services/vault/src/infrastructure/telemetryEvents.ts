/**
 * Sentry funnel event names and the helpers that keep depositor context safe
 * to transmit.
 *
 * Event names are stable, machine-readable telemetry identifiers (not
 * user-facing copy), so they live here rather than in copy.ts. Names are
 * dot-delimited and lead with the funnel phase (`deposit` / `activation`),
 * followed by the stage and, where it adds signal, the outcome.
 */

import { redactIdentifier } from "@/utils/telemetry";

export const TELEMETRY_EVENT = {
  /** Depositor cleared every pre-flight guard; batchId minted (top of funnel). */
  DEPOSIT_STARTED: "deposit.started",
  /** Batch registered on Ethereum; vaultIds now exist (per-vault join point). */
  DEPOSIT_REGISTERED: "deposit.registered",
  /** Pre-PegIn broadcast to Bitcoin; depositor value is now committed. */
  DEPOSIT_BROADCAST_SUCCEEDED: "deposit.broadcast.succeeded",
  /** HTLC secret revealed on Ethereum; activation tx submitted (optimistic). */
  ACTIVATION_ACTIVATED: "activation.activated",
} as const;

export type TelemetryEvent =
  (typeof TELEMETRY_EVENT)[keyof typeof TELEMETRY_EVENT];

/**
 * Funnel-stage tags for failure captures. A failure is a `captureException`
 * (logger.error), not a named message, so tag it with the stage it failed in —
 * this groups failures by stage in Sentry and lets an alert facet on them. Pair
 * with a scrubbed `vaultId` in the error's data for the per-vault join back to
 * the success milestones.
 */
export const TELEMETRY_STAGE = {
  ACTIVATION_WOTS: "activation.wots",
  ACTIVATION_PAYOUTS: "activation.payouts",
  ACTIVATION_SECRET: "activation.secret",
  ACTIVATION_REVEAL: "activation.reveal",
} as const;

export type TelemetryStage =
  (typeof TELEMETRY_STAGE)[keyof typeof TELEMETRY_STAGE];

/**
 * Shorten a long identifier (vaultId, provider address, txid) to `first4...last4`
 * before it enters event context. The embedded `...` breaks the address/hex
 * patterns in `scrubString`, so a raw `0x`+40/64-hex id — which would otherwise
 * be rewritten to `[ETH_ADDR]`/`[HEX_REDACTED]` and lost as a correlation key —
 * survives scrubbing while staying a stable value to join on.
 */
export function shortId(value: string): string {
  return redactIdentifier(value);
}

// Coarse BTC bands. Amounts are bucketed before emission so a depositor's exact
// deposit size is never transmitted; the band is enough to segment the funnel.
const BTC_BAND_SMALL = 0.01;
const BTC_BAND_MEDIUM = 0.1;
const BTC_BAND_LARGE = 1;
const BTC_BAND_XLARGE = 5;

/**
 * Bucket a BTC amount into a coarse band for funnel segmentation. Never hand a
 * raw amount to a telemetry event — the precise value is depositor-identifying.
 */
export function amountBucket(btc: number): string {
  if (!Number.isFinite(btc) || btc < 0) return "unknown";
  if (btc < BTC_BAND_SMALL) return "<0.01";
  if (btc < BTC_BAND_MEDIUM) return "0.01-0.1";
  if (btc < BTC_BAND_LARGE) return "0.1-1";
  if (btc < BTC_BAND_XLARGE) return "1-5";
  return "5+";
}
