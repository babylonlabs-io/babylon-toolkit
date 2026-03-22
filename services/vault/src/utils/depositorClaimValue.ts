/**
 * Compute the minimum depositor claim value (sats) that the VP will accept.
 *
 * Wraps the WASM `computeMinClaimValue` and adds the Claim tx fee, which
 * the WASM function omits (btc-vault bug: the VP's internal validation
 * includes it, but the public function doesn't).
 *
 * The Claim tx has a fixed structure (1 P2TR input, 4 P2TR outputs) → 307 vbytes.
 * TODO: remove CLAIM_TX_VSIZE once btc-vault fixes compute_min_claim_value.
 */

import { computeMinClaimValue } from "@babylonlabs-io/ts-sdk/tbv/core";

/** Claim tx vsize — fixed structure: 1 P2TR input, 4 P2TR outputs. */
const CLAIM_TX_VSIZE = 307n;

export interface ComputeDepositorClaimValueParams {
  numLocalChallengers: number;
  numUniversalChallengers: number;
  councilQuorum: number;
  councilSize: number;
  feeRate: bigint;
}

export async function computeDepositorClaimValue(
  params: ComputeDepositorClaimValueParams,
): Promise<bigint> {
  const wasmValue = await computeMinClaimValue(
    params.numLocalChallengers,
    params.numUniversalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.feeRate,
  );
  const claimFee = CLAIM_TX_VSIZE * params.feeRate;
  return wasmValue + claimFee;
}
