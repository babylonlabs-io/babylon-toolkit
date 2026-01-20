/**
 * Aave Spoke Client - Read operations
 *
 * Provides read operations for interacting with Aave v4 Spoke contracts.
 * Used to fetch live user position data (debt, collateral) from the Core Spoke.
 *
 * Note: Reserve data should be fetched from the indexer via fetchReserves.ts
 * since it doesn't need to be live and benefits from caching.
 */

import type { Address, PublicClient } from "viem";

import type {
  AaveSpokeUserAccountData,
  AaveSpokeUserPosition,
} from "../types.js";
import { hasDebtFromPosition } from "../utils/debtUtils.js";
import AaveSpokeABI from "./abis/AaveSpoke.abi.json";

/** Account data result type from contract */
type AccountDataResult = {
  riskPremium: bigint;
  avgCollateralFactor: bigint;
  healthFactor: bigint;
  totalCollateralValue: bigint;
  totalDebtValue: bigint;
  activeCollateralCount: bigint;
  borrowedCount: bigint;
};

/** Position result type from contract */
type PositionResult = {
  drawnShares: bigint;
  premiumShares: bigint;
  realizedPremiumRay: bigint;
  premiumOffsetRay: bigint;
  suppliedShares: bigint;
  dynamicConfigKey: number;
};

/**
 * Maps contract result to AaveSpokeUserPosition
 */
function mapPositionResult(result: PositionResult): AaveSpokeUserPosition {
  return {
    drawnShares: result.drawnShares,
    premiumShares: result.premiumShares,
    realizedPremiumRay: result.realizedPremiumRay,
    premiumOffsetRay: result.premiumOffsetRay,
    suppliedShares: result.suppliedShares,
    dynamicConfigKey: result.dynamicConfigKey,
  };
}

/**
 * Get aggregated user account health data from AAVE spoke.
 *
 * **Live data** - Fetches real-time account health including health factor, total collateral,
 * and total debt across all reserves. Values are calculated on-chain using AAVE oracles
 * and are the authoritative source for liquidation decisions.
 *
 * @param publicClient - Viem public client for reading contracts (from `createPublicClient()`)
 * @param spokeAddress - AAVE Spoke contract address (BTC Vault Core Spoke for vBTC collateral)
 * @param userAddress - User's proxy contract address (NOT user's wallet address)
 * @returns User account data with health metrics, collateral, and debt values
 *
 * @example
 * ```typescript
 * import { getUserAccountData } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 * import { createPublicClient, http } from "viem";
 * import { sepolia } from "viem/chains";
 *
 * const publicClient = createPublicClient({
 *   chain: sepolia,
 *   transport: http()
 * });
 *
 * const accountData = await getUserAccountData(
 *   publicClient,
 *   "0x123...", // AAVE Spoke address
 *   "0x456..."  // User's AAVE proxy address (from getPosition)
 * );
 *
 * console.log("Health Factor:", accountData.healthFactor);
 * console.log("Collateral (USD):", accountData.totalCollateralValue);
 * console.log("Debt (USD):", accountData.totalDebtValue);
 * ```
 *
 * @remarks
 * **Return values:**
 * - `healthFactor` - WAD format (1e18 = 1.0). Below 1.0 = liquidatable
 * - `totalCollateralValue` - USD value in base currency (1e26 = $1)
 * - `totalDebtValue` - USD value in base currency (1e26 = $1)
 * - `avgCollateralFactor` - Weighted average LTV in BPS (8000 = 80%)
 * - `riskPremium` - Additional risk premium
 *
 * **Use cases:**
 * - Check liquidation risk before borrowing
 * - Calculate safe borrow amount
 * - Monitor position health
 * - Display UI health indicators
 */
