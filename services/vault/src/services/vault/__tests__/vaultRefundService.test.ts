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

vi.mock("../../../clients/btc/outspend", () => ({
  fetchHtlcSpend: vi.fn(),
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
  fetchVaultIdsByDepositor: vi.fn(),
}));

import { getNetworkFees, pushTx } from "@babylonlabs-io/ts-sdk/tbv/core";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { fetchHtlcSpend } from "../../../clients/btc/outspend";
import { getVaultFromChain } from "../../../clients/eth-contract/btc-vault-registry/query";
import { fetchVaultProviderById } from "../fetchVaultProviders";
import { fetchVaultIdsByDepositor, fetchVaultRefundData } from "../fetchVaults";
import {
  buildAndBroadcastRefundTransaction,
  getRefundPreview,
  RefundAlreadySettledError,
} from "../vaultRefundService";

const VAULT_ID = "0xvaultid" as `0x${string}`;
const DEPOSITOR_PUBKEY = "aabbccdd";
const DEPOSITOR_ADDRESS = ("0x" + "ab".repeat(20)) as `0x${string}`;

const ON_CHAIN_VAULT = {
  // Authoritative on-chain depositor — matches DEPOSITOR_ADDRESS for the
  // happy-path tests. The wallet-mismatch tests below override it.
  depositor: DEPOSITOR_ADDRESS,
  offchainParamsVersion: 1,
  vaultProvider: "0xprovider",
  applicationEntryPoint: "0xapp",
  appVaultKeepersVersion: 1,
  universalChallengersVersion: 1,
  hashlock: "0xhashlock",
  htlcVout: 0,
  amount: 100_000n,
  prePeginTxHash: "0xmatching_pre_pegin_hash",
};
const OFFCHAIN_PARAMS = {
  tRefund: 144,
  feeRate: 10n,
  minPeginFeeRate: 20n,
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

// `buildAndBroadcastRefundTransaction` and `getRefundPreview` both probe the
// Pre-PegIn via a raw `fetch` to mempool.space. Stub globally so no test in
// this file makes a real network call (which would take ~800ms and flake
// under the default 5s timeout). Individual tests can still override the
// response via `mockFetch.mockResolvedValue(...)` / `mockRejectedValue(...)`.
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue({ status: 200 });
  // Default: HTLC output unspent, so the refund proceeds normally. Individual
  // tests override to exercise the already-settled path. `clearAllMocks` (used
  // per-describe) preserves this implementation.
  (fetchHtlcSpend as Mock).mockResolvedValue({
    spent: false,
    confirmed: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vaultRefundService - adapter wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ status: 200 });

    (calculateBtcTxHash as Mock).mockReturnValue(ON_CHAIN_VAULT.prePeginTxHash);
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultRefundData as Mock).mockResolvedValue(INDEXER_VAULT);
    // Default: depositor has just the target vault. Sibling-discovery
    // tests below override this to exercise the multi-vault branch.
    (fetchVaultIdsByDepositor as Mock).mockResolvedValue([VAULT_ID]);
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
      depositorAddress: DEPOSITOR_ADDRESS,
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
      depositorAddress: DEPOSITOR_ADDRESS,
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
        depositorAddress: DEPOSITOR_ADDRESS,
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
        depositorAddress: DEPOSITOR_ADDRESS,
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
        depositorAddress: DEPOSITOR_ADDRESS,
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
        depositorAddress: DEPOSITOR_ADDRESS,
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
        depositorAddress: DEPOSITOR_ADDRESS,
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
        depositorAddress: DEPOSITOR_ADDRESS,
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
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(observed).not.toBeNull();
    expect(observed!.vaultProviderPubkey).toBe(VP_BTC_PUBKEY_X_ONLY);
  });

  it("forwards both fee rates into the refund context without conflating them", async () => {
    let observed: { feeRate: bigint; minPeginFeeRate: bigint } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        readVault: () => Promise<unknown>;
        readPrePeginContext: (
          v: unknown,
        ) => Promise<{ feeRate: bigint; minPeginFeeRate: bigint }>;
      }) => {
        const vault = await input.readVault();
        observed = await input.readPrePeginContext(vault);
        return { txId: "ok" };
      },
    );

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(observed).not.toBeNull();
    // feeRate (10n) sizes the claim value; minPeginFeeRate (20n) sizes the
    // PegIn tx fee — distinct contract params, must not be swapped.
    expect(observed!.feeRate).toBe(OFFCHAIN_PARAMS.feeRate);
    expect(observed!.minPeginFeeRate).toBe(OFFCHAIN_PARAMS.minPeginFeeRate);
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
      depositorAddress: DEPOSITOR_ADDRESS,
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
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(observed).toEqual({ txId: "broadcast_txid" });
    expect(txId).toBe("broadcast_txid");
  });

  it("throws RefundAlreadySettledError (before signing) when the HTLC is already spent", async () => {
    (fetchHtlcSpend as Mock).mockResolvedValue({
      spent: true,
      confirmed: true,
      spendingTxid: "existing_refund_txid",
    });

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toBeInstanceOf(RefundAlreadySettledError);
    await expect(promise).rejects.toMatchObject({
      spendingTxid: "existing_refund_txid",
      confirmed: true,
    });
    // Guard fires before the wallet popup — never builds/signs/broadcasts.
    expect(mockBuildAndBroadcastRefund).not.toHaveBeenCalled();
  });

  it("classifies a -27 broadcast rejection as already-settled when the re-probe finds the HTLC spent", async () => {
    // Guard passes (unspent), then the broadcast races a confirmed refund:
    // bitcoind returns -27, the re-probe finds the HTLC spent → success.
    (fetchHtlcSpend as Mock)
      .mockResolvedValueOnce({ spent: false, confirmed: false })
      .mockResolvedValueOnce({
        spent: true,
        confirmed: true,
        spendingTxid: "raced_refund_txid",
      });
    (pushTx as Mock).mockRejectedValue(
      new Error(
        'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
      ),
    );

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        depositorAddress: DEPOSITOR_ADDRESS,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        feeRate: 10,
      }),
    ).rejects.toBeInstanceOf(RefundAlreadySettledError);
  });

  it("propagates the original error when a -27 rejection's re-probe finds the HTLC still unspent", async () => {
    // Guard passes (unspent); broadcast hits -27, but the re-probe ALSO finds
    // the HTLC unspent (a genuine unrelated -27, or probe lag). Fail open: the
    // original error must propagate, never be misread as already-settled.
    (fetchHtlcSpend as Mock)
      .mockResolvedValueOnce({ spent: false, confirmed: false })
      .mockResolvedValueOnce({ spent: false, confirmed: false });
    (pushTx as Mock).mockRejectedValue(
      new Error(
        'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
      ),
    );

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toThrow(/-27|already in block chain/);
    await expect(promise).rejects.not.toBeInstanceOf(RefundAlreadySettledError);
  });

  it("does not classify a -26 broadcast rejection as already-settled (re-throws)", async () => {
    (pushTx as Mock).mockRejectedValue(
      new Error(
        'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met"}',
      ),
    );

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toThrow(/-26|min relay fee/);
    await expect(promise).rejects.not.toBeInstanceOf(RefundAlreadySettledError);
  });
});

