import { useMemo } from "react";

import { DelegationV2 } from "@/ui/common/types/delegationsV2";

/**
 * Hook for validating delegations in the Activity tab.
 * Filters delegations based on UTXO validation results.
 *
 * @param delegations - The raw delegations from the delegation service
 * @param validations - The validation results from useUtxoValidation
 * @returns Filtered array of delegations that should be considered for display
 */
export function useActivityValidation(
  delegations: DelegationV2[],
  validations: Record<string, { valid: boolean }>,
): DelegationV2[] {
  return useMemo(() => {
    return delegations.filter((delegation) => {
      const validation = validations[delegation.stakingTxHashHex];
      const { valid } = validation || { valid: false };
      return valid;
    });
  }, [delegations, validations]);
}
