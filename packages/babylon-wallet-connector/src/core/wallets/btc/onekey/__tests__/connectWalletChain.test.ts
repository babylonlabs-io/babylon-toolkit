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

  it("rejects with UNSUPPORTED_NETWORK when the switch fails for a reason other than a rejection", async () => {
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => MAINNET_CHAIN),
          switchChain: vi.fn(async () => {
            throw new Error("Switch network failed");
          }),
          getAddress: vi.fn(async () => "bc1pmainnet"),
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await expect(provider.connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      message: "Switch network failed",
      wallet: "OneKey",
    });
  });

  it("asks the user to choose the network by hand when OneKey has no switchChain", async () => {
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => MAINNET_CHAIN),
          getAddress: vi.fn(async () => "bc1pmainnet"),
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await expect(provider.connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      message:
        "OneKey Wallet cannot switch to BTC signet. Choose BTC signet in the OneKey connection request and try again.",
      wallet: "OneKey",
    });
  });

  it("keeps a timed-out switch as a retryable CONNECTION_FAILED", async () => {
    vi.useFakeTimers();
    try {
      const provider = new OneKeyProvider(
        {
          $walletInfo: { version: MIN_ONEKEY_VERSION },
          btcwallet: {
            connectWallet: vi.fn(async () => {}),
            getChain: vi.fn(async () => MAINNET_CHAIN),
            switchChain: vi.fn(() => new Promise(() => {})),
            getAddress: vi.fn(async () => "bc1pmainnet"),
            getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
          },
        },
        signetConfig,
      );

      const rejection = expect(provider.connectWallet()).rejects.toMatchObject({
        code: ERROR_CODES.CONNECTION_FAILED,
        wallet: "OneKey",
      });
      await vi.advanceTimersByTimeAsync(60_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects with CONNECTION_FAILED when reading the chain fails", async () => {
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => {
            throw new Error("Internal error");
          }),
          switchChain: vi.fn(),
          getAddress: vi.fn(async () => "tb1psignet"),
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await expect(provider.connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.CONNECTION_FAILED,
      message: "Internal error",
      wallet: "OneKey",
    });
  });

  it("rejects with CONNECTION_FAILED when reading the chain times out", async () => {
    vi.useFakeTimers();
    try {
      const provider = new OneKeyProvider(
        {
          $walletInfo: { version: MIN_ONEKEY_VERSION },
          btcwallet: {
            connectWallet: vi.fn(async () => {}),
            getChain: vi.fn(() => new Promise(() => {})),
            switchChain: vi.fn(),
            getAddress: vi.fn(async () => "tb1psignet"),
            getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
          },
        },
        signetConfig,
      );

      const rejection = expect(provider.connectWallet()).rejects.toMatchObject({
        code: ERROR_CODES.CONNECTION_FAILED,
        wallet: "OneKey",
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for an update when OneKey has no getChain", async () => {
    const getAddress = vi.fn(async () => "bc1pmainnet");
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          switchChain: vi.fn(),
          getAddress,
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await expect(provider.connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
      wallet: "OneKey",
    });
    expect(getAddress).not.toHaveBeenCalled();
  });

  it("rejects with UNSUPPORTED_NETWORK when getChain reports no Bitcoin chain", async () => {
    const switchChain = vi.fn();
    const provider = new OneKeyProvider(
      {
        $walletInfo: { version: MIN_ONEKEY_VERSION },
        btcwallet: {
          connectWallet: vi.fn(async () => {}),
          getChain: vi.fn(async () => undefined),
          switchChain,
          getAddress: vi.fn(async () => "bc1pmainnet"),
          getPublicKeyHex: vi.fn(async () => PUBLIC_KEY),
        },
      },
      signetConfig,
    );

    await expect(provider.connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      wallet: "OneKey",
    });
    expect(switchChain).not.toHaveBeenCalled();
  });
});
