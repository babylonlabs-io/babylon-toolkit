import type { Abi, Address, PublicClient } from 'viem';
import { publicClient as defaultClient } from '../publicClient';
import morphoAbi from '../artifacts/morpho-abi.json';
import type { Hex } from 'viem';
import { toHex } from 'viem';
import { computeDerived } from './derived';
import { getMetadata } from '../erc20/read';
import type { MorphoMarketSummary } from './types';

export async function getMarketById(
  contractAddress: Address,
  id: string | bigint,
  client: PublicClient = defaultClient
): Promise<MorphoMarketSummary> {
  const idHex: Hex = toHex(typeof id === 'bigint' ? id : BigInt(id), { size: 32 });

  const [marketResult, paramsResult] = await Promise.all([
    client.readContract({ address: contractAddress, abi: morphoAbi as Abi, functionName: 'market', args: [idHex] }),
    client.readContract({ address: contractAddress, abi: morphoAbi as Abi, functionName: 'idToMarketParams', args: [idHex] })
  ]);

  const [
    totalSupplyAssets,
    ,
    totalBorrowAssets
  ] = marketResult as readonly [bigint, bigint, bigint, bigint, bigint, bigint];

  const [loanToken, collateralToken, , , lltv] = paramsResult as readonly [Address, Address, Address, Address, bigint];

  const [loan, collateral] = await Promise.all([
    getMetadata(loanToken, client),
    getMetadata(collateralToken, client)
  ]);

  const derived = computeDerived({ totalSupplyAssets, totalBorrowAssets, lltv });

  return {
    id: typeof id === 'bigint' ? id.toString() : id,
    address: contractAddress,
    tokens: {
      loan: { address: loan.address, symbol: loan.symbol },
      collateral: { address: collateral.address, symbol: collateral.symbol }
    },
    lltvPercent: derived.lltvPercent,
    totalMarketSizeAssets: derived.totalMarketSizeAssets,
    totalLiquidityAssets: derived.totalLiquidityAssets,
    utilizationPercent: derived.utilizationPercent
  };
}


