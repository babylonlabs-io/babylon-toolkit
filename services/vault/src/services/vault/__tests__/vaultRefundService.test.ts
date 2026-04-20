// Mock the SDK orchestrator — vault-side tests only verify the adapter wiring
// (how it composes readVault / readPrePeginContext / fee / sign / broadcast
// callbacks). The SDK's buildAndBroadcastRefund has its own dedicated tests.
const mockBuildAndBroadcastRefund = vi.fn();

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/services", () => ({
  buildAndBroadcastRefund: (...args: unknown[]) =>
    mockBuildAndBroadcastRefund(...args),
  BIP68NotMatureError: class BIP68NotMatureError extends Error {},
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  getNetworkFees: vi.fn().mockResolvedValue({ halfHourFee: 10 }),
  pushTx: vi.fn().mockResolvedValue("broadcast_txid"),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn().mockReturnValue("https://mempool.space/api"),
}));

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("signet"),
}));

const mockGetOffchainParamsByVersion = vi.fn();
const mockGetVaultKeepersByVersion = vi.fn();
const mockGetUniversalChallengersByVersion = vi.fn();
vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn().mockResolvedValue({
    getOffchainParamsByVersion: (...args: unknown[]) =>
      mockGetOffchainParamsByVersion(...args),
  }),
  getVaultKeeperReader: vi.fn().mockResolvedValue({
    getVaultKeepersByVersion: (...args: unknown[]) =>
      mockGetVaultKeepersByVersion(...args),
  }),
  getUniversalChallengerReader: vi.fn().mockResolvedValue({
    getUniversalChallengersByVersion: (...args: unknown[]) =>
      mockGetUniversalChallengersByVersion(...args),
  }),
}));

vi.mock("../fetchVaultProviders", () => ({
  fetchVaultProviderById: vi.fn(),
}));

vi.mock("../fetchVaults", () => ({
  fetchVaultRefundData: vi.fn(),
}));

import { getNetworkFees, pushTx } from "@babylonlabs-io/ts-sdk/tbv/core";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { getVaultFromChain } from "../../../clients/eth-contract/btc-vault-registry/query";
import { fetchVaultProviderById } from "../fetchVaultProviders";
import { fetchVaultRefundData } from "../fetchVaults";
import { buildAndBroadcastRefundTransaction } from "../vaultRefundService";

const VAULT_ID = "0xvaultid" as `0x${string}`;
const DEPOSITOR_PUBKEY = "aabbccdd";

const ON_CHAIN_VAULT = {
  offchainParamsVersion: 1,
  vaultProvider: "0xprovider",
  applicationEntryPoint: "0xapp",
  appVaultKeepersVersion: 1,
  universalChallengersVersion: 1,
  hashlock: "0xhashlock",
  htlcVout: 1,
};
const OFFCHAIN_PARAMS = {
  tRefund: 144,
  feeRate: 10n,
  councilQuorum: 3,
  securityCouncilKeys: ["k1", "k2", "k3"],
};
const VAULT_PROVIDER = { btcPubKey: "vp_pubkey" };
const VAULT_KEEPERS = [{ btcPubKey: "vk1" }, { btcPubKey: "vk2" }];
const UNIVERSAL_CHALLENGERS = [{ btcPubKey: "uc1" }];
const INDEXER_VAULT = {
  unsignedPrePeginTx: "0xrawtx",
  amount: 100_000n,
  depositorBtcPubkey: "indexer_depositor_pubkey",
};
const BTC_WALLET_PROVIDER = {
  signPsbt: vi.fn().mockResolvedValue("signed_psbt_hex"),
};

