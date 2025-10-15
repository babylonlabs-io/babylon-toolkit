import {
  getNetworkConfigETH as getBaseConfig,
  getETHChain,
  network,
  validateETHAddress as baseValidateETHAddress,
  type ExtendedETHConfig,
} from "@babylonlabs-io/config";

import ethereumIcon from "@/ui/common/assets/ethereum.svg";
import { ClientError, ERROR_CODES } from "@/ui/common/errors";

// Re-export for backward compatibility
export { getETHChain, network };

type Config = ExtendedETHConfig & { icon: string };

const config: Record<string, Config> = {
  mainnet: {
    name: "Ethereum",
    chainId: 1,
    chainName: "Ethereum Mainnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: true,
  },
  canary: {
    // Using Sepolia for canary
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
  testnet: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
  canonDevnet: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
  localhost: {
    name: "Local Anvil",
    chainId: 31337,
    chainName: "Localhost",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "http://localhost:8545",
    explorerUrl: "",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
};

/**
 * Get network config with icon for UI
 * Wraps the base config and adds the icon
 */
export function getNetworkConfigETH(): Config {
  const baseConfig = getBaseConfig();
  const networkKey = network === "localhost" ? "localhost" : network;
  const specificConfig = config[networkKey] ?? config.mainnet;

  return {
    ...baseConfig,
    icon: specificConfig.icon,
  };
}

/**
 * Validate ETH address with ClientError wrapper
 * Wraps base validation with application-specific error handling
 */
export function validateETHAddress(address: string): void {
  try {
    baseValidateETHAddress(address);
  } catch (error) {
    throw new ClientError(
      ERROR_CODES.VALIDATION_ERROR,
      error instanceof Error ? error.message : "Invalid Ethereum address",
    );
  }
}
