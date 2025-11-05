/**
 * Token Service - Manages token metadata and configuration
 *
 * Provides centralized access to token information including:
 * - Token symbols, names, and decimals
 * - Token icons and display configuration
 * - Token address validation and lookups
 */

import type { Address } from "viem";
import { getAddress, isAddress } from "viem";

import { ethClient } from "../../clients/eth-contract/client";

/**
 * ERC20 ABI for fetching token metadata
 */
const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  /** Token contract address */
  address: Address;
  /** Token symbol (e.g., "BTC", "USDC") */
  symbol: string;
  /** Full token name */
  name: string;
  /** Number of decimals for the token */
  decimals: number;
  /** Icon URL or path (undefined if no icon available - Avatar will show fallback) */
  icon?: string;
  /** Chain ID where this token exists */
  chainId?: number;
}

/**
 * Token pair information for markets
 */
export interface MarketTokenPair {
  /** Collateral token metadata */
  collateral: TokenMetadata;
  /** Loan token metadata */
  loan: TokenMetadata;
  /** Formatted pair name (e.g., "BTC / USDC") */
  pairName: string;
}

/**
 * Cache for fetched token metadata (in-memory cache)
 * This replaces the hardcoded TOKEN_REGISTRY to support any token dynamically
 */
const tokenMetadataCache = new Map<string, TokenMetadata>();

/**
 * Promise cache to prevent duplicate fetches for the same token
 */
const fetchPromiseCache = new Map<string, Promise<TokenMetadata>>();

/**
 * Fetch token metadata from blockchain
 *
 * @param address - Token contract address
 * @returns Token metadata fetched from the contract
 */
async function fetchTokenMetadataFromChain(
  address: Address,
): Promise<Omit<TokenMetadata, "icon"> | null> {
  try {
    const publicClient = ethClient.getPublicClient();

    // Fetch name, symbol, and decimals in parallel
    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "name",
      }),
      publicClient.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals",
      }),
    ]);

    return {
      address,
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number,
    };
  } catch (error) {
    console.warn(
      `[TokenService] Failed to fetch metadata for ${address}:`,
      error,
    );
    return null;
  }
}

/**
 * Get token metadata by address (fetches from blockchain dynamically)
 * Uses cache for performance but always fetches unknown tokens from chain
 *
 * @param address - Token contract address
 * @returns Token metadata
 */
export async function getTokenMetadata(
  address: string,
): Promise<TokenMetadata> {
  if (!isAddress(address)) {
    throw new Error(`Invalid token address: ${address}`);
  }

  const checksumAddress = getAddress(address);

  // 1. Check cache first
  if (tokenMetadataCache.has(checksumAddress)) {
    return tokenMetadataCache.get(checksumAddress)!;
  }

  // 2. Check if we're already fetching this token
  if (fetchPromiseCache.has(checksumAddress)) {
    return fetchPromiseCache.get(checksumAddress)!;
  }

  // 3. Create a new fetch promise
  const fetchPromise = (async () => {
    try {
      console.log(
        `[TokenService] Fetching metadata from blockchain for: ${checksumAddress}`,
      );

      const chainMetadata = await fetchTokenMetadataFromChain(checksumAddress);

      if (chainMetadata) {
        // Use special icons for common token symbols
        const icon = getIconForSymbol(chainMetadata.symbol);

        const tokenMetadata: TokenMetadata = {
          ...chainMetadata,
          icon,
        };

        tokenMetadataCache.set(checksumAddress, tokenMetadata);
        console.log(`[TokenService] Fetched token metadata:`, tokenMetadata);
        return tokenMetadata;
      }

      // 4. Fallback to default if fetch fails
      const truncatedAddress = `${checksumAddress.slice(0, 6)}...${checksumAddress.slice(-4)}`;
      const fallbackMetadata: TokenMetadata = {
        address: checksumAddress as Address,
        symbol: truncatedAddress,
        name: `Unknown Token (${truncatedAddress})`,
        decimals: 18,
        // No icon - Avatar component will show fallback (initials)
        icon: undefined,
      };

      tokenMetadataCache.set(checksumAddress, fallbackMetadata);
      return fallbackMetadata;
    } finally {
      fetchPromiseCache.delete(checksumAddress);
    }
  })();

  fetchPromiseCache.set(checksumAddress, fetchPromise);
  return fetchPromise;
}

/**
 * Get icon path based on token symbol
 * Returns undefined if no known icon exists (Avatar component will show fallback)
 */
function getIconForSymbol(symbol: string): string | undefined {
  const symbolUpper = symbol.toUpperCase();

  // Map common symbols to icon paths
  const iconMap: Record<string, string> = {
    BTC: "/images/btc.png",
    WBTC: "/images/btc.png",
    VBTC: "/images/btc.png",
    USDC: "/images/usdc.png",
    USDT: "/images/usdt.png",
    DAI: "/images/dai.png",
    ETH: "/images/eth.png",
    WETH: "/images/eth.png",
  };

  // Return undefined for unknown tokens so Avatar shows fallback
  return iconMap[symbolUpper];
}

/**
 * Get token metadata by address (sync version for immediate use)
 * Returns cached data if available, or a placeholder while fetching
 * Triggers background fetch for unknown tokens
 *
 * @param address - Token contract address
 * @returns Token metadata or placeholder
 */
