// Mock the SDK orchestrator — vault-side tests only verify the adapter wiring
// (how it composes readVault / readPrePeginContext / fee / sign / broadcast
// callbacks). The SDK's buildAndBroadcastRefund has its own dedicated tests.
const mockBuildAndBroadcastRefund = vi.fn();
const mockReadRefundPrePeginContext = vi.fn();

const { MockRefundBroadcastRejectedError } = vi.hoisted(() => ({
  MockRefundBroadcastRejectedError: class RefundBroadcastRejectedError extends Error {
    constructor(
      readonly code: -25 | -27,
      readonly vaultId: string,
      readonly signedTxHex: string,
      readonly cause: Error,
    ) {
      super(cause.message);
    }
  },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/services", () => ({
  buildAndBroadcastRefund: (...args: unknown[]) =>
    mockBuildAndBroadcastRefund(...args),
  readRefundPrePeginContext: (...args: unknown[]) =>
    mockReadRefundPrePeginContext(...args),
  BIP68NotMatureError: class BIP68NotMatureError extends Error {},
  RefundBroadcastRejectedError: MockRefundBroadcastRejectedError,
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

// Keep the real spender attribution: a PegIn sweep must not read as a refund.
vi.mock("../../../clients/btc/outspend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../clients/btc/outspend")>()),
  fetchHtlcSpend: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: vi.fn(() => "0xmatching_pre_pegin_hash"),
}));

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
  getRegisteredPrePeginTxFromChainWithGrace: vi.fn(),
}));

vi.mock(
  "../../../clients/eth-contract/btc-vault-registry/depositorVaultIds",
  () => ({ getDepositorVaultIdsFromChain: vi.fn() }),
);

const { PINNED_READ_BLOCK } = vi.hoisted(() => ({
  PINNED_READ_BLOCK: 1_000n,
}));
vi.mock("../../../clients/eth-contract/pinnedReadBlock", () => ({
  resolvePinnedReadBlock: vi.fn().mockResolvedValue(PINNED_READ_BLOCK),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("testnet"),
}));

// Lean sibling pre-filter behind discoverBatch. Defaults to deriving
// prePeginTxHash from the same getVaultFromChain fixtures each test
// configures, so sibling scenarios keep one source of truth. Tests that
// exercise the broken-candidate path override it directly.
const mockGetProtocolInfoBatch = vi.fn(async (ids: readonly string[]) => {
  const { getVaultFromChain } = await import(
    "../../../clients/eth-contract/btc-vault-registry/query"
  );
  return Promise.all(
    ids.map(async (id) => {
      const v = await (getVaultFromChain as Mock)(id);
      return { prePeginTxHash: v.prePeginTxHash };
    }),
  );
});
// One reader per contract, each distinct under deep equality, so a test can tell
// which one was passed where.
const SDK_READERS = vi.hoisted(() => ({
  protocolParamsReader: { reads: "protocol params" },
  vaultKeeperReader: { reads: "vault keepers" },
  universalChallengerReader: { reads: "universal challengers" },
  operationKeyReader: { reads: "operation keys" },
}));
const REGISTRY_READER = {
  getProtocolInfoBatch: (ids: readonly string[]) =>
    mockGetProtocolInfoBatch(ids),
};
vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi
    .fn()
    .mockResolvedValue(SDK_READERS.protocolParamsReader),
  getVaultKeeperReader: vi
    .fn()
    .mockResolvedValue(SDK_READERS.vaultKeeperReader),
  getUniversalChallengerReader: vi
    .fn()
    .mockResolvedValue(SDK_READERS.universalChallengerReader),
  getOperationKeyReader: vi
    .fn()
    .mockResolvedValue(SDK_READERS.operationKeyReader),
  getVaultRegistryReader: vi.fn(() => REGISTRY_READER),
}));

// The refund reads nothing from the indexer. Every query fails, so a read that
// comes back breaks the refund tests rather than passing unnoticed.
vi.mock("../../../clients/graphql/client", () => ({
  graphqlClient: {
    request: vi.fn().mockRejectedValue(new Error("indexer down")),
  },
}));

