/** Read positions from the chain. Use the indexer for collateral details. */

import { getPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "@/clients/eth-contract/client";

import {
  AaveSpoke,
  type AaveSpokeUserAccountData,
  type AaveSpokeUserPosition,
} from "../clients";
import { getAaveAdapterAddress } from "../config";
import { hasDebtFromPosition } from "../utils";

import {
  fetchAaveActivePositionsWithCollaterals,
  type AavePosition,
  type AavePositionCollateral,
} from "./fetchPositions";

/** Debt in one reserve. */
export interface DebtPosition {
  reserveId: bigint;
  drawnShares: bigint;
  premiumShares: bigint;
  totalDebt: bigint;
}

/** Chain position with optional indexer timestamps and collateral details. */
export interface AavePositionWithLiveData
  extends Omit<AavePosition, "createdAt" | "updatedAt"> {
  vaultIds: readonly string[];
  createdAt?: bigint;
  updatedAt?: bigint;
  /** Collateral entries for this position */
  collaterals: AavePositionCollateral[];
  /** Live position data from Spoke */
  liveData: {
    drawnShares: bigint;
    /** Premium shares (interest) */
    premiumShares: bigint;
    suppliedShares: bigint;
    hasDebt: boolean;
    /**
     * The liquidation path uses this stored key. Reserve changes do not
     * update it. Split calculations must prefer it over the reserve's key.
     */
    dynamicConfigKey: number;
  };
  /** Authoritative health factor and values from Spoke's on-chain oracle. */
  accountData: AaveSpokeUserAccountData;
  /** Only reserves with debt. Absent when the account has no debt. */
  debtPositions?: Map<bigint, DebtPosition>;
}

export interface GetUserPositionsOptions {
  /** All configured debt reserve IDs, including paused and frozen reserves. */
  borrowableReserveIds?: bigint[];
  /** vBTC collateral reserve ID from the Core Spoke configuration. */
  vbtcReserveId: bigint;
}

/**
 * The adapter supplies position existence, proxy, and collateral total.
 * Spoke reads supply account data and debt across the configured reserves.
 * Missing indexer details must not hide debt or prevent repayment.
 * @returns Array of positions with live data (0 or 1 position)
 */
export async function getUserPositionsWithLiveData(
  depositor: string,
  spokeAddress: Address,
  options: GetUserPositionsOptions,
): Promise<AavePositionWithLiveData[]> {
  const { borrowableReserveIds, vbtcReserveId } = options;

  const [position, indexedPositions] = await Promise.all([
    getPosition(
      ethClient.getPublicClient(),
      getAaveAdapterAddress(),
      depositor as Address,
    ),
    fetchAaveActivePositionsWithCollaterals(depositor).catch(() => []),
  ]);
  if (!position) return [];

  const proxyAddress = position.proxyContract;
  const indexedPosition = indexedPositions.find(
    (item) =>
      item.depositorAddress.toLowerCase() === depositor.toLowerCase() &&
      item.proxyContract.toLowerCase() === proxyAddress.toLowerCase(),
  );

  // Read the collateral position and account data in one multicall.
  const { position: spokePosition, accountData } =
    await AaveSpoke.getUserPositionWithAccountData(
      spokeAddress,
      vbtcReserveId,
      proxyAddress,
    );

  let debtPositions: Map<bigint, DebtPosition> | undefined;
  if (accountData.borrowCount > 0n) {
    // Require the full reserve list so the Repay picker cannot omit debt.
    if (!borrowableReserveIds || borrowableReserveIds.length === 0) {
      throw new Error(
        `Aave debt reserve discovery: on-chain reports ${accountData.borrowCount} debt reserve(s) but no reserve IDs were provided to probe.`,
      );
    }
    debtPositions = await fetchDebtPositionsForReserves(
      proxyAddress,
      spokeAddress,
      borrowableReserveIds,
    );
    if (BigInt(debtPositions.size) < accountData.borrowCount) {
      throw new Error(
        `Aave debt reserve discovery: on-chain reports ${accountData.borrowCount} debt reserve(s), found ${debtPositions.size}. The reserve list is likely incomplete.`,
      );
    }
  }

  return [
    {
      ...indexedPosition,
      depositorAddress: depositor,
      proxyContract: proxyAddress,
      totalCollateral: position.totalCollateralBTC,
      vaultIds: position.vaultIds,
      collaterals: indexedPosition?.collaterals ?? [],
      liveData: {
        drawnShares: spokePosition.drawnShares,
        premiumShares: spokePosition.premiumShares,
        suppliedShares: spokePosition.suppliedShares,
        hasDebt: hasDebtFromPosition(spokePosition),
        dynamicConfigKey: spokePosition.dynamicConfigKey,
      },
      accountData,
      debtPositions,
    },
  ];
}

/** Batch reserve probes and debt reads. Debt reads propagate RPC failures. */
async function fetchDebtPositionsForReserves(
  proxyAddress: Address,
  spokeAddress: Address,
  reserveIds: bigint[],
): Promise<Map<bigint, DebtPosition>> {
  const results = new Map<bigint, DebtPosition>();
  if (reserveIds.length === 0) return results;

  const positions = await AaveSpoke.getUserPositionsBatch(
    spokeAddress,
    reserveIds,
    proxyAddress,
  );

  const reservesWithDebt: {
    reserveId: bigint;
    position: AaveSpokeUserPosition;
  }[] = [];
  positions.forEach((position, idx) => {
    if (position && hasDebtFromPosition(position)) {
      reservesWithDebt.push({ reserveId: reserveIds[idx], position });
    }
  });

  if (reservesWithDebt.length === 0) return results;

  const totalDebts = await AaveSpoke.getUserTotalDebtsBatch(
    spokeAddress,
    reservesWithDebt.map((r) => r.reserveId),
    proxyAddress,
  );

  reservesWithDebt.forEach(({ reserveId, position }, idx) => {
    results.set(reserveId, {
      reserveId,
      drawnShares: position.drawnShares,
      premiumShares: position.premiumShares,
      totalDebt: totalDebts[idx],
    });
  });

  return results;
}
