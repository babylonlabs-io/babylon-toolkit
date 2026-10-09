import { describe, expect, it, vi } from "vitest";

import { type BTCConfig, Network } from "@/core/types";
import { OneKeyProvider } from "@/core/wallets/btc/onekey/provider";
import { MIN_ONEKEY_VERSION } from "@/core/wallets/btc/onekey/version";
import { ERROR_CODES } from "@/error";

const config: BTCConfig = {
  coinName: "Signet BTC",
  coinSymbol: "sBTC",
  networkName: "BTC signet",
  mempoolApiUrl: "https://mempool.example",
  network: Network.SIGNET,
};

const CONTEXT_HASH = "ab".repeat(32);
const CONNECTED_KEY = "02" + "aa".repeat(32);
const OTHER_KEY = "03" + "bb".repeat(32);

async function connectedProvider(btcwallet: Record<string, unknown>): Promise<OneKeyProvider> {
  const provider = new OneKeyProvider(
    { $walletInfo: { version: MIN_ONEKEY_VERSION }, btcwallet: { connectWallet: vi.fn(async () => {}), ...btcwallet } },
    config,
  );
  await provider.connectWallet();
  return provider;
}

describe("OneKeyProvider.deriveContextHash account check", () => {
  it("returns the context hash when the connected account is still selected", async () => {
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => "tb1pexample"),
      getPublicKeyHex: vi.fn(async () => CONNECTED_KEY),
      deriveContextHash: vi.fn(async () => CONTEXT_HASH),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).resolves.toBe(CONTEXT_HASH);
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when another account is selected once the derive resolves", async () => {
    let selectedKey = CONNECTED_KEY;
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => "tb1pexample"),
      getPublicKeyHex: vi.fn(async () => selectedKey),
      deriveContextHash: vi.fn(async () => {
        selectedKey = OTHER_KEY;
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
      wallet: "OneKey",
    });
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when an account event fires during the derive, even if the account is selected again", async () => {
    const handlers = new Map<string, () => void>();
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => "tb1pexample"),
      getPublicKeyHex: vi.fn(async () => CONNECTED_KEY),
      on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
      deriveContextHash: vi.fn(async () => {
        handlers.get("accountsChanged")?.();
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    });
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when no account is selected once the derive resolves", async () => {
    let address = "tb1pexample";
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => address),
      getPublicKeyHex: vi.fn(async () => CONNECTED_KEY),
      deriveContextHash: vi.fn(async () => {
        address = "";
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    });
  });
});
