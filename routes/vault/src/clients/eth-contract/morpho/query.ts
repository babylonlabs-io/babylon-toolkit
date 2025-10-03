// Morpho Protocol - Read operations (queries)

import type { Abi, Address } from 'viem';
import { ethClient } from '../client';
import morphoAbi from './abis/morpho-abi.json';
import type { Hex } from 'viem';
import { toHex } from 'viem';
import { computeDerived } from './derived';
import { getMetadata } from '../erc20/query';
import type { MorphoMarketSummary } from './types';

/**
 * Get Morpho market information by ID
 * @param contractAddress - Morpho contract address
 * @param id - Market ID (string or bigint)
 * @returns Market summary with tokens, LLTV, and utilization data
 */
export async function getMarketById(
  contractAddress: Address,
  id: string | bigint
): Promise<MorphoMarketSummary> {
  const publicClient = ethClient.getPublicClient();
  const idHex: Hex = toHex(typeof id === 'bigint' ? id : BigInt(id), { size: 32 });

  const [marketResult, paramsResult] = await Promise.all([
    publicClient.readContract({
      address: contractAddress,
      abi: morphoAbi as Abi,
      functionName: 'market',
      args: [idHex],
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: morphoAbi as Abi,
      functionName: 'idToMarketParams',
      args: [idHex],
    }),
  ]);

  const [totalSupplyAssets, , totalBorrowAssets] = marketResult as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint
  ];

  const [loanToken, collateralToken, , , lltv] = paramsResult as readonly [
    Address,
    Address,
    Address,
    Address,
    bigint
  ];

  const [loan, collateral] = await Promise.all([
    getMetadata(loanToken),
    getMetadata(collateralToken),
  ]);

  const derived = computeDerived({ totalSupplyAssets, totalBorrowAssets, lltv });

  return {
    id: typeof id === 'bigint' ? id.toString() : id,
    address: contractAddress,
    tokens: {
      loan: { address: loan.address, symbol: loan.symbol },
      collateral: { address: collateral.address, symbol: collateral.symbol },
    },
    lltvPercent: derived.lltvPercent,
    totalMarketSizeAssets: derived.totalMarketSizeAssets,
    totalLiquidityAssets: derived.totalLiquidityAssets,
    utilizationPercent: derived.utilizationPercent,
  };
}
