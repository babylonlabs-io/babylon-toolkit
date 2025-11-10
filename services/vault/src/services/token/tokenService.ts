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

// Known token configurations
// In production, this should be fetched from a configuration service or API
const TOKEN_REGISTRY: Record<string, TokenMetadata> = {
  // vBTC - Vault BTC (ERC20 representation) - Mainnet/Production
  "0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3": {
    address: "0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3" as Address,
    symbol: "BTC",
    name: "Vault Bitcoin",
    decimals: 18, // vBTC uses 18 decimals on Ethereum
    icon: "/images/btc.png",
  },
  // vBTC - Vault BTC (ERC20 representation) - Devnet/Sepolia
  "0x6044E2e56c1f56EE48360f6F7C25Ee6d4B258024": {
    address: "0x6044E2e56c1f56EE48360f6F7C25Ee6d4B258024" as Address,
    symbol: "BTC",
    name: "Vault Bitcoin",
    decimals: 18, // vBTC uses 18 decimals on Ethereum
    icon: "/images/btc.png",
  },
  // USDC - Mainnet/Production
  "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85": {
    address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Address,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    icon: "/images/usdc.png",
  },
  // USDC - Devnet/Sepolia (Mock)
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238": {
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    icon: "/images/usdc.png",
  },
  // USDT
  "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58": {
    address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" as Address,
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    icon: "/images/usdt.png",
  },
  // DAI
  "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1": {
    address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" as Address,
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    icon: "/images/dai.png",
  },
  // WETH
  "0x4200000000000000000000000000000000000006": {
    address: "0x4200000000000000000000000000000000000006" as Address,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    icon: "/images/eth.png",
  },
};

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
 * Cache for fetched token metadata (in-memory cache)
 */
const tokenMetadataCache = new Map<string, TokenMetadata>();

/**
 * Get token metadata by address (async version that fetches from blockchain)
 * First checks cache, then registry, then fetches from blockchain
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

  // 2. Check registry
  const registryToken = TOKEN_REGISTRY[checksumAddress];
  if (registryToken) {
    tokenMetadataCache.set(checksumAddress, registryToken);
    return registryToken;
  }

  // 3. Fetch from blockchain
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

  // 4. Fallback to default
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
 * Only checks cache and registry, doesn't fetch from blockchain
 *
 * @param address - Token contract address
 * @returns Token metadata or null if not found
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

  // Check registry
  const token = TOKEN_REGISTRY[checksumAddress];
  if (token) {
    return token;
  }

  // Return a temporary placeholder
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
 * Get all supported tokens
 *
 * @returns Array of all token metadata
 */
export function getAllTokens(): TokenMetadata[] {
  return Object.values(TOKEN_REGISTRY);
}

/**
 * Check if a token is supported
 *
 * @param address - Token address to check
 * @returns True if token is in registry
 */
export function isTokenSupported(address: string): boolean {
  if (!isAddress(address)) return false;
  return getAddress(address) in TOKEN_REGISTRY;
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