describe("getRefundPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultRefundData as Mock).mockResolvedValue(INDEXER_VAULT);
    (getNetworkFees as Mock).mockResolvedValue({ halfHourFee: 7 });
    mockFetch.mockResolvedValue({ status: 200 });
  });

  it("returns the on-chain HTLC amount and mempool halfHourFee", async () => {
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview.amountSats).toBe(ON_CHAIN_VAULT.amount);
    expect(preview.halfHourFeeSatsVb).toBe(7);
    expect(preview.prePeginOnChain).toBe(true);
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

  it("reports prePeginOnChain=false when the Pre-PegIn tx is not on Bitcoin (HTTP 404)", async () => {
    mockFetch.mockResolvedValue({ status: 404 });
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview.prePeginOnChain).toBe(false);
  });

  it("reports prePeginOnChain=true (fail-open) when the mempool probe errors", async () => {
    // A flaky or geo-fenced mempool must never block a legitimate refund.
    mockFetch.mockRejectedValue(new Error("network down"));
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview.prePeginOnChain).toBe(true);
  });

  it("reports prePeginOnChain=true (fail-open) on a non-404 status (e.g. geo-fenced 403)", async () => {
    mockFetch.mockResolvedValue({ status: 403 });
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview.prePeginOnChain).toBe(true);
  });
});

