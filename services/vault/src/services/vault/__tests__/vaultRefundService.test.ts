// Mock the SDK orchestrator — vault-side tests only verify the adapter wiring
// (how it composes readVault / readPrePeginContext / fee / sign / broadcast
// callbacks). The SDK's buildAndBroadcastRefund has its own dedicated tests.
const mockBuildAndBroadcastRefund = vi.fn();

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/services", () => ({
  buildAndBroadcastRefund: (...args: unknown[]) =>
    mockBuildAndBroadcastRefund(...args),
  BIP68NotMatureError: class BIP68NotMatureError extends Error {},
  REFUND_VSIZE: 160,
  estimateRefundFeeSats: (rate: number) => {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(
        `feeRateSatsVb must be a positive finite number, got ${rate}`,
      );
    }
    return BigInt(Math.ceil(rate * 160));
  },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/ts-sdk/tbv/core")>()),
  getNetworkFees: vi.fn().mockResolvedValue({ halfHourFee: 10 }),
  pushTx: vi.fn().mockResolvedValue("broadcast_txid"),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn().mockReturnValue("https://mempool.space/api"),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: vi.fn(() => "0xmatching_pre_pegin_hash"),
}));

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("testnet"),
}));

const mockGetOffchainParamsByVersion = vi.fn();
const mockGetVaultKeepersByVersion = vi.fn();
const mockGetUniversalChallengersByVersion = vi.fn();
const mockGetVaultProviderBtcPubKey = vi.fn();
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
  getVaultRegistryReader: vi.fn().mockReturnValue({
    getVaultProviderBtcPubKey: (...args: unknown[]) =>
      mockGetVaultProviderBtcPubKey(...args),
  }),
}));

vi.mock("../fetchVaultProviders", () => ({
  fetchVaultProviderById: vi.fn(),
}));

vi.mock("../fetchVaults", () => ({
  fetchVaultRefundData: vi.fn(),
}));

import { getNetworkFees, pushTx } from "@babylonlabs-io/ts-sdk/tbv/core";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { getVaultFromChain } from "../../../clients/eth-contract/btc-vault-registry/query";
import { fetchVaultProviderById } from "../fetchVaultProviders";
import { fetchVaultRefundData } from "../fetchVaults";
import {
  buildAndBroadcastRefundTransaction,
  getRefundNetworkFeeSats,
  getRefundPreview,
} from "../vaultRefundService";

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
  amount: 100_000n,
  prePeginTxHash: "0xmatching_pre_pegin_hash",
};
const OFFCHAIN_PARAMS = {
  tRefund: 144,
  feeRate: 10n,
  councilQuorum: 3,
  securityCouncilKeys: ["k1", "k2", "k3"],
};
// Indexer GraphQL field is 0x-prefixed; on-chain reader returns the same
// 32 bytes as bare lowercase x-only hex. Both must agree for the cross-check.
const VP_BTC_PUBKEY_X_ONLY = "f".repeat(64);
const VAULT_PROVIDER = { btcPubKey: `0x${VP_BTC_PUBKEY_X_ONLY}` };
const VAULT_KEEPERS = [{ btcPubKey: "vk1" }, { btcPubKey: "vk2" }];
const UNIVERSAL_CHALLENGERS = [{ btcPubKey: "uc1" }];
const INDEXER_VAULT = {
  unsignedPrePeginTx: "0xrawtx",
  depositorBtcPubkey: "indexer_depositor_pubkey",
};
const BTC_WALLET_PROVIDER = {
  signPsbt: vi.fn().mockResolvedValue("signed_psbt_hex"),
};

