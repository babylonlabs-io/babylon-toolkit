/**
 * Hook for fetching ERC20 token balance
 *
 * Reusable hook that fetches any ERC20 token balance for a given address.
 * Automatically refetches periodically to keep the balance up to date.
 */

import { useQuery, type QueryObserverResult } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";

import { getERC20Balance } from "@/clients/eth-contract/erc20";

/** Query key prefix for ERC20 balance queries */
const ERC20_BALANCE_QUERY_KEY = "erc20Balance";

export interface UseERC20BalanceResult {
  /** Balance in token units (formatted with decimals) */
  balance: number;
  /** Raw balance in smallest unit (bigint) */
  balanceRaw: bigint;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /**
   * Manually refetch the balance. Resolves with the fresh `QueryObserverResult`
   * whose `.data` is the up-to-date raw balance — useful when the caller needs
   * a fresh on-chain read inside a synchronous flow (e.g. computing a Max
   * repay amount on click) without waiting for a re-render.
   */
  refetch: () => Promise<QueryObserverResult<bigint, Error>>;
}

/**
 * Fetches ERC20 token balance for a wallet address
 *
 * @param tokenAddress - ERC20 token contract address
 * @param walletAddress - Address to check balance for
 * @param decimals - Token decimals (default: 18)
 * @returns Balance data with loading/error states
 */
export function useERC20Balance(
  tokenAddress: Address | string | undefined,
  walletAddress: Address | string | undefined,
  decimals: number = 18,
): UseERC20BalanceResult {
  const {
    data: balanceRaw,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [ERC20_BALANCE_QUERY_KEY, tokenAddress, walletAddress],
    queryFn: async () => {
      if (!tokenAddress || !walletAddress) return 0n;
      return getERC20Balance(tokenAddress as Address, walletAddress as Address);
    },
    enabled: Boolean(tokenAddress && walletAddress),
    // Refetch periodically to keep balance up to date
    refetchInterval: 30000,
    // `"online"` (the default) pauses queries when `navigator.onLine` is
    // false instead of running queryFn — silently returning stale data to
    // callers awaiting `refetch()`. `"always"` runs the queryFn regardless
    // so real network failures surface via `isError`, which is the contract
    // the repay submit path depends on.
    networkMode: "always",
  });

  const balance = useMemo(() => {
    if (!balanceRaw) return 0;
    return Number(formatUnits(balanceRaw, decimals));
  }, [balanceRaw, decimals]);

  return {
    balance,
    balanceRaw: balanceRaw ?? 0n,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