export function getTokenByAddress(address: string): TokenMetadata | null {
  if (!isAddress(address)) {
    console.warn(`[TokenService] Invalid token address: ${address}`);
    return null;
  }

  const checksumAddress = getAddress(address);

  // Check cache first
  if (tokenMetadataCache.has(checksumAddress)) {
    return tokenMetadataCache.get(checksumAddress)!;
  }

  // Trigger background fetch for unknown tokens
  // This ensures the data will be available for next time
  getTokenMetadata(checksumAddress).catch((error) => {
    console.error(
      `[TokenService] Background fetch failed for ${checksumAddress}:`,
      error,
    );
  });

  // Return a temporary placeholder while fetching
  const truncatedAddress = `${checksumAddress.slice(0, 6)}...${checksumAddress.slice(-4)}`;
  return {
    address: checksumAddress as Address,
    symbol: truncatedAddress,
    name: `Loading...`,
    decimals: 18,
    // No icon - Avatar component will show fallback (initials)
    icon: undefined,
  };
}

/**
 * Get token metadata for a market pair (async version - fetches from blockchain)
 *
 * @param collateralAddress - Collateral token address
 * @param loanAddress - Loan token address
 * @returns Market token pair information
 */
export async function getMarketTokenPairAsync(
  collateralAddress: string,
  loanAddress: string,
): Promise<MarketTokenPair> {
  console.log(`[TokenService] Fetching token pair for market:`, {
    collateral: collateralAddress,
    loan: loanAddress,
  });

  // Fetch both tokens in parallel
  const [collateral, loan] = await Promise.all([
    getTokenMetadata(collateralAddress),
    getTokenMetadata(loanAddress),
  ]);

  return {
    collateral,
    loan,
    pairName: `${collateral.symbol} / ${loan.symbol}`,
  };
}

/**
 * Get token metadata for a market pair (sync version - uses cache/registry only)
 *
 * @param collateralAddress - Collateral token address
 * @param loanAddress - Loan token address
 * @returns Market token pair information
 */
export function getMarketTokenPair(
  collateralAddress: string,
  loanAddress: string,
): MarketTokenPair {
  const collateral = getTokenByAddress(collateralAddress) || {
    address: collateralAddress as Address,
    symbol: "???",
    name: "Unknown",
    decimals: 18,
    // No icon - Avatar component will show fallback (initials)
    icon: undefined,
  };

  const loan = getTokenByAddress(loanAddress) || {
    address: loanAddress as Address,
    symbol: "???",
    name: "Unknown",
    decimals: 18,
    // No icon - Avatar component will show fallback (initials)
    icon: undefined,
  };

  return {
    collateral,
    loan,
    pairName: `${collateral.symbol} / ${loan.symbol}`,
  };
}

/**
 * Format token amount based on decimals
 *
 * @param amount - Raw token amount (as bigint)
 * @param decimals - Number of decimals for the token
 * @returns Formatted amount as number
 */
export function formatTokenAmount(amount: bigint, decimals: number): number {
  return Number(amount) / Math.pow(10, decimals);
}

/**
 * Parse token amount to raw units
 *
 * @param amount - Human-readable amount
 * @param decimals - Number of decimals for the token
 * @returns Raw amount as bigint
 */
export function parseTokenAmount(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Get all cached tokens
 * Note: This only returns tokens that have been fetched and cached
 *
 * @returns Array of cached token metadata
 */
export function getCachedTokens(): TokenMetadata[] {
  return Array.from(tokenMetadataCache.values());
}

/**
 * Check if a token is already cached
 *
 * @param address - Token address to check
 * @returns True if token is in cache
 */
export function isTokenCached(address: string): boolean {
  if (!isAddress(address)) return false;
  return tokenMetadataCache.has(getAddress(address));
}

/**
 * Prefetch token metadata for multiple addresses
 * Useful for preloading tokens when displaying a list
 *
 * @param addresses - Array of token addresses to prefetch
 */
export async function prefetchTokens(addresses: string[]): Promise<void> {
  const validAddresses = addresses.filter((addr) => isAddress(addr)).map(getAddress);

  // Fetch all uncached tokens in parallel
  const fetchPromises = validAddresses
    .filter((address) => !tokenMetadataCache.has(address) && !fetchPromiseCache.has(address))
    .map((address) => getTokenMetadata(address));

  await Promise.allSettled(fetchPromises);
}

/**
 * Generate a data URI for a token icon fallback
 * Creates a circular SVG with the token's first letter
 *
 * @param symbol - Token symbol
 * @returns Data URI for an SVG icon
 */
export function generateTokenIconFallback(symbol: string): string {
  const letter = symbol?.charAt(0).toUpperCase() || "?";
  const color = "#CE6533"; // Use accent color

  const svg = `
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="20" fill="${color}"/>
      <text x="20" y="20" font-family="system-ui" font-size="18" font-weight="600" 
            fill="white" text-anchor="middle" dominant-baseline="central">
        ${letter}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Get currency icon with fallback
 * Returns actual icon URL or generates a fallback SVG
 *
 * @param icon - Icon URL (may be undefined)
 * @param symbol - Token symbol for fallback
 * @returns Icon URL or fallback data URI
 */
export function getCurrencyIconWithFallback(
  icon: string | undefined,
  symbol: string,
): string {
  return icon || generateTokenIconFallback(symbol);
}
