import { describe, expect, it } from "vitest";

import { type BTCConfig, type ETHConfig, Network } from "@/core/types";
import { ERROR_CODES } from "@/error";
import { createWalletConfig } from "@/utils/btcEthConfigBuilder";

const BTC: BTCConfig = {
  coinName: "Signet BTC",
  coinSymbol: "sBTC",
  networkName: "BTC signet",
  mempoolApiUrl: "https://mempool.example",
  network: Network.SIGNET,
};

const ETH: ETHConfig = {
  chainId: 11155111,
  chainName: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrl: "https://rpc.example",
  explorerUrl: "https://explorer.example",
};

describe("btc-eth createWalletConfig", () => {
  it("builds a Bitcoin and an Ethereum entry with no external connectors", () => {
    expect(createWalletConfig({ chains: ["ETH", "BTC"], networkConfigs: { BTC, ETH } })).toEqual([
      { chain: "BTC", config: BTC },
      { chain: "ETH", config: ETH },
    ]);
  });

  it("throws WALLET_CONFIG_REQUIRED naming the listed chain that has no network config", () => {
    expect(() => createWalletConfig({ chains: ["BTC", "ETH"], networkConfigs: { ETH } })).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.WALLET_CONFIG_REQUIRED, chainId: "BTC" }),
    );
    expect(() => createWalletConfig({ chains: ["BTC", "ETH"], networkConfigs: { BTC } })).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.WALLET_CONFIG_REQUIRED, chainId: "ETH" }),
    );
  });

  it("throws WALLET_CONFIG_REQUIRED when no chain is listed", () => {
    expect(() => createWalletConfig({ chains: [], networkConfigs: { BTC, ETH } })).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.WALLET_CONFIG_REQUIRED }),
    );
  });
});
