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

import { logger } from "@/infrastructure";

import { getNetworkConfigBTC } from "../../config";

const btcConfig = getNetworkConfigBTC();

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

// Known token configurations
// In production, this should be fetched from a configuration service or API
const TOKEN_REGISTRY: Record<string, TokenMetadata> = {
  // vBTC - Vault BTC (ERC20 representation) - Mainnet/Production
  "0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3": {
    address: "0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3" as Address,
    symbol: btcConfig.coinSymbol,
    name: `Vault ${btcConfig.name}`,
    decimals: 18, // vBTC uses 18 decimals on Ethereum
    icon: btcConfig.icon,
  },
  // vBTC - Vault BTC (ERC20 representation) - Devnet/Sepolia
  "0x6044E2e56c1f56EE48360f6F7C25Ee6d4B258024": {
    address: "0x6044E2e56c1f56EE48360f6F7C25Ee6d4B258024" as Address,
    symbol: btcConfig.coinSymbol,
    name: `Vault ${btcConfig.name}`,
    decimals: 18, // vBTC uses 18 decimals on Ethereum
    icon: btcConfig.icon,
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
  // USDC - Vault Devnet
  "0xc137E7382AA220D59Cc25f76f9aD72De962020Db": {
    address: "0xc137E7382AA220D59Cc25f76f9aD72De962020Db" as Address,
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
 * Cache for fetched token metadata (in-memory cache)
 */
const tokenMetadataCache = new Map<string, TokenMetadata>();



const tokenBrandColorsMap: Record<string, string> = {
  BTC: "#F7931A",
  WBTC: "#F7931A",
  VBTC: "#F7931A",
  USDC: "#2775CA",
  USDT: "#50AF95",
  DAI: "#F5AC37",
  ETH: "#627EEA",
  WETH: "#627EEA",
};

const defaultTokenBrandColor = "#0B53BF";

/**
 * Get brand color for a token symbol
 * Used for UI theming (e.g., slider active colors)
 *
 * @param symbol - Token symbol (e.g., "USDC", "BTC")
 * @returns Hex color code for the token's brand color
 */
export function getTokenBrandColor(symbol: string): string {
  return tokenBrandColorsMap[symbol.toUpperCase()] ?? defaultTokenBrandColor;
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
    logger.warn(`[TokenService] Invalid token address: ${address}`);
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
 * Generate a data URI for a token icon fallback
 * Creates a circular SVG with the token's first letter
 *
 * @param symbol - Token symbol
 * @returns Data URI for an SVG icon
 */
function generateTokenIconFallback(symbol: string): string {
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
