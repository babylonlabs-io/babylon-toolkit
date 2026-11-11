import { describe, expect, it, vi } from "vitest";

import { type BTCConfig, Network } from "@/core/types";
import { ERROR_CODES } from "@/error";

import { UnisatProvider } from "../provider";
import { MIN_UNISAT_VERSION } from "../version";

const signetConfig: BTCConfig = {
  coinName: "Signet BTC",
  coinSymbol: "sBTC",
  networkName: "BTC signet",
  mempoolApiUrl: "https://mempool.example",
  network: Network.SIGNET,
};

const MAINNET_CHAIN = { enum: "BITCOIN_MAINNET", name: "Bitcoin Mainnet", network: "livenet" };

describe("UnisatProvider.connectWallet network alignment", () => {
  it("keeps a timed-out network switch as a retryable CONNECTION_FAILED", async () => {
    vi.useFakeTimers();
    try {
      const provider = new UnisatProvider(
        {
          requestAccounts: vi.fn(async () => ["bc1pmainnet"]),
          getVersion: vi.fn(async () => MIN_UNISAT_VERSION),
          getChain: vi.fn(async () => MAINNET_CHAIN),
          switchChain: vi.fn(() => new Promise(() => {})),
        },
        signetConfig,
      );

      const rejection = expect(provider.connectWallet()).rejects.toMatchObject({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: expect.stringContaining("switching to BTC signet"),
        wallet: "Unisat",
      });
      await vi.advanceTimersByTimeAsync(60_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
