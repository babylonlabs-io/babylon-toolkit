/** Read positions from the chain. Use the indexer for collateral details. */

import { getPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { logger } from "@/infrastructure";
import { classifyCollateral } from "@/utils/collateral";

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

/** Chain position with optional collateral details from the indexer. */
export interface AavePositionWithLiveData
  extends Omit<AavePosition, "createdAt" | "updatedAt"> {
  vaultIds: readonly string[];
  indexerError?: Error;
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

  const [chainResult, indexerResult] = await Promise.allSettled([
    getPosition(
      ethClient.getPublicClient(),
      getAaveAdapterAddress(),
      depositor as Address,
    ),
    fetchAaveActivePositionsWithCollaterals(depositor),
  ]);
  if (chainResult.status === "rejected") throw chainResult.reason;
  const position = chainResult.value;
  if (!position) return [];

  const proxyAddress = position.proxyContract;
  const indexedPositions =
    indexerResult.status === "fulfilled" ? indexerResult.value : [];
  const indexedPosition = indexedPositions.find(
    (item) =>
      item.depositorAddress.toLowerCase() === depositor.toLowerCase() &&
      item.proxyContract.toLowerCase() === proxyAddress.toLowerCase(),
  );
  const collaterals = indexedPosition?.collaterals ?? [];
  // Only rows still backing the position on-chain. A withdrawing row has left
  // `position.vaultIds` already, so counting it would fake a mismatch.
  const activeCollaterals = collaterals.filter(
    (row) => classifyCollateral(row) === "active",
  );
  const indexerError =
    indexerResult.status === "rejected"
      ? new Error("Could not load indexed collateral details", {
          cause: indexerResult.reason,
        })
      : !indexedPosition ||
          position.vaultIds.length !== activeCollaterals.length ||
          position.vaultIds.some(
            (id) =>
              !activeCollaterals.some(
                (row) => row.vaultId.toLowerCase() === id.toLowerCase(),
              ),
          ) ||
          activeCollaterals.reduce((total, row) => total + row.amount, 0n) !==
            position.totalCollateralBTC
        ? new Error(
            "Indexed collateral details do not match the chain position",
          )
        : undefined;
  if (indexerError) logger.warn(indexerError.message, { error: indexerError });

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
      depositorAddress: depositor,
      proxyContract: proxyAddress,
      totalCollateral: position.totalCollateralBTC,
      vaultIds: position.vaultIds,
      collaterals,
      indexerError,
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
