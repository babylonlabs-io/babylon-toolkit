import { expect, test, vi } from "vitest";

import { Network } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

import { UnisatProvider } from "../provider";
import { MIN_UNISAT_VERSION } from "../version";

const config = {
  coinName: "Signet BTC",
  coinSymbol: "sBTC",
  networkName: "BTC signet",
  mempoolApiUrl: "https://mempool.space/signet",
  network: Network.SIGNET,
};

async function providerRejectingWith(rejection: unknown): Promise<UnisatProvider> {
  const provider = new UnisatProvider(
    {
      requestAccounts: vi.fn().mockResolvedValue(["tb1qaddress"]),
      getVersion: vi.fn().mockResolvedValue(MIN_UNISAT_VERSION),
      getChain: vi.fn().mockResolvedValue({ enum: "BITCOIN_SIGNET", name: "Bitcoin Signet", network: "testnet" }),
      getAccounts: vi.fn().mockResolvedValue(["tb1qaddress"]),
      getPublicKey: vi.fn().mockResolvedValue("02".padEnd(66, "a")),
      deriveContextHash: vi.fn().mockRejectedValue(rejection),
    },
    config,
  );
  await provider.connectWallet();
  return provider;
}

test("maps the UniSat account refusal to WALLET_ACCOUNT_NOT_SUPPORTED", async () => {
  const provider = await providerRejectingWith({
    code: -32603,
    message: "Current keyring does not support deriveContextHash",
  });

  const error = await provider.deriveContextHash("babylon-btc-vault", "00").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(WalletError);
  expect(error).toMatchObject({
    code: ERROR_CODES.WALLET_ACCOUNT_NOT_SUPPORTED,
    wallet: "Unisat",
  });
});

test("rethrows other UniSat errors with the same RPC code unchanged", async () => {
  const rejection = { code: -32603, message: "Invalid context length" };

  const provider = await providerRejectingWith(rejection);

  await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toBe(rejection);
});

test("requires the exact UniSat account refusal message", async () => {
  const rejection = new Error("Current keyring does not support deriveContextHash for this input");

  const provider = await providerRejectingWith(rejection);

  await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toBe(rejection);
});

test("maps a user rejection to CONNECTION_REJECTED before the account check", async () => {
  const provider = await providerRejectingWith(new Error("User rejected the request."));

  await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
    code: ERROR_CODES.CONNECTION_REJECTED,
  });
});

const CONTEXT_HASH = "ab".repeat(32);
const CONNECTED_KEY = "02".padEnd(66, "a");
const OTHER_KEY = "03".padEnd(66, "b");

async function connectedProvider(wallet: Record<string, unknown>): Promise<UnisatProvider> {
  const provider = new UnisatProvider(
    {
      requestAccounts: vi.fn().mockResolvedValue(["tb1qaddress"]),
      getVersion: vi.fn().mockResolvedValue(MIN_UNISAT_VERSION),
      getChain: vi.fn().mockResolvedValue({ enum: "BITCOIN_SIGNET", name: "Bitcoin Signet", network: "testnet" }),
      ...wallet,
    },
    config,
  );
  await provider.connectWallet();
  return provider;
}

test("returns the context hash when the connected account is still selected", async () => {
  const provider = await connectedProvider({
    getAccounts: vi.fn().mockResolvedValue(["tb1qaddress"]),
    getPublicKey: vi.fn().mockResolvedValue(CONNECTED_KEY),
    deriveContextHash: vi.fn().mockResolvedValue(CONTEXT_HASH),
  });

  await expect(provider.deriveContextHash("babylon-btc-vault", "00")).resolves.toBe(CONTEXT_HASH);
});

test("rejects with WALLET_ACCOUNT_CHANGED when another account is selected once the derive resolves", async () => {
  let selectedKey = CONNECTED_KEY;
  const provider = await connectedProvider({
    getAccounts: vi.fn().mockResolvedValue(["tb1qaddress"]),
    getPublicKey: vi.fn(async () => selectedKey),
    deriveContextHash: vi.fn(async () => {
      selectedKey = OTHER_KEY;
      return CONTEXT_HASH;
    }),
  });

  await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
    code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    wallet: "Unisat",
  });
});

test("rejects with WALLET_ACCOUNT_CHANGED when an account event fires during the derive, even if the account is selected again", async () => {
  const handlers = new Map<string, () => void>();
  const provider = await connectedProvider({
    getAccounts: vi.fn().mockResolvedValue(["tb1qaddress"]),
    getPublicKey: vi.fn().mockResolvedValue(CONNECTED_KEY),
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

test("rejects with WALLET_ACCOUNT_CHANGED when UniSat's chainChanged event fires during the derive", async () => {
  const handlers = new Map<string, () => void>();
  const provider = await connectedProvider({
    getAccounts: vi.fn().mockResolvedValue(["tb1qaddress"]),
    getPublicKey: vi.fn().mockResolvedValue(CONNECTED_KEY),
    on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
    deriveContextHash: vi.fn(async () => {
      // A chain switch keeps the same key, so only the event reveals it.
      handlers.get("chainChanged")?.();
      return CONTEXT_HASH;
    }),
  });

  await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
    code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
  });
});

test("rejects with WALLET_ACCOUNT_CHANGED when no account is selected once the derive resolves", async () => {
  let accounts = ["tb1qaddress"];
  const provider = await connectedProvider({
    getAccounts: vi.fn(async () => accounts),
    getPublicKey: vi.fn().mockResolvedValue(CONNECTED_KEY),
    deriveContextHash: vi.fn(async () => {
      accounts = [];
      return CONTEXT_HASH;
    }),
  });

  await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
    code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
  });
});