import { getNetworkFees, pushTx } from "@babylonlabs-io/ts-sdk/tbv/core";
import { RegistrationLogsUnavailableError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import * as bitcoin from "bitcoinjs-lib";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { shouldRetry } from "@/config/queryClient";
import { logger } from "@/infrastructure";

import { fetchHtlcSpend } from "../../../clients/btc/outspend";
import { getDepositorVaultIdsFromChain } from "../../../clients/eth-contract/btc-vault-registry/depositorVaultIds";
import {
  getRegisteredPrePeginTxFromChainWithGrace,
  getVaultFromChain,
} from "../../../clients/eth-contract/btc-vault-registry/query";
import { graphqlClient } from "../../../clients/graphql/client";
import { COPY } from "../../../copy";
import {
  buildAndBroadcastRefundTransaction,
  getRefundPreview,
  HtlcSweptByPeginError,
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
  vaultCoreVersion: 1,
  vaultProvider: "0xprovider",
  applicationEntryPoint: "0xapp",
  appVaultKeepersVersion: 1,
  universalChallengersVersion: 1,
  hashlock: "0xhashlock",
  htlcVout: 0,
  amount: 100_000n,
  prePeginTxHash: "0xmatching_pre_pegin_hash",
  createdAt: 9_000_000n,
};
// Funded Pre-PegIn tx whose HTLC output (vout 0, matching ON_CHAIN_VAULT
// .htlcVout) carries the deposit amount (100_000) PLUS the protocol reserve.
// The refund preview must report this funded value — what the depositor
// actually reclaims — not the bare on-chain deposit amount.
const FUNDED_HTLC_VALUE_SATS = 133_668n; // 100_000 deposit + 33_668 reserve
const FUNDED_PRE_PEGIN_TX_HEX = (() => {
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, 0), 0);
  tx.addOutput(
    Buffer.from(`0014${"bb".repeat(20)}`, "hex"),
    Number(FUNDED_HTLC_VALUE_SATS),
  );
  return tx.toHex();
})();
// As the registration log carries it: 0x-prefixed.
const LOGGED_PRE_PEGIN_TX = `0x${FUNDED_PRE_PEGIN_TX_HEX}`;
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
    (getRegisteredPrePeginTxFromChainWithGrace as Mock).mockResolvedValue(
      LOGGED_PRE_PEGIN_TX,
    );
    // Default: depositor has just the target vault. Sibling-discovery
    // tests below override this to exercise the multi-vault branch.
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([VAULT_ID]);
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

  it("aborts the refund before signing when the stamped vaultCoreVersion is unsupported", async () => {
    (getVaultFromChain as Mock).mockResolvedValue({
      ...ON_CHAIN_VAULT,
      vaultCoreVersion: 4, // real WASM supports [1] — fail closed
    });

    await expect(
      buildAndBroadcastRefundTransaction({
        vaultId: VAULT_ID,
        depositorAddress: DEPOSITOR_ADDRESS,
        btcWalletProvider: BTC_WALLET_PROVIDER,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        feeRate: 10,
      }),
    ).rejects.toThrow(/requires a newer version of the app/);
    expect(pushTx).not.toHaveBeenCalled();
  });

  it("refunds the target even when an unrelated vault fails full validation during sibling discovery", async () => {
    // The depositor also owns an unrelated vault whose validated read
    // fail-closes (e.g. stamped vaultCoreVersion 0). The lean
    // prePeginTxHash pre-filter must exclude it BEFORE the validated read,
    // so the target's refund is unaffected.
    const brokenVaultId = "0xbroken_unrelated_vault" as `0x${string}`;
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([
      VAULT_ID,
      brokenVaultId,
    ]);
    (getVaultFromChain as Mock).mockImplementation((id: string) => {
      if (id === VAULT_ID) return Promise.resolve(ON_CHAIN_VAULT);
      return Promise.reject(
        new Error(
          `Invalid vaultCoreVersion 0 from BTCVaultRegistry.getBtcVaultProtocolInfo(${id})`,
        ),
      );
    });
    mockGetProtocolInfoBatch.mockResolvedValueOnce([
      { prePeginTxHash: "0xsome_other_pre_pegin_hash" },
    ]);

    const txId = await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(txId).toBe("broadcast_txid");
    // The broken candidate was filtered by the lean read — the validated
    // read only ran for the target.
    expect(getVaultFromChain).toHaveBeenCalledWith(VAULT_ID);
    expect(getVaultFromChain).not.toHaveBeenCalledWith(brokenVaultId);
  });

  it("readVault returns the chain's fields, the authenticated Pre-PegIn and the wallet's key", async () => {
    let observed: {
      hashlock: string;
      htlcVout: number;
      amount: bigint;
      unsignedPrePeginTxHex: string;
      depositorBtcPubkey: string;
    } | null = null;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        vaultId: `0x${string}`;
        readVault: () => Promise<{
          hashlock: string;
          htlcVout: number;
          amount: bigint;
          unsignedPrePeginTxHex: string;
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
    expect(observed!.amount).toBe(ON_CHAIN_VAULT.amount);
    expect(observed!.unsignedPrePeginTxHex).toBe(LOGGED_PRE_PEGIN_TX);
    expect(observed!.depositorBtcPubkey).toBe(DEPOSITOR_PUBKEY);
  });

  it("reads the refund context through the SDK, from the chain's readers", async () => {
    const context = { vaultProviderPubkey: "from_the_sdk_reader" };
    mockReadRefundPrePeginContext.mockResolvedValue(context);
    let vault: unknown;
    let observedContext: unknown;
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        readVault: () => Promise<unknown>;
        readPrePeginContext: (v: unknown) => Promise<unknown>;
      }) => {
        vault = await input.readVault();
        observedContext = await input.readPrePeginContext(vault);
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

    expect(mockReadRefundPrePeginContext).toHaveBeenCalledWith({
      vaultId: VAULT_ID,
      vault,
      readers: { registryReader: REGISTRY_READER, ...SDK_READERS },
      network: "testnet",
    });
    expect(observedContext).toBe(context);
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

  it("throws HtlcSweptByPeginError (before signing), not a settled refund, when the vault's own PegIn spent the HTLC", async () => {
    const signedPegin = "0xsigned_pegin_tx";
    const peginTxid = "cd".repeat(32);
    (getVaultFromChain as Mock).mockResolvedValue({
      ...ON_CHAIN_VAULT,
      depositorSignedPeginTx: signedPegin,
    });
    // The PegIn txid is derived from the on-chain signed PegIn; every other
    // hash in this flow is the Pre-PegIn's.
    (calculateBtcTxHash as Mock).mockImplementation((tx: string) =>
      tx === signedPegin ? `0x${peginTxid}` : ON_CHAIN_VAULT.prePeginTxHash,
    );
    (fetchHtlcSpend as Mock).mockResolvedValue({
      spent: true,
      confirmed: true,
      spendingTxid: peginTxid,
    });

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toBeInstanceOf(HtlcSweptByPeginError);
    await expect(promise).rejects.not.toBeInstanceOf(RefundAlreadySettledError);
    await expect(promise).rejects.toThrow(
      COPY.deposit.refundSweptByPegin.beforeSigning,
    );
    expect(mockBuildAndBroadcastRefund).not.toHaveBeenCalled();
  });

  it("attributes a -25 broadcast race to the PegIn when the re-probe finds the PegIn as spender", async () => {
    const signedPegin = "0xsigned_pegin_tx";
    const peginTxid = "cd".repeat(32);
    (getVaultFromChain as Mock).mockResolvedValue({
      ...ON_CHAIN_VAULT,
      depositorSignedPeginTx: signedPegin,
    });
    (calculateBtcTxHash as Mock).mockImplementation((tx: string) =>
      tx === signedPegin ? `0x${peginTxid}` : ON_CHAIN_VAULT.prePeginTxHash,
    );
    (fetchHtlcSpend as Mock)
      .mockResolvedValueOnce({ spent: false, confirmed: false })
      .mockResolvedValueOnce({
        spent: true,
        confirmed: false,
        spendingTxid: peginTxid,
      });
    mockBuildAndBroadcastRefund.mockRejectedValue(
      new MockRefundBroadcastRejectedError(
        -25,
        VAULT_ID,
        "signed_tx",
        new Error(
          'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}',
        ),
      ),
    );

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toBeInstanceOf(HtlcSweptByPeginError);
    await expect(promise).rejects.toThrow(
      COPY.deposit.refundSweptByPegin.afterSigning,
    );
  });

  it("refuses, retryably, a -25 broadcast race whose re-probe names no spender", async () => {
    (fetchHtlcSpend as Mock)
      .mockResolvedValueOnce({ spent: false, confirmed: false })
      .mockResolvedValueOnce({ spent: true, confirmed: true });
    mockBuildAndBroadcastRefund.mockRejectedValue(
      new MockRefundBroadcastRejectedError(
        -25,
        VAULT_ID,
        "signed_tx",
        new Error(
          'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}',
        ),
      ),
    );

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toThrow(
      COPY.deposit.refundSpenderUnknown.afterSigning,
    );
    await expect(promise).rejects.not.toBeInstanceOf(RefundAlreadySettledError);
    await expect(promise).rejects.not.toBeInstanceOf(HtlcSweptByPeginError);
  });

  it("settles a -27 broadcast race whose re-probe names no spender as the signed refund itself", async () => {
    // -27 says the signed refund is already confirmed, so the unnamed spender
    // is that refund.
    const ownRefundTxid = "aa".repeat(32);
    (calculateBtcTxHash as Mock).mockImplementation((tx: string) =>
      tx === "signed_tx" ? `0x${ownRefundTxid}` : ON_CHAIN_VAULT.prePeginTxHash,
    );
    (fetchHtlcSpend as Mock)
      .mockResolvedValueOnce({ spent: false, confirmed: false })
      .mockResolvedValueOnce({ spent: true, confirmed: true });
    mockBuildAndBroadcastRefund.mockRejectedValue(
      new MockRefundBroadcastRejectedError(
        -27,
        VAULT_ID,
        "signed_tx",
        new Error(
          'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
        ),
      ),
    );

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toBeInstanceOf(RefundAlreadySettledError);
    await expect(promise).rejects.toMatchObject({
      spendingTxid: ownRefundTxid,
      confirmed: true,
    });
  });

  it("refuses, retryably and without recording a refund, a spend reported with no spending txid", async () => {
    (fetchHtlcSpend as Mock).mockResolvedValue({
      spent: true,
      confirmed: true,
    });

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toThrow(
      COPY.deposit.refundSpenderUnknown.beforeSigning,
    );
    await expect(promise).rejects.not.toBeInstanceOf(RefundAlreadySettledError);
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
    mockBuildAndBroadcastRefund.mockRejectedValue(
      new MockRefundBroadcastRejectedError(
        -27,
        VAULT_ID,
        "signed_tx",
        new Error(
          'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
        ),
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
    const cause = new Error(
      'Failed to broadcast BTC transaction: sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
    );
    mockBuildAndBroadcastRefund.mockRejectedValue(
      new MockRefundBroadcastRejectedError(-27, VAULT_ID, "signed_tx", cause),
    );

    const promise = buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: DEPOSITOR_ADDRESS,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    await expect(promise).rejects.toBe(cause);
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
    (calculateBtcTxHash as Mock).mockReturnValue(ON_CHAIN_VAULT.prePeginTxHash);
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (getRegisteredPrePeginTxFromChainWithGrace as Mock).mockResolvedValue(
      LOGGED_PRE_PEGIN_TX,
    );
    (getNetworkFees as Mock).mockResolvedValue({ halfHourFee: 7 });
    mockFetch.mockResolvedValue({ status: 200 });
  });

  it("returns the funded HTLC value (deposit + reserve) as the refund amount, with the deposit amount as the fee-cap basis", async () => {
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview).toEqual({
      prePeginOnChain: true,
      // The reclaimed amount is the funded HTLC output value, not the bare
      // on-chain deposit amount — the reserve returns to the depositor.
      amountSats: FUNDED_HTLC_VALUE_SATS,
      // The SDK caps the fee against the deposit amount; the preview surfaces
      // it separately so the UI cap mirrors the SDK exactly.
      feeCapBasisSats: ON_CHAIN_VAULT.amount,
      halfHourFeeSatsVb: 7,
    });
  });

  it("returns null halfHourFeeSatsVb when the fee endpoint fails (vault data still loads)", async () => {
    (getNetworkFees as Mock).mockRejectedValue(
      new Error("mempool unreachable"),
    );
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview).toMatchObject({
      amountSats: FUNDED_HTLC_VALUE_SATS,
      halfHourFeeSatsVb: null,
    });
  });

  it("returns null halfHourFeeSatsVb when the fee endpoint reports zero", async () => {
    (getNetworkFees as Mock).mockResolvedValue({ halfHourFee: 0 });
    const preview = await getRefundPreview(VAULT_ID);
    expect(preview).toMatchObject({ halfHourFeeSatsVb: null });
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

describe("vaultRefundService - Pre-PegIn bytes", () => {
  // A real transaction, its real txid and the real hash function: what these
  // cases pin is the check that a source's bytes are the vault's transaction.
  const PRE_WITNESS_TX_HEX = FUNDED_PRE_PEGIN_TX_HEX;
  const VAULT = {
    ...ON_CHAIN_VAULT,
    prePeginTxHash: `0x${bitcoin.Transaction.fromHex(PRE_WITNESS_TX_HEX).getId()}`,
    // Only the spender attribution reads it; it must parse.
    depositorSignedPeginTx: `0x${PRE_WITNESS_TX_HEX}`,
  };
  const SIGNED_TX_HEX = (() => {
    const tx = bitcoin.Transaction.fromHex(PRE_WITNESS_TX_HEX);
    tx.setWitness(0, [Buffer.alloc(64, 1), Buffer.alloc(33, 2)]);
    return tx.toHex();
  })();
  const ANOTHER_TX_HEX = (() => {
    const tx = bitcoin.Transaction.fromHex(PRE_WITNESS_TX_HEX);
    tx.locktime = 1;
    return tx.toHex();
  })();
  const REFUND_PARAMS = {
    vaultId: VAULT_ID,
    depositorAddress: DEPOSITOR_ADDRESS,
    btcWalletProvider: BTC_WALLET_PROVIDER,
    depositorBtcPubkey: DEPOSITOR_PUBKEY,
    feeRate: 10,
  };

  /** The Pre-PegIn is on Bitcoin per the probe; `/hex` serves `txHex`, or 404s. */
  function serveFromBitcoin(txHex: string | null) {
    mockFetch.mockImplementation(async (url: string) => {
      if (!url.endsWith("/hex")) return { status: 200 };
      return txHex === null
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, text: async () => txHex };
    });
  }

  function serveFromLog(txHex: string | null) {
    const log = getRegisteredPrePeginTxFromChainWithGrace as Mock;
    if (txHex === null) {
      log.mockRejectedValue(new Error("no registration logs"));
    } else {
      log.mockResolvedValue(txHex);
    }
  }

  /** Runs a refund up to the SDK's `readVault` and returns the bytes it gets. */
  async function bytesTheRefundIsBuiltFrom(): Promise<string> {
    let bytes = "";
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        readVault: () => Promise<{ unsignedPrePeginTxHex: string }>;
      }) => {
        bytes = (await input.readVault()).unsignedPrePeginTxHex;
        return { txId: "ok" };
      },
    );
    await buildAndBroadcastRefundTransaction(REFUND_PARAMS);
    return bytes;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<
      typeof import("@babylonlabs-io/ts-sdk/tbv/core/utils")
    >("@babylonlabs-io/ts-sdk/tbv/core/utils");
    (calculateBtcTxHash as Mock).mockImplementation(actual.calculateBtcTxHash);
    (getVaultFromChain as Mock).mockResolvedValue(VAULT);
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([VAULT_ID]);
    vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(logger.warn).mockRestore();
    vi.useRealTimers();
  });

  it("takes the Pre-PegIn from Bitcoin, stripped to its pre-witness bytes, when the log is unavailable", async () => {
    serveFromBitcoin(SIGNED_TX_HEX);
    serveFromLog(null);

    await expect(bytesTheRefundIsBuiltFrom()).resolves.toBe(
      `0x${PRE_WITNESS_TX_HEX}`,
    );
  });

  it("takes the Pre-PegIn from a 0x-prefixed registration log when Bitcoin has no copy", async () => {
    serveFromBitcoin(null);
    serveFromLog(`0x${PRE_WITNESS_TX_HEX}`);

    await expect(bytesTheRefundIsBuiltFrom()).resolves.toBe(
      `0x${PRE_WITNESS_TX_HEX}`,
    );
  });

  it("strips a witness carried in the registration log", async () => {
    serveFromBitcoin(null);
    serveFromLog(`0x${SIGNED_TX_HEX}`);

    await expect(bytesTheRefundIsBuiltFrom()).resolves.toBe(
      `0x${PRE_WITNESS_TX_HEX}`,
    );
  });

  it("reads from Bitcoin on a runtime with no AbortSignal.timeout", async () => {
    const original = AbortSignal.timeout;
    // @ts-expect-error - deliberately emulating a browser that predates the API
    delete AbortSignal.timeout;

    try {
      serveFromBitcoin(SIGNED_TX_HEX);
      serveFromLog(null);

      await expect(bytesTheRefundIsBuiltFrom()).resolves.toBe(
        `0x${PRE_WITNESS_TX_HEX}`,
      );
    } finally {
      AbortSignal.timeout = original;
    }
  });

  it("ignores a source whose bytes hash to another txid and uses the other source", async () => {
    serveFromBitcoin(ANOTHER_TX_HEX);
    serveFromLog(`0x${PRE_WITNESS_TX_HEX}`);

    await expect(bytesTheRefundIsBuiltFrom()).resolves.toBe(
      `0x${PRE_WITNESS_TX_HEX}`,
    );
  });

  it("ignores a source whose answer does not parse and uses the other source", async () => {
    serveFromBitcoin("<html>rate limited</html>");
    serveFromLog(`0x${PRE_WITNESS_TX_HEX}`);

    await expect(bytesTheRefundIsBuiltFrom()).resolves.toBe(
      `0x${PRE_WITNESS_TX_HEX}`,
    );
  });

  // The race hides a loser's answer, and a wrong transaction is a tamper signal.
  it("warns when a source serves bytes that hash to another txid", async () => {
    serveFromBitcoin(ANOTHER_TX_HEX);
    serveFromLog(`0x${PRE_WITNESS_TX_HEX}`);

    await bytesTheRefundIsBuiltFrom();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(VAULT.prePeginTxHash),
    );
  });

  it("does not warn when a source is merely unavailable", async () => {
    serveFromBitcoin(null);
    serveFromLog(`0x${PRE_WITNESS_TX_HEX}`);

    await bytesTheRefundIsBuiltFrom();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("refuses before signing, keeping each source's reason, when neither can supply the Pre-PegIn", async () => {
    serveFromBitcoin(ANOTHER_TX_HEX);
    serveFromLog(null);
    mockBuildAndBroadcastRefund.mockImplementation(
      async (input: {
        readVault: () => Promise<unknown>;
        signPsbt: (hex: string, opts: unknown) => Promise<string>;
      }) => {
        await input.readVault();
        await input.signPsbt("psbt_hex", {});
        return { txId: "ok" };
      },
    );

    const error: Error = await buildAndBroadcastRefundTransaction(
      REFUND_PARAMS,
    ).then(
      () => {
        throw new Error("expected the refund to be refused");
      },
      (err) => err,
    );

    expect(error.message).toBe(
      COPY.deposit.errors.refundPrePeginTxUnavailable(VAULT.prePeginTxHash),
    );
    expect((error.cause as AggregateError).errors).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("the vault registered"),
      }),
      expect.objectContaining({ message: "no registration logs" }),
    ]);
    expect(BTC_WALLET_PROVIDER.signPsbt).not.toHaveBeenCalled();
  });

  // The log read has already spent its retries; the query client repeating it
  // would only hold the modal's spinner for another minute.
  it("is not retried by the query client once the log read has used up its schedule", async () => {
    serveFromBitcoin(null);
    (getRegisteredPrePeginTxFromChainWithGrace as Mock).mockRejectedValue(
      new RegistrationLogsUnavailableError(VAULT.createdAt),
    );

    const error: Error = await getRefundPreview(VAULT_ID).then(
      () => {
        throw new Error("expected the preview to fail");
      },
      (err) => err,
    );

    expect(shouldRetry(0, error)).toBe(false);
  });

  // Only the typed empty-log error has retries of its own, so a one-off RPC
  // failure still needs the query client's.
  it("leaves a log read that failed outright to the query client's retries", async () => {
    serveFromBitcoin(null);
    serveFromLog(null);

    const error: Error = await getRefundPreview(VAULT_ID).then(
      () => {
        throw new Error("expected the preview to fail");
      },
      (err) => err,
    );

    expect(error.message).toBe(
      COPY.deposit.errors.refundPrePeginTxUnavailable(VAULT.prePeginTxHash),
    );
    expect(shouldRetry(0, error)).toBe(true);
  });

  it("gives up at the deadline, without a query retry, when the log read never answers and Bitcoin has no copy", async () => {
    vi.useFakeTimers();
    serveFromBitcoin(null);
    (getRegisteredPrePeginTxFromChainWithGrace as Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    let settled = false;
    const outcome = getRefundPreview(VAULT_ID)
      .catch((err: Error) => err)
      .finally(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = (await outcome) as Error;
    expect(error.message).toBe(
      COPY.deposit.errors.refundPrePeginTxUnavailable(VAULT.prePeginTxHash),
    );
    expect(shouldRetry(0, error)).toBe(false);
  });

  it("asks for the log of the vault's registration block", async () => {
    serveFromBitcoin(null);
    serveFromLog(`0x${PRE_WITNESS_TX_HEX}`);

    await bytesTheRefundIsBuiltFrom();

    expect(getRegisteredPrePeginTxFromChainWithGrace).toHaveBeenCalledWith(
      VAULT_ID,
      VAULT.createdAt,
      expect.any(AbortSignal),
    );
  });

  it("does not wait for the log once Bitcoin has answered, and cancels its backoff", async () => {
    serveFromBitcoin(SIGNED_TX_HEX);
    let logSignal: AbortSignal | undefined;
    (getRegisteredPrePeginTxFromChainWithGrace as Mock).mockImplementation(
      (_vaultId: string, _createdAt: bigint, signal: AbortSignal) => {
        logSignal = signal;
        return new Promise(() => {});
      },
    );

    await expect(getRefundPreview(VAULT_ID)).resolves.toMatchObject({
      amountSats: FUNDED_HTLC_VALUE_SATS,
    });
    expect(logSignal?.aborted).toBe(true);
  });

  // Only the flaky log holds a Pre-PegIn that never reached Bitcoin, and "nothing
  // to refund" must not hang on it.
  it("reports nothing to refund without reading the bytes when Bitcoin answers 404", async () => {
    mockFetch.mockResolvedValue({ status: 404 });

    await expect(getRefundPreview(VAULT_ID)).resolves.toEqual({
      prePeginOnChain: false,
    });
    expect(getRegisteredPrePeginTxFromChainWithGrace).not.toHaveBeenCalled();
  });

  it("refuses at the broadcast guard without reading the bytes", async () => {
    mockFetch.mockResolvedValue({ status: 404 });

    await expect(
      buildAndBroadcastRefundTransaction(REFUND_PARAMS),
    ).rejects.toThrow(COPY.deposit.refundNotBroadcast.broadcastGuardError);
    expect(getRegisteredPrePeginTxFromChainWithGrace).not.toHaveBeenCalled();
  });

  it("settles an already-spent HTLC without reading the bytes", async () => {
    serveFromBitcoin(null);
    (fetchHtlcSpend as Mock).mockResolvedValueOnce({
      spent: true,
      confirmed: true,
      spendingTxid: "existing_refund_txid",
    });

    await expect(
      buildAndBroadcastRefundTransaction(REFUND_PARAMS),
    ).rejects.toBeInstanceOf(RefundAlreadySettledError);
    expect(getRegisteredPrePeginTxFromChainWithGrace).not.toHaveBeenCalled();
  });

  it("reads the vault record and the bytes once per broadcast", async () => {
    serveFromBitcoin(null);
    serveFromLog(`0x${PRE_WITNESS_TX_HEX}`);

    await bytesTheRefundIsBuiltFrom();

    expect(getVaultFromChain).toHaveBeenCalledTimes(1);
    expect(getRegisteredPrePeginTxFromChainWithGrace).toHaveBeenCalledTimes(1);
  });

  it("previews and builds a refund without reading the indexer", async () => {
    serveFromBitcoin(SIGNED_TX_HEX);
    serveFromLog(null);

    await getRefundPreview(VAULT_ID);
    await bytesTheRefundIsBuiltFrom();

    expect(graphqlClient.request).not.toHaveBeenCalled();
  });
});

