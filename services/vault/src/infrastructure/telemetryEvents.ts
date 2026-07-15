/**
 * Sentry funnel event names and the helpers that keep depositor context safe
 * to transmit.
 *
 * Event names are stable, machine-readable telemetry identifiers (not
 * user-facing copy), so they live here rather than in copy.ts. Segments read
 * `phase.stage.outcome`.
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
