/**
 * Hook for fetching token pair metadata for a market
 */

import { useQuery } from "@tanstack/react-query";
import { getAddress, isAddress } from "viem";

import { getMarketTokenPairAsync } from "../services/token";
import type { MarketTokenPair } from "../services/token/tokenService";

/**
 * Normalize and validate an Ethereum address
 * Adds "0x" prefix if missing and validates format
 *
 * @param address - Address string (with or without 0x prefix)
 * @returns Checksummed address with 0x prefix, or null if invalid
 */
function normalizeAddress(address: string | undefined): string | null {
  if (!address) return null;

  // Add 0x prefix if missing
  const prefixedAddress = address.startsWith("0x") ? address : `0x${address}`;

  // Validate and checksum the address
  if (!isAddress(prefixedAddress)) {
    console.warn(`[useTokenPair] Invalid address format: ${address}`);
    return null;
  }

  return getAddress(prefixedAddress);
}

/**
 * Custom hook to fetch token pair metadata for a market
 *
 * @param collateralToken - Collateral token address (with or without 0x prefix)
 * @param loanToken - Loan token address (with or without 0x prefix)
 * @returns Token pair data with loading and error states
 */
export function useTokenPair(
  collateralToken: string | undefined,
  loanToken: string | undefined,
) {
  // Normalize addresses (add 0x prefix if missing, validate, and checksum)
  const normalizedCollateral = collateralToken
    ? normalizeAddress(collateralToken)
    : undefined;
  const normalizedLoan = loanToken ? normalizeAddress(loanToken) : undefined;

  return useQuery({
    queryKey: ["tokenPair", normalizedCollateral, normalizedLoan],
    queryFn: async () => {
      if (!normalizedCollateral || !normalizedLoan) {
        console.warn(
          "[useTokenPair] Invalid or missing addresses:",
          collateralToken,
          loanToken,
        );
        return null;
      }
      return getMarketTokenPairAsync(normalizedCollateral, normalizedLoan);
    },
    enabled: !!normalizedCollateral && !!normalizedLoan,
    staleTime: Infinity, // Token metadata doesn't change
  });
}

/**
 * Type for the return value of useTokenPair
 */
export type UseTokenPairResult = ReturnType<typeof useTokenPair> & {
  data: MarketTokenPair | null | undefined;
};
