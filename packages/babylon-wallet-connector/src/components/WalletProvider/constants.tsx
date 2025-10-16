import { ExternalWallets } from "@/components/ExternalWallets";
import { ChainConfigArr } from "@/context/Chain.context";
import { Network } from "@/core/types";

import { BBN_TESTNET_RPC_URL, bbnTestnet } from "./tesnet";

export const ONE_HOUR = 60 * 60 * 1000;

export const config: ChainConfigArr = [
  {
    chain: "BTC",
    connectors: [
      {
        id: "tomo-connect",
        widget: ({ onError }) => <ExternalWallets chainName="bitcoin" onError={onError} />,
      },
    ],
    config: {
      coinName: "Signet BTC",
      coinSymbol: "sBTC",
      networkName: "BTC signet",
      mempoolApiUrl: "https://mempool.space/signet",
      network: Network.SIGNET,
    },
  },
  {
    chain: "BBN",
    connectors: [
      {
        id: "tomo-connect",
        widget: ({ onError }) => <ExternalWallets chainName="cosmos" onError={onError} />,
      },
    ],
    config: {
      networkName: bbnTestnet.currencies[0].coinDenom,
      networkFullName: bbnTestnet.chainName,
      coinSymbol: bbnTestnet.currencies[0].coinDenom,
      chainId: bbnTestnet.chainId,
      rpc: BBN_TESTNET_RPC_URL,
      chainData: bbnTestnet,
    },
  },
  {
    chain: "ETH",
    config: {
      chainId: 31337, // Anvil local node
      chainName: "Anvil Local",
      rpcUrl: "http://127.0.0.1:8545",
      explorerUrl: "http://localhost:8545",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
    },
  },
];
