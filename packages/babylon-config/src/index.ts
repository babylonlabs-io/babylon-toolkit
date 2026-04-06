// Network configurations
export * from './network/eth';
export * from './network/btc';

import {
  btcNetwork,
  BTC_MAINNET,
  BTC_SIGNET,
} from './network/btc';
import {
  chainId,
  ETH_MAINNET_CHAIN_ID,
  ETH_SEPOLIA_CHAIN_ID,
} from './network/eth';

// Cross-network pairing validation
// Both modules above throw if their individual env vars are invalid.
// Here we enforce that the combination is a known safe pairing.
const VALID_PAIRINGS: Array<{ btc: typeof BTC_MAINNET | typeof BTC_SIGNET; eth: typeof ETH_MAINNET_CHAIN_ID | typeof ETH_SEPOLIA_CHAIN_ID }> = [
  { btc: BTC_MAINNET, eth: ETH_MAINNET_CHAIN_ID },
  { btc: BTC_SIGNET, eth: ETH_SEPOLIA_CHAIN_ID },
];

const isPaired = VALID_PAIRINGS.some(
  (p) => p.btc === btcNetwork && p.eth === chainId,
);

if (!isPaired) {
  throw new Error(
    `Invalid network pairing: NEXT_PUBLIC_BTC_NETWORK="${btcNetwork}" with NEXT_PUBLIC_ETH_CHAINID="${chainId}". ` +
      `Allowed pairings: mainnet+1 (production), signet+11155111 (testnet).`,
  );
}
