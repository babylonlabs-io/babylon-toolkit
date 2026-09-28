import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";

import { SPLIT_VAULT_ORDER_QUERY_KEY } from "@/utils/queryKeys";

import {
  isSameVaultOrder,
  readConstructionOrderedVaultIds,
} from "../services/splitVaultOrder";

export function useSplitVaultOrder(currentVaultIds: readonly string[]) {
  const vaultIds = currentVaultIds as readonly Hex[];
  const query = useQuery({
    // The key carries the queue order, so a reorder starts a new read. The
    // registry fields it reads (`htlcVout`, `prePeginTxHash`) never change.
    queryKey: [SPLIT_VAULT_ORDER_QUERY_KEY, ...vaultIds],
    queryFn: () => readConstructionOrderedVaultIds(vaultIds),
    enabled: vaultIds.length >= 2,
    staleTime: Infinity,
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