describe("vaultRefundService - adapter wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultRefundData as Mock).mockResolvedValue(INDEXER_VAULT);
    mockGetOffchainParamsByVersion.mockResolvedValue(OFFCHAIN_PARAMS);
    (fetchVaultProviderById as Mock).mockResolvedValue(VAULT_PROVIDER);
    mockGetVaultKeepersByVersion.mockResolvedValue(VAULT_KEEPERS);
    mockGetUniversalChallengersByVersion.mockResolvedValue(
      UNIVERSAL_CHALLENGERS,
    );
    (getNetworkFees as Mock).mockResolvedValue({ halfHourFee: 10 });
    (pushTx as Mock).mockResolvedValue("broadcast_txid");

    // Default: exercise every callback and return a plausible result.
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        vaultId: `0x${string}`;
        readVault: () => Promise<unknown>;
        readPrePeginContext: (v: unknown) => Promise<unknown>;
        signPsbt: (hex: string, opts: unknown) => Promise<string>;
        broadcastTx: (hex: string) => Promise<{ txId: string }>;
      }) => {
        const vault = await input.readVault();
        await input.readPrePeginContext(vault);
        await input.signPsbt("psbt_hex", {});
        return input.broadcastTx("signed_tx");
      },
    );
  });

  it("calls the SDK with vaultId and returns the broadcast txId", async () => {
    const txId = await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(mockBuildAndBroadcastRefund).toHaveBeenCalledOnce();
    const input = mockBuildAndBroadcastRefund.mock.calls[0][0];
    expect(input.vaultId).toBe(VAULT_ID);
    expect(txId).toBe("broadcast_txid");
  });

  it("readVault merges on-chain + indexer fields and overrides depositor pubkey with caller's", async () => {
    let observed: {
      hashlock: string;
      htlcVout: number;
      amount: bigint;
      depositorBtcPubkey: string;
    } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        vaultId: `0x${string}`;
        readVault: () => Promise<{
          hashlock: string;
          htlcVout: number;
          amount: bigint;
          depositorBtcPubkey: string;
        }>;
      }) => {
        observed = await input.readVault();
        return { txId: "ok" };
      },
    );

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(observed).not.toBeNull();
    expect(observed!.hashlock).toBe(ON_CHAIN_VAULT.hashlock);
    expect(observed!.htlcVout).toBe(ON_CHAIN_VAULT.htlcVout);
    expect(observed!.amount).toBe(INDEXER_VAULT.amount);
    // Must be the caller-provided wallet pubkey, NOT the indexer value.
    expect(observed!.depositorBtcPubkey).toBe(DEPOSITOR_PUBKEY);
  });

  it("throws when vault is not found in indexer", async () => {
    (fetchVaultRefundData as Mock).mockResolvedValue(null);

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(`Vault ${VAULT_ID} not found`);
  });

  it("throws when vault provider is not found", async () => {
    (fetchVaultProviderById as Mock).mockResolvedValue(null);

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(
      `Vault provider ${ON_CHAIN_VAULT.vaultProvider} not found`,
    );
  });

  it("throws when no vault keepers are found", async () => {
    mockGetVaultKeepersByVersion.mockResolvedValue([]);

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(
      `No vault keepers found for version ${ON_CHAIN_VAULT.appVaultKeepersVersion}`,
    );
  });

  it("throws when no universal challengers are found for the version", async () => {
    mockGetUniversalChallengersByVersion.mockResolvedValue([]);

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(
      `Universal challengers not found for version ${ON_CHAIN_VAULT.universalChallengersVersion}`,
    );
  });

  it("passes the mempool halfHourFee to the SDK as feeRate", async () => {
    let observedFeeRate = 0;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: { feeRate: number }) => {
        observedFeeRate = input.feeRate;
        return { txId: "ok" };
      },
    );

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(observedFeeRate).toBe(10);
  });

  it("broadcastTx returns { txId } from mempool pushTx", async () => {
    let observed: { txId: string } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        broadcastTx: (hex: string) => Promise<{ txId: string }>;
      }) => {
        observed = await input.broadcastTx("signed_tx");
        return observed;
      },
    );

    const txId = await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(observed).toEqual({ txId: "broadcast_txid" });
    expect(txId).toBe("broadcast_txid");
  });
});
