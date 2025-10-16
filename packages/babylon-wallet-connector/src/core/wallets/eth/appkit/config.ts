import { createConfig, http } from "wagmi";
import { mainnet, sepolia, localhost } from "wagmi/chains";

/**
 * Fallback wagmi configuration
 * 
 * This config is used when no shared wagmi config is provided by the application.
 * It supports:
 * - Ethereum Mainnet (chainId: 1)
 * - Sepolia Testnet (chainId: 11155111)
 * - Localhost/Anvil (chainId: 31337)
 */
export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, localhost],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [localhost.id]: http("http://127.0.0.1:8545"), // Default Anvil RPC URL
  },
});