export async function getUserAccountData(
  publicClient: PublicClient,
  spokeAddress: Address,
  userAddress: Address,
): Promise<AaveSpokeUserAccountData> {
  const result = await publicClient.readContract({
    address: spokeAddress,
    abi: AaveSpokeABI,
    functionName: "getUserAccountData",
    args: [userAddress],
  });

  const data = result as AccountDataResult;
  return {
    riskPremium: data.riskPremium,
    avgCollateralFactor: data.avgCollateralFactor,
    healthFactor: data.healthFactor,
    totalCollateralValue: data.totalCollateralValue,
    totalDebtValue: data.totalDebtValue,
    activeCollateralCount: data.activeCollateralCount,
    borrowedCount: data.borrowedCount,
  };
}

/**
 * Get user position from the Spoke
 *
 * This fetches live data from the contract because debt accrues interest
 * and needs to be current for accurate health factor calculations.
 *
 * @param publicClient - Viem public client for reading contracts
 * @param spokeAddress - Aave Spoke contract address
 * @param reserveId - Reserve ID
 * @param userAddress - User's proxy contract address
 * @returns User position data
 */
export async function getUserPosition(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<AaveSpokeUserPosition> {
  const result = await publicClient.readContract({
    address: spokeAddress,
    abi: AaveSpokeABI,
    functionName: "getUserPosition",
    args: [reserveId, userAddress],
  });

  return mapPositionResult(result as PositionResult);
}

/**
 * Check if a user has any debt in a reserve
 *
 * @param publicClient - Viem public client for reading contracts
 * @param spokeAddress - Aave Spoke contract address
 * @param reserveId - Reserve ID
 * @param userAddress - User's proxy contract address
 * @returns true if user has debt
 */
export async function hasDebt(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<boolean> {
  const position = await getUserPosition(
    publicClient,
    spokeAddress,
    reserveId,
    userAddress,
  );
  return hasDebtFromPosition(position);
}

/**
 * Check if a user has supplied collateral in a reserve
 *
 * @param publicClient - Viem public client for reading contracts
 * @param spokeAddress - Aave Spoke contract address
 * @param reserveId - Reserve ID
 * @param userAddress - User's proxy contract address
 * @returns true if user has supplied collateral
 */
export async function hasCollateral(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<boolean> {
  const position = await getUserPosition(
    publicClient,
    spokeAddress,
    reserveId,
    userAddress,
  );
  return position.suppliedShares > 0n;
}

/**
 * Get user's exact total debt in a reserve (token units, not shares).
 *
 * Returns the precise amount owed including accrued interest. Essential for full repayment.
 * Debt accrues interest every block, so this must be fetched live from the contract.
 *
 * @param publicClient - Viem public client for reading contracts
 * @param spokeAddress - AAVE Spoke contract address
 * @param reserveId - Reserve ID for the debt asset (e.g., `2n` for USDC)
 * @param userAddress - User's proxy contract address
 * @returns Total debt amount in token units (e.g., for USDC: `100000000n` = 100 USDC)
 *
 * @example
 * ```typescript
 * import { getUserTotalDebt, FULL_REPAY_BUFFER_BPS } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 * import { formatUnits } from "viem";
 *
 * const totalDebt = await getUserTotalDebt(
 *   publicClient,
 *   AAVE_SPOKE_ADDRESS,
 *   2n, // USDC reserve
 *   proxyAddress
 * );
 *
 * // For full repayment, add buffer to account for interest accrual
 * const repayAmount = totalDebt + (totalDebt / FULL_REPAY_BUFFER_BPS);
 *
 * console.log("Debt:", formatUnits(totalDebt, 6), "USDC");
 * ```
 *
 * @remarks
 * **Important for full repayment:**
 * - Add `FULL_REPAY_BUFFER_BPS` buffer to account for interest between fetch and tx execution
 * - Contract only takes what's owed; excess stays in wallet
 * - For partial repayment, use any amount less than total debt
 */
export async function getUserTotalDebt(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<bigint> {
  const result = await publicClient.readContract({
    address: spokeAddress,
    abi: AaveSpokeABI,
    functionName: "getUserTotalDebt",
    args: [reserveId, userAddress],
  });

  return result as bigint;
}