describe("vaultRefundService - sibling batch discovery", () => {
  const SIBLING_VAULT_ID = "0xsiblingid" as `0x${string}`;
  const OTHER_VAULT_ID = "0xunrelated" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ status: 200 });
    (calculateBtcTxHash as Mock).mockReturnValue(ON_CHAIN_VAULT.prePeginTxHash);
    (fetchVaultRefundData as Mock).mockResolvedValue(INDEXER_VAULT);
    mockGetOffchainParamsByVersion.mockResolvedValue(OFFCHAIN_PARAMS);
    (fetchVaultProviderById as Mock).mockResolvedValue(VAULT_PROVIDER);
    mockGetVaultProviderBtcPubKey.mockResolvedValue(VP_BTC_PUBKEY_X_ONLY);
    mockGetVaultKeepersByVersion.mockResolvedValue(VAULT_KEEPERS);
    mockGetUniversalChallengersByVersion.mockResolvedValue(
      UNIVERSAL_CHALLENGERS,
    );
    (pushTx as Mock).mockResolvedValue("broadcast_txid");

    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: { readVault: () => Promise<unknown> }) => {
        await input.readVault();
        return { txId: "broadcast_txid" };
      },
    );
  });

  it("builds a length-1 batch for a single-vault deposit", async () => {
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultIdsByDepositor as Mock).mockResolvedValue([VAULT_ID]);

    let observed: { batch: ReadonlyArray<unknown> } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        readVault: () => Promise<{ batch: ReadonlyArray<unknown> }>;
      }) => {
        observed = await input.readVault();
        return { txId: "ok" };
      },
    );

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(observed).not.toBeNull();
    expect(observed!.batch).toHaveLength(1);
    expect(observed!.batch[0]).toEqual({
      hashlock: ON_CHAIN_VAULT.hashlock,
      amount: ON_CHAIN_VAULT.amount,
      htlcVout: 0,
    });
  });

  it("assembles a vout-ordered length-2 batch for a sibling pair", async () => {
    // Target vault is at vout 0; sibling is at vout 1 of the same Pre-PegIn.
    const TARGET = { ...ON_CHAIN_VAULT, htlcVout: 0, hashlock: "0xtarget" };
    const SIBLING = {
      ...ON_CHAIN_VAULT,
      htlcVout: 1,
      hashlock: "0xsibling",
      amount: 200_000n,
    };
    (getVaultFromChain as Mock).mockImplementation((id: string) => {
      if (id === VAULT_ID) return Promise.resolve(TARGET);
      if (id === SIBLING_VAULT_ID) return Promise.resolve(SIBLING);
      throw new Error(`Unexpected vaultId ${id}`);
    });
    (fetchVaultIdsByDepositor as Mock).mockResolvedValue([
      VAULT_ID,
      SIBLING_VAULT_ID,
    ]);

    let observed: {
      batch: ReadonlyArray<{
        hashlock: string;
        amount: bigint;
        htlcVout: number;
      }>;
    } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: { readVault: () => Promise<typeof observed> }) => {
        observed = (await input.readVault()) as typeof observed;
        return { txId: "ok" };
      },
    );

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(observed).not.toBeNull();
    expect(observed!.batch.map((b) => b.htlcVout)).toEqual([0, 1]);
    expect(observed!.batch[0].hashlock).toBe("0xtarget");
    expect(observed!.batch[1].hashlock).toBe("0xsibling");
    expect(observed!.batch[0].amount).toBe(100_000n);
    expect(observed!.batch[1].amount).toBe(200_000n);
  });

  it("ignores depositor vaults that belong to a different Pre-PegIn", async () => {
    // Unrelated vault has a different prePeginTxHash — must not appear
    // in the assembled batch even though it lives under the same depositor.
    const TARGET = { ...ON_CHAIN_VAULT, htlcVout: 0 };
    const UNRELATED = {
      ...ON_CHAIN_VAULT,
      htlcVout: 5,
      prePeginTxHash: "0xa_different_pre_pegin_hash",
    };
    (getVaultFromChain as Mock).mockImplementation((id: string) => {
      if (id === VAULT_ID) return Promise.resolve(TARGET);
      if (id === OTHER_VAULT_ID) return Promise.resolve(UNRELATED);
      throw new Error(`Unexpected vaultId ${id}`);
    });
    (fetchVaultIdsByDepositor as Mock).mockResolvedValue([
      VAULT_ID,
      OTHER_VAULT_ID,
    ]);

    let observed: { batch: ReadonlyArray<unknown> } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        readVault: () => Promise<{ batch: ReadonlyArray<unknown> }>;
      }) => {
        observed = await input.readVault();
        return { txId: "ok" };
      },
    );

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(observed!.batch).toHaveLength(1);
  });

  it("throws when the discovered siblings leave a gap in the HTLC vector", async () => {
    // Target at vout 0, sibling claims vout 2 — vout 1 is missing.
    // The WASM template uses dense vout positions; any gap would
    // mis-align with the funded tx's outputs, so refuse the refund.
    const TARGET = { ...ON_CHAIN_VAULT, htlcVout: 0 };
    const SIBLING = { ...ON_CHAIN_VAULT, htlcVout: 2 };
    (getVaultFromChain as Mock).mockImplementation((id: string) => {
      if (id === VAULT_ID) return Promise.resolve(TARGET);
      if (id === SIBLING_VAULT_ID) return Promise.resolve(SIBLING);
      throw new Error(`Unexpected vaultId ${id}`);
    });
    (fetchVaultIdsByDepositor as Mock).mockResolvedValue([
      VAULT_ID,
      SIBLING_VAULT_ID,
    ]);

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        depositorAddress: DEPOSITOR_ADDRESS,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        feeRate: 10,
      }),
    ).rejects.toThrow(/non-contiguous HTLC vector/);
  });

  it("throws when the connected wallet differs from the on-chain depositor", async () => {
    // Target vault is owned by ON_CHAIN_DEPOSITOR, but the user has a
    // different wallet connected (mid-flow wallet swap, stale modal,
    // or opened a vault they don't own). Refuse before touching the
    // indexer — sibling enumeration against the wrong wallet would
    // produce an incomplete batch and a confusing downstream error.
    const ON_CHAIN_DEPOSITOR = ("0x" + "cd".repeat(20)) as `0x${string}`;
    (getVaultFromChain as Mock).mockResolvedValue({
      ...ON_CHAIN_VAULT,
      depositor: ON_CHAIN_DEPOSITOR,
    });

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        depositorAddress: DEPOSITOR_ADDRESS,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        feeRate: 10,
      }),
    ).rejects.toThrow(
      /owned by .* but the connected wallet is .*Connect with the depositor wallet/,
    );
    // Indexer must not have been queried — fail-closed before doing
    // sibling lookup against the wrong wallet.
    expect(fetchVaultIdsByDepositor).not.toHaveBeenCalled();
  });

  it("enumerates siblings using the on-chain depositor (not the connected-wallet input)", async () => {
    // Pass an upper-case variant of the on-chain depositor. The check
    // is case-insensitive (Ethereum address checksum), and the indexer
    // call must go out with the *on-chain* lowercase form — regardless
    // of how the wallet provider spells the address.
    const CHECKSUMMED = DEPOSITOR_ADDRESS.toUpperCase() as `0x${string}`;
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (fetchVaultIdsByDepositor as Mock).mockResolvedValue([VAULT_ID]);

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: CHECKSUMMED,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(fetchVaultIdsByDepositor).toHaveBeenCalledTimes(1);
    expect(fetchVaultIdsByDepositor).toHaveBeenCalledWith(
      ON_CHAIN_VAULT.depositor,
    );
  });
});
