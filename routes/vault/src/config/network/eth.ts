import type { Chain } from 'viem';
import { mainnet, sepolia, localhost } from 'viem/chains';

export interface ETHConfig {
  chain: Chain;
  rpcUrl: string;
  networkName: string;
  coinSymbol: string;
  displayUSD: boolean;
}

const defaultNetwork = 'localhost';
export const network = process.env.NEXT_PUBLIC_ETH_NETWORK ?? defaultNetwork;

const config: Record<string, ETHConfig> = {
  mainnet: {
    chain: mainnet,
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL ?? 'https://eth.llamarpc.com',
    networkName: 'Ethereum Mainnet',
    coinSymbol: 'ETH',
    displayUSD: true,
  },
  sepolia: {
    chain: sepolia,
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL ?? 'https://rpc.sepolia.org',
    networkName: 'Sepolia Testnet',
    coinSymbol: 'ETH',
    displayUSD: false,
  },
  localhost: {
    chain: localhost,
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL ?? 'http://localhost:32003',
    networkName: 'Local Anvil',
    coinSymbol: 'ETH',
    displayUSD: false,
  },
};

export function getNetworkConfigETH(): ETHConfig {
  return config[network] ?? config[defaultNetwork];
}
