/**
 * Sanity bounds for values shown on the deposit *display/estimate* path (the
 * Max button, the min-deposit check, the fee preview).
 *
 * These are UX guards, not a signing-path security control. The signing path
 * independently verifies WASM sizing via `assertWasmPeginSizing` and
 * `assertEncodedHtlcOutputsMatch` (every `buildPrePeginPsbt` pass routes
 * through them, see ts-sdk #1866). The job here is narrow: turn an
 * out-of-range estimate into a terminal "Fee estimate unavailable" CTA
 * instead of a stuck "Calculating fees..." spinner or a silently zeroed
 * claim reserve.
 */

// Upper bound on the derived local-challenger count. The set is
// {VP} ∪ {VKs} − {depositor}; real vault graphs use a handful of signers, so a
// count above 100 means a malformed pubkey set, not a real configuration.
const MAX_LOCAL_CHALLENGER_COUNT = 100;

// Flat 1 BTC ceiling on the per-HTLC PegIn activation fee. Intentionally
// decoupled from the fee rate: this is a coarse UX sanity bound, not the
// signing-path ceiling (which scales by feeRate × max reasonable vbytes). A
// real PegIn fee never approaches 1 BTC, so anything above it is a
// misconfigured fee rate.
const MAX_PEGIN_FEE_SATS = 100_000_000n;

// Flat 10 BTC ceiling on the depositor claim reserve (the full
// Claim→Assert→Payout budget, not a network fee). Deliberately generous
// headroom over any realistic signer-count / fee-rate combination so a
// legitimate reserve is never rejected, while still catching a wildly
// out-of-range return.
const MAX_CLAIM_RESERVE_SATS = 1_000_000_000n;

/**
 * Consistency check on `computeNumLocalChallengers`, which is pure TypeScript
 * (`Set.size` over normalized pubkeys), not a WASM export. Rejects a count of
 * 0 — which implies depositor === VP with no vault keepers, a misconfiguration
 * — or an implausibly large set from a malformed pubkey list.
 */
export function assertNumLocalChallengers(value: number): number {
  if (value < 1) {
    throw new Error(
      `Local challenger count is below the minimum of 1: ${value}`,
    );
  }
  if (value > MAX_LOCAL_CHALLENGER_COUNT) {
    throw new Error(
      `Local challenger count exceeds the sanity bound of ${MAX_LOCAL_CHALLENGER_COUNT}: ${value}`,
    );
  }
  return value;
}

export function assertMinClaimValue(value: bigint): bigint {
  if (value <= 0n) {
    throw new Error(
      `computeMinClaimValue returned a non-positive value: ${value}`,
    );
  }
  if (value > MAX_CLAIM_RESERVE_SATS) {
    throw new Error(
      `computeMinClaimValue returned a value above the ${MAX_CLAIM_RESERVE_SATS} sat sanity bound: ${value}`,
    );
  }
  return value;
}

export function assertMinPeginFee(value: bigint): bigint {
  if (value <= 0n) {
    throw new Error(
      `computeMinPeginFee returned a non-positive value: ${value}`,
    );
  }
  if (value > MAX_PEGIN_FEE_SATS) {
    throw new Error(
      `computeMinPeginFee returned a value above the ${MAX_PEGIN_FEE_SATS} sat sanity bound: ${value}`,
    );
  }
  return value;
}
