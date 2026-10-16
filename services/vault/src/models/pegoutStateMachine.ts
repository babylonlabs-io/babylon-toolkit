/**
 * Pegout claim link gate.
 *
 * The claim txid a vault provider reports is pre-computed at peg-in time, so
 * it exists before the claim transaction is on-chain. This decides when the
 * provider's claimer status means the claim has been broadcast and the txid
 * may be linked. The status enum itself lives in @babylonlabs-io/ts-sdk.
 */

import { ClaimerPegoutStatusValue } from "@babylonlabs-io/ts-sdk/tbv/core/services";

const CLAIM_ON_CHAIN_STATUSES = new Set<string>([
  ClaimerPegoutStatusValue.CLAIM_BROADCAST,
  ClaimerPegoutStatusValue.ASSERT_BROADCAST,
  ClaimerPegoutStatusValue.PAYOUT_CONFIRMED,
  ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
]);

/**
 * Whether the claim txid should link to the BTC explorer for a given claimer
 * status. False until the provider reports the claim broadcast.
 */
export function isPegoutClaimBroadcast(
  claimerStatus: string | undefined,
): boolean {
  return (
    claimerStatus !== undefined && CLAIM_ON_CHAIN_STATUSES.has(claimerStatus)
  );
}
