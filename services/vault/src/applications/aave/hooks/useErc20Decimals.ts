/**
 * On-chain ERC20 decimals for a token, cached indefinitely.
 *
 * Decimals are immutable, so this is fetched once per token and never refetched
 * (`staleTime: Infinity`). The borrow/repay fee estimators use it instead of the
 * indexer-supplied config decimals so the estimated calldata is built from the
 * same source the submit path reads (`ERC20.getERC20Decimals`).
 */

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { ERC20 } from "@/clients/eth-contract";

export function useErc20Decimals(
  tokenAddress: Address | undefined,
): number | undefined {
  const { data } = useQuery({
    queryKey: ["erc20Decimals", tokenAddress],
    queryFn: () => ERC20.getERC20Decimals(tokenAddress as Address),
    enabled: !!tokenAddress,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data;
}
