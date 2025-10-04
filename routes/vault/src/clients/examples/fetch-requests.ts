import { type Address } from 'viem';
import * as BTCVaultsManager from '../eth-contract/btc-vaults-manager/query';

function parseArgs(argv: string[]): { manager: Address; user: Address } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const value = argv[i + 1];
      args.set(key.slice(2), value);
      i++;
    }
  }

  const manager = args.get('manager');
  const user = args.get('user');

  if (!manager || !user) {
    console.error('Usage: tsx src/clients/examples/fetch-requests.ts --manager <address> --user <address>');
    process.exit(1);
  }

  return { manager: manager as Address, user: user as Address };
}

async function listUserRequests(manager: Address, user: Address) {
  const ids = await BTCVaultsManager.getDepositorPeginRequests(manager, user);
  if (!ids.length) return [];
  const requests = await Promise.all(
    ids.map((id) => BTCVaultsManager.getPeginRequest(manager, id))
  );
  return requests;
}

async function main(): Promise<void> {
  const { manager, user } = parseArgs(process.argv.slice(2));

  console.log('Fetching requests...', { manager, user });
  try {
    const requests = await listUserRequests(manager, user);
    console.log(`Found ${requests.length} request(s)`);
    for (const r of requests) {
      console.log('---');
      console.log('txHash:', r.txHash);
      console.log('depositor:', r.depositor);
      console.log('amount:', r.amount.toString());
      console.log('status:', r.status);
    }
  } catch (error) {
    console.error('Failed to fetch requests:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();


