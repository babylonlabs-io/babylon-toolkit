import { getMarketById } from '../eth-contract/morpho/query';

function parseArgs(argv: string[]): { marketId: string } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const value = argv[i + 1];
      args.set(key.slice(2), value);
      i++;
    }
  }

  const marketId = args.get('marketId');
  if (!marketId) {
    console.error('Usage: tsx src/clients/examples/fetch-market.ts --marketId <hex|number>');
    process.exit(1);
  }
  return { marketId };
}

async function main(): Promise<void> {
  const { marketId } = parseArgs(process.argv.slice(2));

  console.log('Fetching Morpho market...', { marketId });
  try {
    const market = await getMarketById(marketId);
    console.log('--- Market ---');
    console.log('id:', market.id);
    console.log('loanToken:', market.loanToken.address);
    console.log('collateralToken:', market.collateralToken.address);
    console.log('oracle:', market.oracle);
    console.log('irm:', market.irm);
    console.log('lltv:', market.lltv.toString());
    console.log('totalSupplyAssets:', market.totalSupplyAssets.toString());
    console.log('totalBorrowAssets:', market.totalBorrowAssets.toString());
    console.log('utilizationPercent:', market.utilizationPercent);
    console.log('lltvPercent:', market.lltvPercent);
  } catch (error) {
    console.error('Failed to fetch market:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();


