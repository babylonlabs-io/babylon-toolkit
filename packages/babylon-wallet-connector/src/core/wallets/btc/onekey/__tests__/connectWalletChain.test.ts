import { describe, expect, it, vi } from "vitest";

import { type BTCConfig, Network } from "@/core/types";
import { OneKeyProvider } from "@/core/wallets/btc/onekey/provider";
import { MIN_ONEKEY_VERSION } from "@/core/wallets/btc/onekey/version";
import { ERROR_CODES } from "@/error";

const signetConfig: BTCConfig = {
  coinName: "Signet BTC",
  coinSymbol: "sBTC",
  networkName: "BTC signet",
  mempoolApiUrl: "https://mempool.example",
  network: Network.SIGNET,
};

const MAINNET_CHAIN = { enum: "BITCOIN_MAINNET", name: "Bitcoin Mainnet", network: "livenet" };
const SIGNET_CHAIN = { enum: "BITCOIN_SIGNET", name: "Bitcoin Signet", network: "testnet" };
const PUBLIC_KEY = "02" + "aa".repeat(32);

describe("OneKeyProvider.connectWallet network alignment", () => {
  it("switches a mainnet dApp connection to signet and stores the signet account", async () => {
    let chain = MAINNET_CHAIN;
    const switchChain = vi.fn(async () => {
      chain = SIGNET_CHAIN;
      return SIGNET_CHAIN;
    });
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => chain),
          switchChain,
          getAddress: vi.fn(async () => (chain === SIGNET_CHAIN ? "tb1psignet" : "bc1pmainnet")),
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await provider.connectWallet();

    expect(switchChain).toHaveBeenCalledWith("BITCOIN_SIGNET");
    await expect(provider.getAddress()).resolves.toBe("tb1psignet");
  });

  it("does not switch when the dApp connection is already on signet", async () => {
    const switchChain = vi.fn();
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => SIGNET_CHAIN),
          switchChain,
          getAddress: vi.fn(async () => "tb1psignet"),
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await provider.connectWallet();

    expect(switchChain).not.toHaveBeenCalled();
  });

  it("rejects with UNSUPPORTED_NETWORK when the chain is still mainnet after the switch resolves", async () => {
    const getAddress = vi.fn(async () => "bc1pmainnet");
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => MAINNET_CHAIN),
          switchChain: vi.fn(async () => SIGNET_CHAIN),
          getAddress,
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await expect(provider.connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      wallet: "OneKey",
    });
    expect(getAddress).not.toHaveBeenCalled();
  });

  it("rejects with CONNECTION_REJECTED when the user rejects the network switch", async () => {
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => MAINNET_CHAIN),
          switchChain: vi.fn(async () => {
            throw new Error("User rejected the request.");
          }),
          getAddress: vi.fn(async () => "bc1pmainnet"),
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await expect(provider.connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.CONNECTION_REJECTED,
      wallet: "OneKey",
    });
  });
});
