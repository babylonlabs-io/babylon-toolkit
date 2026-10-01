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
