import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";

import { SPLIT_VAULT_ORDER_QUERY_KEY } from "@/utils/queryKeys";

import { POSITION_REFETCH_INTERVAL_MS } from "../constants";
import {
  isSameVaultOrder,
  readConstructionOrderedVaultIds,
} from "../services/splitVaultOrder";

export function useSplitVaultOrder(currentVaultIds: readonly string[]) {
  const vaultIds = currentVaultIds as readonly Hex[];
  const query = useQuery({
    queryKey: [SPLIT_VAULT_ORDER_QUERY_KEY, ...vaultIds],
    queryFn: () => readConstructionOrderedVaultIds(vaultIds),
    enabled: vaultIds.length >= 2,
    refetchInterval: POSITION_REFETCH_INTERVAL_MS,
    networkMode: "always",
  });

  const expectedVaultIds = query.data ?? null;
  return {
    ...query,
    expectedVaultIds,
    hasMismatch:
      expectedVaultIds !== null &&
      !isSameVaultOrder(vaultIds, expectedVaultIds),
  };
}
