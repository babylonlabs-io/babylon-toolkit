import { describe, expect, it, vi } from "vitest";

import { type BTCConfig, Network } from "@/core/types";
import { OKXProvider } from "@/core/wallets/btc/okx/provider";
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

async function connectedProvider(bitcoinSignet: Record<string, unknown>): Promise<OKXProvider> {
  const provider = new OKXProvider({ getVersion: vi.fn(async () => "4.17.11"), bitcoinSignet }, config);
  await provider.connectWallet();
  return provider;
}

describe("OKXProvider.deriveContextHash account check", () => {
  it("returns the context hash when the connected account is still selected", async () => {
    const provider = await connectedProvider({
      connect: vi.fn(async () => ({ address: "tb1pexample", compressedPublicKey: CONNECTED_KEY })),
      deriveContextHash: vi.fn(async () => CONTEXT_HASH),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).resolves.toBe(CONTEXT_HASH);
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when another account is selected once the derive resolves", async () => {
    let selectedKey = CONNECTED_KEY;
    const provider = await connectedProvider({
      connect: vi.fn(async () => ({ address: "tb1pexample", compressedPublicKey: selectedKey })),
      deriveContextHash: vi.fn(async () => {
        selectedKey = OTHER_KEY;
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
      wallet: "OKX",
    });
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when OKX's accountChanged event fires during the derive, even if the account is selected again", async () => {
    const handlers = new Map<string, () => void>();
    const provider = await connectedProvider({
      connect: vi.fn(async () => ({ address: "tb1pexample", compressedPublicKey: CONNECTED_KEY })),
      on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
      deriveContextHash: vi.fn(async () => {
        // OKX's Bitcoin provider emits the singular event name.
        handlers.get("accountChanged")?.();
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    });
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when no account is selected once the derive resolves", async () => {
    let selectedAccount: { address: string; compressedPublicKey: string } | null = {
      address: "tb1pexample",
      compressedPublicKey: CONNECTED_KEY,
    };
    const provider = await connectedProvider({
      connect: vi.fn(async () => selectedAccount),
      deriveContextHash: vi.fn(async () => {
        selectedAccount = null;
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    });
  });

  it("rejects when the selected account cannot be read once the derive resolves", async () => {
    let connected = true;
    const provider = await connectedProvider({
      connect: vi.fn(async () => {
        if (!connected) throw new Error("Wallet is locked");
        return { address: "tb1pexample", compressedPublicKey: CONNECTED_KEY };
      }),
      deriveContextHash: vi.fn(async () => {
        connected = false;
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toThrow("Wallet is locked");
  });
});
