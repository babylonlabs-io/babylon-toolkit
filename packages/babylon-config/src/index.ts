// Network configurations
export * from './network/eth';
export * from './network/btc';

// Cross-network pairing validation
// Both modules above throw if their individual env vars are invalid.
// Here we enforce that the combination is a known safe pairing.
const _btcNetwork = process.env.NEXT_PUBLIC_BTC_NETWORK;
const _ethChainId = process.env.NEXT_PUBLIC_ETH_CHAINID;

const VALID_PAIRINGS: Array<{ btc: string; eth: string }> = [
  { btc: "mainnet", eth: "1" },
  { btc: "signet", eth: "11155111" },
];

const isPaired = VALID_PAIRINGS.some(
  (p) => p.btc === _btcNetwork && p.eth === _ethChainId,
);

if (!isPaired) {
  throw new Error(
    `Invalid network pairing: NEXT_PUBLIC_BTC_NETWORK="${_btcNetwork}" with NEXT_PUBLIC_ETH_CHAINID="${_ethChainId}". ` +
      `Allowed pairings: mainnet+1 (production), signet+11155111 (testnet).`,
  );
}