describe("vaultRefundService - adapter wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (calculateBtcTxHash as Mock).mockReturnValue(ON_CHAIN_VAULT.prePeginTxHash);
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultRefundData as Mock).mockResolvedValue(INDEXER_VAULT);
    mockGetOffchainParamsByVersion.mockResolvedValue(OFFCHAIN_PARAMS);
    (fetchVaultProviderById as Mock).mockResolvedValue(VAULT_PROVIDER);
    mockGetVaultProviderBtcPubKey.mockResolvedValue(VP_BTC_PUBKEY_X_ONLY);
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
      feeRate: 10,
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
      feeRate: 10,
    });

    expect(observed).not.toBeNull();
    expect(observed!.hashlock).toBe(ON_CHAIN_VAULT.hashlock);
    expect(observed!.htlcVout).toBe(ON_CHAIN_VAULT.htlcVout);
    // Amount must come from on-chain contract, NOT the indexer.
    expect(observed!.amount).toBe(ON_CHAIN_VAULT.amount);
    // Must be the caller-provided wallet pubkey, NOT the indexer value.
    expect(observed!.depositorBtcPubkey).toBe(DEPOSITOR_PUBKEY);
  });

  it("throws when indexer Pre-PegIn tx hash does not match on-chain", async () => {
    (calculateBtcTxHash as Mock).mockReturnValue("0xdifferent_hash");

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        feeRate: 10,
      }),
    ).rejects.toThrow("Pre-PegIn transaction hash mismatch");
  });

  it("throws when vault is not found in indexer", async () => {
    (fetchVaultRefundData as Mock).mockResolvedValue(null);

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        feeRate: 10,
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
        feeRate: 10,
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
        feeRate: 10,
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
        feeRate: 10,
      }),
    ).rejects.toThrow(
      `Universal challengers not found for version ${ON_CHAIN_VAULT.universalChallengersVersion}`,
    );
  });

  // Audit #216: indexer-provided VP key is cross-checked against the
  // on-chain registry. A stale or compromised indexer that substitutes a
  // different key must not produce a refund signed against a wrong Taproot
  // script tree.
  it("throws when indexer VP pubkey does not match the on-chain registry", async () => {
    mockGetVaultProviderBtcPubKey.mockResolvedValue("a".repeat(64));

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        feeRate: 10,
      }),
    ).rejects.toThrow(/does not match on-chain registry/);
  });

  it("uses the on-chain VP pubkey in the returned refund context", async () => {
    let observed: { vaultProviderPubkey: string } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        readVault: () => Promise<unknown>;
        readPrePeginContext: (
          v: unknown,
        ) => Promise<{ vaultProviderPubkey: string }>;
      }) => {
        const vault = await input.readVault();
        observed = await input.readPrePeginContext(vault);
        return { txId: "ok" };
      },
    );

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(observed).not.toBeNull();
    expect(observed!.vaultProviderPubkey).toBe(VP_BTC_PUBKEY_X_ONLY);
  });

  it("forwards the caller-provided feeRate to the SDK (no silent halfHourFee fallback)", async () => {
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
      feeRate: 42,
    });

    expect(observedFeeRate).toBe(42);
    // Broadcast path must NOT ping mempool for the fee — it uses the caller's.
    expect(getNetworkFees).not.toHaveBeenCalled();
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
      feeRate: 10,
    });

    expect(observed).toEqual({ txId: "broadcast_txid" });
    expect(txId).toBe("broadcast_txid");
  });
});

describe("getRefundNetworkFeeSats", () => {
  it("returns ceil(rate * 160) in sats", () => {
    expect(getRefundNetworkFeeSats(1)).toBe(160n);
    expect(getRefundNetworkFeeSats(3)).toBe(480n);
    expect(getRefundNetworkFeeSats(10)).toBe(1600n);
  });

  it("rounds up non-integer rates", () => {
    // 1.5 × 160 = 240.0 (exact); pick a non-integer product instead
    expect(getRefundNetworkFeeSats(1.0001)).toBe(161n);
  });

  it("rejects non-positive or non-finite rates", () => {
    expect(() => getRefundNetworkFeeSats(0)).toThrow();
    expect(() => getRefundNetworkFeeSats(-1)).toThrow();
    expect(() => getRefundNetworkFeeSats(Number.NaN)).toThrow();
    expect(() => getRefundNetworkFeeSats(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("getRefundPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultRefundData as Mock).mockResolvedValue(INDEXER_VAULT);
    (getNetworkFees as Mock).mockResolvedValue({ halfHourFee: 7 });
  });

  it("returns the on-chain HTLC amount and mempool halfHourFee", async () => {
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview.amountSats).toBe(ON_CHAIN_VAULT.amount);
    expect(preview.halfHourFeeSatsVb).toBe(7);
  });

  it("throws when the vault is not found in the indexer", async () => {
    (fetchVaultRefundData as Mock).mockResolvedValue(null);
    await expect(getRefundPreview(VAULT_ID)).rejects.toThrow(
      `Vault ${VAULT_ID} not found`,
    );
  });

  it("returns null halfHourFeeSatsVb when the fee endpoint fails (vault data still loads)", async () => {
    (getNetworkFees as Mock).mockRejectedValue(
      new Error("mempool unreachable"),
    );
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview.amountSats).toBe(ON_CHAIN_VAULT.amount);
    expect(preview.halfHourFeeSatsVb).toBeNull();
  });

  it("returns null halfHourFeeSatsVb when the fee endpoint reports zero", async () => {
    (getNetworkFees as Mock).mockResolvedValue({ halfHourFee: 0 });
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview.halfHourFeeSatsVb).toBeNull();
  });
});
