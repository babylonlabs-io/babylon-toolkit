/**
 * Interest Rate Model (IRM) Service
 * 
 * Fetches and calculates actual borrow rates from IRM contracts
 * instead of using hardcoded estimations.
 */

import type { Address } from "viem";

import { ethClient } from "../../clients/eth-contract/client";

/**
 * Standard IRM interface for reading borrow rates
 * Most IRM contracts implement this interface
 */
const IRM_ABI = [
  {
    inputs: [
      { name: "marketParams", type: "tuple", 
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" }
        ]
      },
      { name: "market", type: "tuple",
        components: [
          { name: "totalSupplyAssets", type: "uint128" },
          { name: "totalSupplyShares", type: "uint128" },
          { name: "totalBorrowAssets", type: "uint128" },
          { name: "totalBorrowShares", type: "uint128" },
          { name: "lastUpdate", type: "uint128" },
          { name: "fee", type: "uint128" }
        ]
      }
    ],
    name: "borrowRate",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Alternative method for simpler IRMs
  {
    inputs: [
      { name: "utilization", type: "uint256" }
    ],
    name: "borrowRateView",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Market parameters for IRM calculations
 */
export interface MarketParamsForIRM {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

/**
 * Market state for IRM calculations
 */
export interface MarketStateForIRM {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

/**
 * Fetch the current borrow rate from an IRM contract
 * 
 * @param irmAddress - Address of the IRM contract
 * @param marketParams - Market parameters
 * @param marketState - Current market state
 * @returns Borrow rate per second (with 18 decimals)
 */
export async function getBorrowRate(
  irmAddress: Address,
  marketParams: MarketParamsForIRM,
  marketState: MarketStateForIRM,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  try {
    // Try the standard borrowRate method first
    const rate = await publicClient.readContract({
      address: irmAddress,
      abi: IRM_ABI,
      functionName: "borrowRate",
      args: [marketParams, marketState],
    });
    
    return rate as bigint;
  } catch (error) {
    console.warn("Standard borrowRate method failed, trying fallback:", error);
    
    // Fallback: Calculate utilization and use borrowRateView
    const utilization = calculateUtilization(
      marketState.totalSupplyAssets,
      marketState.totalBorrowAssets,
    );
    
    try {
      const rate = await publicClient.readContract({
        address: irmAddress,
        abi: IRM_ABI,
        functionName: "borrowRateView",
        args: [utilization],
      });
      
      return rate as bigint;
    } catch (fallbackError) {
      console.error("Both IRM methods failed:", fallbackError);
      // Return 0 if we can't get the rate
      return 0n;
    }
  }
}

/**
 * Calculate market utilization
 * 
 * @param totalSupplyAssets - Total supplied assets
 * @param totalBorrowAssets - Total borrowed assets
 * @returns Utilization rate (with 18 decimals, 0 to 1e18)
 */
export function calculateUtilization(
  totalSupplyAssets: bigint,
  totalBorrowAssets: bigint,
): bigint {
  if (totalSupplyAssets === 0n) return 0n;
  
  // Return utilization with 18 decimals (0 to 1e18 for 0% to 100%)
  return (totalBorrowAssets * BigInt(1e18)) / totalSupplyAssets;
}

/**
 * Convert borrow rate from per-second to APR
 * 
 * @param borrowRatePerSecond - Borrow rate per second (18 decimals)
 * @returns Annual percentage rate (APR) as a percentage number
 */
export function convertBorrowRateToAPR(borrowRatePerSecond: bigint): number {
  // borrowRatePerSecond has 18 decimals
  // Multiply by seconds in a year (365.25 days)
  const secondsPerYear = 365.25 * 24 * 60 * 60;
  
  // Convert to APR percentage
  // borrowRatePerSecond * secondsPerYear * 100 / 1e18
  const apr = (Number(borrowRatePerSecond) * secondsPerYear * 100) / 1e18;
  
  return apr;
}

/**
 * Get borrow APR for a market
 * 
 * @param irmAddress - IRM contract address
 * @param marketParams - Market parameters
 * @param marketState - Market state
 * @returns Borrow APR as a percentage or null if unable to fetch
 */
export async function getMarketBorrowAPR(
  irmAddress: Address,
  marketParams: MarketParamsForIRM,
  marketState: MarketStateForIRM,
): Promise<number | null> {
  try {
    const borrowRate = await getBorrowRate(irmAddress, marketParams, marketState);
    
    if (borrowRate === 0n) {
      // If we couldn't get the rate, return null
      return null;
    }
    
    return convertBorrowRateToAPR(borrowRate);
  } catch (error) {
    console.error("Failed to get market borrow APR:", error);
    return null;
  }
}
