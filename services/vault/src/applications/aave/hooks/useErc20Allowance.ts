/**
 * Owner→spender ERC20 allowance as a keyed React Query read.
 *
 * The repay fee estimator needs the allowance both to gate the estimate and as
 * part of its query key — reading it inline in the estimate's `queryFn` cached a
 * stale `–` for up to the estimate's `staleTime` after an approval. A short
 * `staleTime` plus refetch-on-focus means the value (and therefore the keyed
 * estimate) refreshes promptly once the adapter is approved.
 */

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { ERC20 } from "@/clients/eth-contract";

/** Allowance can change on approval, so keep it fresh on a short cadence. */
const ALLOWANCE_STALE_TIME_MS = 12_000;

export function useErc20Allowance(
  tokenAddress: Address | undefined,
  owner: Address | undefined,
  spender: Address | undefined,
  enabled: boolean,
): bigint | undefined {
  const { data } = useQuery({
    queryKey: ["erc20Allowance", tokenAddress, owner, spender],
    queryFn: () =>
      ERC20.getERC20Allowance(
        tokenAddress as Address,
        owner as Address,
        spender as Address,
      ),
    enabled: enabled && !!tokenAddress && !!owner && !!spender,
    staleTime: ALLOWANCE_STALE_TIME_MS,
  });
  return data;
}
