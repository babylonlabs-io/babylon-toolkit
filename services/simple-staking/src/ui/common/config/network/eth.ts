import ethereumIcon from "@/ui/common/assets/ethereum.svg";

export interface ETHConfig {
  name: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  icon: string;
  displayUSD: boolean;
}

const config: Record<string, ETHConfig> = {
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
 */
export function getNetworkConfigETH(): ETHConfig {
  const network = process.env.NEXT_PUBLIC_NETWORK || "testnet";
  const networkKey = network === "localhost" ? "localhost" : network;
  const specificConfig = config[networkKey] ?? config.testnet;

  return specificConfig;
}