describe("vaultRefundService - sibling batch discovery", () => {
  const SIBLING_VAULT_ID = "0xsiblingid" as `0x${string}`;
  const OTHER_VAULT_ID = "0xunrelated" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ status: 200 });
    (calculateBtcTxHash as Mock).mockReturnValue(ON_CHAIN_VAULT.prePeginTxHash);
    (getRegisteredPrePeginTxFromChainWithGrace as Mock).mockResolvedValue(
      LOGGED_PRE_PEGIN_TX,
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
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([VAULT_ID]);

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
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([
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
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([
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
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([
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
    // or opened a vault they don't own). Refuse before enumerating —
    // sibling enumeration against the wrong wallet would produce an
    // incomplete batch and a confusing downstream error.
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
    // The registry list must not have been read — fail-closed before
    // doing sibling lookup against the wrong wallet.
    expect(getDepositorVaultIdsFromChain).not.toHaveBeenCalled();
  });

  it("enumerates siblings using the on-chain depositor (not the connected-wallet input)", async () => {
    // Pass an upper-case variant of the on-chain depositor. The check
    // is case-insensitive (Ethereum address checksum), and the registry
    // read must go out with the *on-chain* lowercase form — regardless
    // of how the wallet provider spells the address.
    const CHECKSUMMED = DEPOSITOR_ADDRESS.toUpperCase() as `0x${string}`;
    (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
    (getDepositorVaultIdsFromChain as Mock).mockResolvedValue([VAULT_ID]);

    await buildAndBroadcastRefundTransaction({
      vaultId: VAULT_ID,
      depositorAddress: CHECKSUMMED,
      btcWalletProvider: BTC_WALLET_PROVIDER,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      feeRate: 10,
    });

    expect(getDepositorVaultIdsFromChain).toHaveBeenCalledTimes(1);
    expect(getDepositorVaultIdsFromChain).toHaveBeenCalledWith(
      ON_CHAIN_VAULT.depositor,
      PINNED_READ_BLOCK,
    );
  });
});
