import { describe, expect, it } from "vitest";

import type { ETHConfig } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

import { createETHWalletConfig } from "../ethConfigBuilder";

const ethConfig: ETHConfig = {
  chainId: 11155111,
  chainName: "Sepolia",
  rpcUrl: "https://rpc.example.com",
  explorerUrl: "https://explorer.example.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

describe("createETHWalletConfig", () => {
  it("builds a single ETH chain entry from the network config", () => {
    expect(createETHWalletConfig({ networkConfigs: { ETH: ethConfig } })).toEqual([
      { chain: "ETH", config: ethConfig },
    ]);
  });

  it("throws instead of returning an empty config when the ETH network config is missing", () => {
    // An empty config builds zero connectors, so `requiredChainIds` ends up
    // empty and the dialog reports its requirements as satisfied with no wallet
    // connected at all.
    expect(() => createETHWalletConfig({ networkConfigs: {} })).toThrow(WalletError);
    try {
      createETHWalletConfig({ networkConfigs: {} });
    } catch (error) {
      expect((error as WalletError).code).toBe(ERROR_CODES.WALLET_CONFIG_REQUIRED);
    }
  });

  it("throws when ETH is not among the requested chains", () => {
    expect(() => createETHWalletConfig({ chains: [], networkConfigs: { ETH: ethConfig } })).toThrow(WalletError);
  });
});
