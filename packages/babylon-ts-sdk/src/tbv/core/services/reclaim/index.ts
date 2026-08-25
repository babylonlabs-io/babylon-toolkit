/**
 * Vault reclaim service — sweep the depositor-claim reserve (PegIn vout 1)
 * back to the depositor after their vault has terminally settled.
 *
 * @module services/reclaim
 */

export { ReclaimUneconomicalError } from "./errors";
export {
  buildAndBroadcastReclaim,
  RECLAIM_MAX_FEE_FRACTION_DENOMINATOR,
  RECLAIM_MAX_FEE_FRACTION_NUMERATOR,
  RECLAIM_MAX_FEE_RATE_SATS_VB,
  RECLAIM_WARN_FEE_FRACTION_NUMERATOR,
  type ReclaimInput,
  type ReclaimPsbtSigner,
  type ReclaimVaultData,
} from "./buildAndBroadcastReclaim";
