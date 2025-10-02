const RAY = 1000000000000000000n;
function rayToPercent(ray: bigint): number {
  return Number(ray) / 1e16;
}

export function computeDerived(args: {
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  lltv: bigint;
}) {
  const { totalSupplyAssets, totalBorrowAssets, lltv } = args;

  const totalMarketSizeAssets = totalSupplyAssets;
  const totalLiquidityAssets = totalSupplyAssets > totalBorrowAssets
    ? totalSupplyAssets - totalBorrowAssets
    : 0n;
  const utilizationRay = totalSupplyAssets === 0n ? 0n : (totalBorrowAssets * RAY) / totalSupplyAssets;
  const utilizationPercent = rayToPercent(utilizationRay);
  const lltvPercent = rayToPercent(lltv);

  return { lltvPercent, utilizationPercent, totalMarketSizeAssets, totalLiquidityAssets };
}


