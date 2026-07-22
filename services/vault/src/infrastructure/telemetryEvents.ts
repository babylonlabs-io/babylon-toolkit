/**
 * Sentry funnel event names and the helpers that keep depositor context safe
 * to transmit.
 *
 * Event names are stable, machine-readable telemetry identifiers (not
 * user-facing copy), so they live here rather than in copy.ts. Names are
 * dot-delimited and lead with the funnel phase (`deposit` / `activation` /
 * `exit`), followed by the stage and, where it adds signal, the outcome.
 */

import { logger } from "@/infrastructure";
import { classifyError } from "@/utils/errors/formatting";
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
  /** VP verified the depositor's presigned payouts on-chain (contractStatus VERIFIED). */
  ACTIVATION_VERIFIED: "activation.verified",
  /** Vault confirmed ACTIVE on-chain — funnel terminal / primary conversion. */
  DEPOSIT_COMPLETED: "deposit.completed",
  /** VP daemon reported a terminal drop (Expired / AmlRejected / ...) — the deposit leaves the funnel. */
  ACTIVATION_DAEMON_TERMINAL: "activation.daemon.terminal",
  /** Redemption terminal success — the BTC payout tx is broadcast to the depositor. */
  EXIT_REDEEM_PAYOUT_BROADCAST: "exit.redeem.payout_broadcast",
  /** Redemption blocked terminal — claim/assert on-chain but the BTC payout is blocked. */
  EXIT_REDEEM_PAYOUT_BLOCKED: "exit.redeem.payout_blocked",
  /** Pegout polling gave up (consecutive failures / unknown status / provider not found). */
  EXIT_REDEEM_PEGOUT_TIMEOUT: "exit.redeem.pegout_timeout",
  /** Recovery artifacts downloaded for the first time — the RETRIEVE_SECRET gate is passable. */
  ACTIVATION_ARTIFACTS_DOWNLOADED: "activation.artifacts.downloaded",
  /** The VP kept reporting "still processing" past the stall threshold — depositor is stuck waiting. */
  ACTIVATION_ARTIFACTS_STALLED: "activation.artifacts.stalled",
  /** Every vault provider was filtered out of the deposit picker — deposits blocked at the top of the funnel. */
  ONBOARDING_PROVIDERS_EMPTY: "onboarding.providers.empty",
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
  ACTIVATION_ARTIFACTS: "activation.artifacts",
  ACTIVATION_SECRET: "activation.secret",
  ACTIVATION_REVEAL: "activation.reveal",
} as const;

export type TelemetryStage =
  (typeof TELEMETRY_STAGE)[keyof typeof TELEMETRY_STAGE];

/**
 * Capture a funnel-stage failure, with the tag schema the stage alerts facet on.
 *
 * A wallet decline is routine depositor drop-off, not a failure, so it is never
 * captured — every one of these stages fronts a wallet popup, and counting
 * cancellations would inflate the very rate these tags alert on. The caller
 * still renders its own rejection copy; only the Sentry capture is suppressed.
 *
 * `vaultId` is shortened here so the per-vault join key back to the success
 * milestones cannot be forgotten at a call site. Pass any further identifiers in
 * `extra` already shortened via `shortId`.
 */
export function captureFunnelFailure(
  stage: TelemetryStage,
  err: unknown,
  vaultId: string,
  extra: Record<string, string | number | boolean> = {},
): void {
  if (classifyError(err) === "user-rejection") return;
  logger.error(err instanceof Error ? err : new Error(String(err)), {
    tags: { funnelStage: stage },
    data: { vaultId: shortId(vaultId), ...extra },
  });
}

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
