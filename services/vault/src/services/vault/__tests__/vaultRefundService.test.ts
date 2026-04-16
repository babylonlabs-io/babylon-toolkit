vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  buildRefundPsbt: vi.fn(),
  createTaprootScriptPathSignOptions: vi.fn().mockReturnValue({}),
  getNetworkFees: vi.fn(),
  pushTx: vi.fn(),
  stripHexPrefix: vi.fn((hex: string) => hex.replace(/^0x/, "")),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn().mockReturnValue("https://mempool.space/api"),
}));

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("testnet"),
}));

// Mock SDK readers (used by buildAndBroadcastRefundTransaction for contract-based reads)
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
  fetchVaultById: vi.fn(),
}));

vi.mock("bitcoinjs-lib", () => {
  const mockPsbt = {
    finalizeAllInputs: vi.fn(),
    extractTransaction: vi
      .fn()
      .mockReturnValue({ toHex: () => "signed_tx_hex" }),
  };
  return {
    Psbt: {
      fromHex: vi.fn().mockReturnValue(mockPsbt),
    },
  };
});

import {
  buildRefundPsbt,
  getNetworkFees,
  pushTx,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { getVaultFromChain } from "../../../clients/eth-contract/btc-vault-registry/query";
import { fetchVaultProviderById } from "../fetchVaultProviders";
import { fetchVaultById } from "../fetchVaults";
import { buildAndBroadcastRefundTransaction } from "../vaultRefundService";

const VAULT_ID = "0xdeadbeef" as `0x${string}`;
const DEPOSITOR_PUBKEY = "aabbccdd";

const ON_CHAIN_VAULT = {
  offchainParamsVersion: 1,
  vaultProvider: "0xprovider",
  applicationEntryPoint: "0xapp",
  appVaultKeepersVersion: 1,
  universalChallengersVersion: 1,
  hashlock: "0xhashlock",
  htlcVout: 0,
};

const OFFCHAIN_PARAMS = {
  tRefund: 144,
  feeRate: 10n,
  councilQuorum: 3,
  securityCouncilKeys: ["key1", "key2", "key3"],
};

const VAULT_PROVIDER = { btcPubKey: "0xproviderbtcpubkey" };
const VAULT_KEEPERS = [{ btcPubKey: "0xkeeper1" }, { btcPubKey: "0xkeeper2" }];
const UNIVERSAL_CHALLENGERS = [{ btcPubKey: "0xchallenger1" }];

const INDEXER_VAULT = {
  unsignedPrePeginTx: "0xrawtx",
  amount: 100000n,
};

const BTC_WALLET_PROVIDER = {
  signPsbt: vi.fn().mockResolvedValue("signed_psbt_hex"),
};

describe("vaultRefundService - buildAndBroadcastRefundTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultById as Mock).mockResolvedValue(INDEXER_VAULT);
    mockGetOffchainParamsByVersion.mockResolvedValue(OFFCHAIN_PARAMS);
    (fetchVaultProviderById as Mock).mockResolvedValue(VAULT_PROVIDER);
    mockGetVaultKeepersByVersion.mockResolvedValue(VAULT_KEEPERS);
    mockGetUniversalChallengersByVersion.mockResolvedValue(
      UNIVERSAL_CHALLENGERS,
    );
    (getNetworkFees as Mock).mockResolvedValue({ halfHourFee: 10 });
    (buildRefundPsbt as Mock).mockResolvedValue({ psbtHex: "psbt_hex" });
    (pushTx as Mock).mockResolvedValue("tx_id_abc123");
    BTC_WALLET_PROVIDER.signPsbt.mockResolvedValue("signed_psbt_hex");
  });

  it("throws when vault is not found in indexer", async () => {
    (fetchVaultById as Mock).mockResolvedValue(null);

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

  it("uses on-chain hashlock and htlcVout, not indexer values", async () => {
    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    const [buildRefundCall] = (buildRefundPsbt as Mock).mock.calls;
    const buildRefundArgs = buildRefundCall[0] as {
      htlcVout: number;
      hashlock: string;
      prePeginParams: { hashlocks: string[] };
    };

    expect(buildRefundArgs.htlcVout).toBe(ON_CHAIN_VAULT.htlcVout);
    expect(buildRefundArgs.hashlock).toBe(
      ON_CHAIN_VAULT.hashlock.replace(/^0x/, ""),
    );
    expect(buildRefundArgs.prePeginParams.hashlocks).toEqual([
      ON_CHAIN_VAULT.hashlock.replace(/^0x/, ""),
    ]);
  });

  it("returns the broadcasted transaction id on success", async () => {
    const txId = await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(txId).toBe("tx_id_abc123");
  });
});
