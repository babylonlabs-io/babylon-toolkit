import { EXPANSION_OPERATIONS } from "@/ui/common/constants";
import { DelegationV2 } from "@/ui/common/types/delegationsV2";

/**
 * Helper function to determine expansion operation type
 * Compares expansion delegation with original to determine if it's adding BSN/FP or just renewing timelock
 */
export function getExpansionType(
  expansion: DelegationV2,
  original: DelegationV2,
) {
  const newFPs = expansion.finalityProviderBtcPksHex.filter(
    (fp) => !original.finalityProviderBtcPksHex.includes(fp),
  );
  const fpsChanged = newFPs.length > 0;

  if (fpsChanged) {
    return EXPANSION_OPERATIONS.ADD_BSN_FP; // Adding BSN/FP (always includes timelock renewal)
  } else {
    return EXPANSION_OPERATIONS.RENEW_TIMELOCK; // Pure timelock renewal only
  }
}
