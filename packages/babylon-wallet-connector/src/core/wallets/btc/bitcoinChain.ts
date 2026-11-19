import { Network } from "@/core/types";

/** Chain identifiers of the `getChain` / `switchChain` API that UniSat defines and OneKey implements. */
export enum BitcoinChain {
  BITCOIN_SIGNET = "BITCOIN_SIGNET",
  BITCOIN_MAINNET = "BITCOIN_MAINNET",
  BITCOIN_TESTNET = "BITCOIN_TESTNET",
}

/** What `getChain` and `switchChain` resolve to. */
export interface BitcoinChainResponse {
  enum: BitcoinChain;
  name: string;
  network: "testnet" | "livenet";
}

export const mapChainToNetwork = (chain: BitcoinChain): Network | null => {
  switch (chain) {
    case BitcoinChain.BITCOIN_MAINNET:
      return Network.MAINNET;
    case BitcoinChain.BITCOIN_SIGNET:
      return Network.SIGNET;
    case BitcoinChain.BITCOIN_TESTNET:
      return Network.TESTNET;
    default:
      return null;
  }
};

export const mapNetworkToChain = (network: Network): BitcoinChain => {
  switch (network) {
    case Network.MAINNET:
      return BitcoinChain.BITCOIN_MAINNET;
    case Network.SIGNET:
      return BitcoinChain.BITCOIN_SIGNET;
    case Network.TESTNET:
      return BitcoinChain.BITCOIN_TESTNET;
  }
};
