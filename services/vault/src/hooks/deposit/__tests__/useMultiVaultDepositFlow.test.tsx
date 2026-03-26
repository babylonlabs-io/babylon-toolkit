/**
 * Tests for useMultiVaultDepositFlow hook
 *
 * Tests all three allocation strategies:
 * - SINGLE: One vault using standard flow
 * - MULTI_INPUT: Two vaults with existing UTXOs
 * - SPLIT: Two vaults with split transaction
 */

import { renderHook, waitFor } from "@testing-library/react";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AllocationPlan } from "@/services/vault";

import { useMultiVaultDepositFlow } from "../useMultiVaultDepositFlow";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("@/utils/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/rpc")>()),
  getVpProxyUrl: (address: string) => `https://proxy.test/rpc/${address}`,
}));

// Mock SDK functions
vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  SPLIT_TX_FEE_SAFETY_MULTIPLIER: 5,
  createSplitTransaction: vi.fn(),
  createSplitTransactionPsbt: vi.fn(),
  ensureHexPrefix: (hex: string) => (hex.startsWith("0x") ? hex : `0x${hex}`),
}));

// Mock wallet connector (still needed by other code)
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: vi.fn(),
}));

// Mock useBtcWalletState (replaces useChainConnector + useUTXOs in the hook)
vi.mock("../useBtcWalletState", () => ({
  useBtcWalletState: vi.fn(),
}));

// Mock bitcoinjs-lib
vi.mock("bitcoinjs-lib", () => ({
  Psbt: {
    fromHex: vi.fn(() => ({
      setMaximumFeeRate: vi.fn(),
      extractTransaction: vi.fn(() => ({
        toHex: vi.fn(() => "mockSignedTxHex"),
      })),
    })),
  },
}));

// Mock uuid
vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-batch-id-uuid"),
}));

// Mock config
vi.mock("@/clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.test"),
}));

vi.mock("@/config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "testnet"),
}));

// Mock context
vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(),
}));

// Mock hooks
vi.mock("@/hooks/useUTXOs", () => ({
  useUTXOs: vi.fn(),
}));

vi.mock("../useVaultProviders", () => ({
  useVaultProviders: vi.fn(),
}));

// Mock vault services
vi.mock("@/services/vault", () => ({
  planUtxoAllocation: vi.fn(),
  preparePeginFromSplitOutput: vi.fn(),
  registerSplitPeginOnChain: vi.fn(),
  broadcastPrePeginWithLocalUtxo: vi.fn(),
  estimateSplitTxFee: vi.fn(() => 10000n),
}));

vi.mock("@/services/vault/vaultPayoutSignatureService", () => ({
  signPayoutTransactions: vi.fn(),
}));

// Mock depositor graph signing service to avoid SDK imports triggering initEccLib
vi.mock("@/services/vault/depositorGraphSigningService", () => ({
  signDepositorGraph: vi.fn().mockResolvedValue({
    payout_signatures: { payout_signature: "mock_payout_sig" },
    per_challenger: {},
  }),
}));

// Mock protocol params query to avoid ETH client initialization
vi.mock("@/clients/eth-contract/protocol-params/query", () => ({
  getLatestOffchainParams: vi.fn().mockResolvedValue({
    timelockAssert: 100,
    securityCouncilKeys: ["0xcouncil1"],
  }),
}));

// Mock Lamport service (deriveLamportPkHash returns a mock hash)
vi.mock("@/services/lamport/lamportService", () => ({
  deriveLamportPkHash: vi
    .fn()
    .mockResolvedValue(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    ),
}));

vi.mock("@/services/vault/vaultActivationService", () => ({
  activateVaultWithSecret: vi
    .fn()
    .mockResolvedValue({ hash: "0xActivationTxHash" }),
}));

vi.mock("@/services/vault/vaultPeginBroadcastService", () => ({
  broadcastPrePeginTransaction: vi.fn().mockResolvedValue("mockBroadcastTxId"),
}));

vi.mock("@/models/peginStateMachine", () => ({
  LocalStorageStatus: { CONFIRMING: "CONFIRMING" },
}));

// Mock storage
vi.mock("@/storage/peginStorage", () => ({
  addPendingPegin: vi.fn(),
  updatePendingPeginStatus: vi.fn(),
}));

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}));
vi.mock("@/infrastructure", () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock deposit flow steps
vi.mock("../depositFlowSteps", () => ({
  DepositFlowStep: {
    SIGN_SPLIT_TX: 0,
    SIGN_POP: 1,
    SUBMIT_PEGIN: 2,
    SIGN_PAYOUTS: 3,
    ARTIFACT_DOWNLOAD: 4,
    BROADCAST_PRE_PEGIN: 5,
    ACTIVATE_VAULT: 6,
    COMPLETED: 7,
  },
  getEthWalletClient: vi.fn(),
  preparePegin: vi.fn(),
  registerPeginAndWait: vi.fn(),
  pollAndPreparePayoutSigning: vi.fn(),
  submitLamportPublicKey: vi.fn(),
  submitPayoutSignatures: vi.fn(),
  waitForContractVerification: vi.fn(),
}));

// ============================================================================
// Test Data
// ============================================================================

const MOCK_UTXO_1 = {
  txid: "utxo1txid" + "0".repeat(56),
  vout: 0,
  value: 500000,
  scriptPubKey: "0xabc123",
};

const MOCK_UTXO_2 = {
  txid: "utxo2txid" + "0".repeat(56),
  vout: 1,
  value: 300000,
  scriptPubKey: "0xdef456",
};

const MOCK_BTC_WALLET = {
  getPublicKeyHex: vi.fn().mockResolvedValue("02" + "ab".repeat(32)), // 66 chars (compressed)
  signPsbt: vi.fn().mockResolvedValue("mockSignedPsbtHex"),
  getAddress: vi.fn().mockResolvedValue("bc1qtest"),
  getNetwork: vi.fn().mockResolvedValue("testnet"),
};

const MOCK_ETH_WALLET = {
  account: { address: "0xEthAddress123" as Address },
  chain: { id: 11155111 },
};

const MOCK_PARAMS = {
  vaultAmounts: [100000n],
  mempoolFeeRate: 10,
  btcWalletProvider: MOCK_BTC_WALLET as any,
  depositorEthAddress: "0xEthAddress123" as Address,
  selectedApplication: "0xAppController",
  selectedProviders: ["0xProvider123"],
  vaultProviderBtcPubkey: "ab".repeat(32), // 64 hex chars
  vaultKeeperBtcPubkeys: ["keeper1pubkey"],
  universalChallengerBtcPubkeys: ["uc1pubkey"],
  depositorClaimValue: 35_000n,
  getMnemonic: async () => "test mnemonic phrase for lamport key derivation",
  htlcSecretHexes: ["ab".repeat(32), "cd".repeat(32)],
};

const SINGLE_PLAN: AllocationPlan = {
  strategy: "SINGLE",
  needsSplit: false,
  splitTransaction: undefined,
  vaultAllocations: [
    {
      vaultIndex: 0,
      fromSplit: false,
      utxos: [MOCK_UTXO_1],
      splitTxOutputIndex: undefined,
      amount: 100000n,
    },
  ],
};

const MULTI_INPUT_PLAN: AllocationPlan = {
  strategy: "MULTI_INPUT",
  needsSplit: false,
  splitTransaction: undefined,
  vaultAllocations: [
    {
      vaultIndex: 0,
      fromSplit: false,
      utxos: [MOCK_UTXO_1],
      splitTxOutputIndex: undefined,
      amount: 100000n,
    },
    {
      vaultIndex: 1,
      fromSplit: false,
      utxos: [MOCK_UTXO_2],
      splitTxOutputIndex: undefined,
      amount: 100000n,
    },
  ],
};

const SPLIT_PLAN: AllocationPlan = {
  strategy: "SPLIT",
  needsSplit: true,
  splitTransaction: {
    inputs: [MOCK_UTXO_1],
    outputs: [
      { amount: 100000n, address: "bc1qsplit1", vout: 0 },
      { amount: 100000n, address: "bc1qsplit2", vout: 1 },
      { amount: 290000n, address: "bc1qchange", vout: 2 },
    ],
    txHex: "mockSplitTxHex",
    txid: "splitTxId" + "0".repeat(56),
  },
  vaultAllocations: [
    {
      vaultIndex: 0,
      fromSplit: true,
      utxos: [],
      splitTxOutputIndex: 0,
      amount: 100000n,
    },
    {
      vaultIndex: 1,
      fromSplit: true,
      utxos: [],
      splitTxOutputIndex: 1,
      amount: 100000n,
    },
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Executes the multi-vault deposit flow while auto-resolving artifact download
 * prompts. The artifact download step blocks on a promise that requires user
 * interaction (clicking "Continue"). In tests we poll for it and auto-resolve.
 */
async function executeWithAutoArtifactDownload(result: {
  current: ReturnType<typeof useMultiVaultDepositFlow>;
}) {
  const pollId = setInterval(() => {
    if (result.current.artifactDownloadInfo) {
      result.current.continueAfterArtifactDownload();
    }
  }, 10);

  try {
    return await result.current.executeMultiVaultDeposit();
  } finally {
    clearInterval(pollId);
  }
}

async function setupDefaultMocks() {
  const { pushTx } = vi.mocked(await import("@babylonlabs-io/ts-sdk"));
  const { createSplitTransaction, createSplitTransactionPsbt } = vi.mocked(
    await import("@babylonlabs-io/ts-sdk/tbv/core"),
  );
  const { useBtcWalletState } = vi.mocked(await import("../useBtcWalletState"));
  const { useProtocolParamsContext } = vi.mocked(
    await import("@/context/ProtocolParamsContext"),
  );
  const { useVaultProviders } = vi.mocked(await import("../useVaultProviders"));
  const {
    planUtxoAllocation,
    preparePeginFromSplitOutput,
    registerSplitPeginOnChain,
    broadcastPrePeginWithLocalUtxo,
  } = vi.mocked(await import("@/services/vault"));
  const { signPayoutTransactions } = vi.mocked(
    await import("@/services/vault/vaultPayoutSignatureService"),
  );
  const { broadcastPrePeginTransaction } = vi.mocked(
    await import("@/services/vault/vaultPeginBroadcastService"),
  );
  const { addPendingPegin } = vi.mocked(await import("@/storage/peginStorage"));
  const {
    getEthWalletClient,
    preparePegin,
    registerPeginAndWait,
    pollAndPreparePayoutSigning,
    submitPayoutSignatures,
    waitForContractVerification,
  } = vi.mocked(await import("../depositFlowSteps"));

  // BTC wallet state (btcAddress + UTXOs)
  vi.mocked(useBtcWalletState).mockReturnValue({
    btcAddress: "bc1qtest",
    spendableUTXOs: [MOCK_UTXO_1, MOCK_UTXO_2],
    isUTXOsLoading: false,
    utxoError: null,
  } as any);

  // Protocol params
  vi.mocked(useProtocolParamsContext).mockReturnValue({
    config: {
      offchainParams: {
        babeInstancesToFinalize: 2,
        councilQuorum: 1,
        securityCouncilKeys: ["0xcouncil1"],
        feeRate: 10n,
      },
    },
    timelockPegin: 100,
    getOffchainParamsByVersion: vi.fn(() => ({
      timelockAssert: 100n,
      securityCouncilKeys: ["0xcouncil1"],
    })),
  } as any);

  // Vault providers
  vi.mocked(useVaultProviders).mockReturnValue({
    findProvider: vi.fn(() => ({
      id: "0xProvider123",
      url: "https://provider.test",
      btcPubKey: "providerpubkey",
    })),
    vaultKeepers: [{ btcPubKey: "keeper1pubkey" }],
  } as any);

  // SDK functions
  vi.mocked(pushTx).mockResolvedValue("splitTxBroadcastId");
  vi.mocked(createSplitTransaction).mockReturnValue({
    txHex: "splitTxHex",
    txid: "splitTxId" + "0".repeat(56),
    outputs: [
      {
        txid: "splitTxId" + "0".repeat(56),
        vout: 0,
        value: 100000,
        scriptPubKey: "0xsplit1",
      },
      {
        txid: "splitTxId" + "0".repeat(56),
        vout: 1,
        value: 100000,
        scriptPubKey: "0xsplit2",
      },
      {
        txid: "splitTxId" + "0".repeat(56),
        vout: 2,
        value: 290000,
        scriptPubKey: "0xchange",
      },
    ],
  });
  vi.mocked(createSplitTransactionPsbt).mockReturnValue("splitPsbtHex");

  // Vault services
  vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);
  vi.mocked(preparePeginFromSplitOutput).mockResolvedValue({
    btcTxHash: "peginTxHash" as Hex,
    fundedPrePeginTxHex: "fundedPrePeginTxHex",
    peginTxHex: "peginTxHex",
    peginInputSignature: "a".repeat(128),
    vaultScriptPubKey: "vaultScriptPubKey",
    selectedUTXOs: [MOCK_UTXO_1],
    fee: 1000n,
    changeAmount: 0n,
    depositorBtcPubkey: "ab".repeat(32),
  });
  vi.mocked(registerSplitPeginOnChain).mockResolvedValue({
    ethTxHash: "0xEthTxHash" as Hex,
    vaultId: "0xVaultId" as Hex,
    btcPopSignature: "0xMockPopSignature" as Hex,
  });
  vi.mocked(broadcastPrePeginWithLocalUtxo).mockResolvedValue("btcTxId");

  // Payout signing
  vi.mocked(signPayoutTransactions).mockResolvedValue({
    mockclaimer: { payout_signature: "payoutSig" },
  });

  // Deposit flow steps
  vi.mocked(getEthWalletClient).mockResolvedValue(MOCK_ETH_WALLET as any);
  vi.mocked(preparePegin).mockResolvedValue({
    btcTxid: "0xstandardBtcTxid" as Hex,
    depositorBtcPubkey: "ab".repeat(32),
    fundedPrePeginTxHex: "standardPrePeginTxHex",
    peginTxHex: "standardPeginTxHex",
    peginInputSignature: "a".repeat(128),
    selectedUTXOs: [MOCK_UTXO_1],
    fee: 800n,
  });
  vi.mocked(registerPeginAndWait).mockResolvedValue({
    btcTxid: "0xstandardBtcTxid" as Hex,
    ethTxHash: "0xStandardEthTx" as Hex,
    btcPopSignature: "0xMockPopSignature" as Hex,
  });
  vi.mocked(pollAndPreparePayoutSigning).mockResolvedValue({
    context: {} as any,
    vaultProviderAddress: "0xProvider123",
    preparedTransactions: [
      {
        claimerPubkeyXOnly: "claimerpubkey",
        payoutTxHex: "payoutHex",
        assertTxHex: "assertHex",
      },
    ],
    depositorGraph: {
      claim_tx: { tx_hex: "0xdepclaim" },
      assert_tx: { tx_hex: "0xdepassert" },
      payout_tx: { tx_hex: "0xdeppayout" },
      challenger_presign_data: [],
      payout_psbt: "bW9ja19wYXlvdXRfcHNidA==",
      offchain_params_version: 0,
    },
  });
  vi.mocked(submitPayoutSignatures).mockResolvedValue(undefined);
  vi.mocked(waitForContractVerification).mockResolvedValue(undefined);
  vi.mocked(broadcastPrePeginTransaction).mockResolvedValue(
    "mockBroadcastTxId",
  );

  // Storage
  vi.mocked(addPendingPegin).mockReturnValue(undefined);
}

// ============================================================================
// Tests
// ============================================================================

describe("useMultiVaultDepositFlow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupDefaultMocks();
  });

  describe("SINGLE Vault Strategy", () => {
    it("should use standard preparePegin + registerPeginAndWait path", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { preparePegin } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(preparePegin).toHaveBeenCalledTimes(1);
        expect(preparePegin).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: 100000n,
            confirmedUTXOs: [MOCK_UTXO_1],
          }),
        );
      });
    });

    it("should NOT create split transaction", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { createSplitTransaction } = vi.mocked(
        await import("@babylonlabs-io/ts-sdk/tbv/core"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
      });

      expect(createSplitTransaction).not.toHaveBeenCalled();
    });

    it("should save pegin with batchId but no splitTxId", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledWith(
          "0xEthAddress123",
          expect.objectContaining({
            batchId: "mock-batch-id-uuid",
            splitTxId: undefined, // No split TX
            batchIndex: 1, // First vault
            batchTotal: 1, // Single vault
          }),
        );
      });
    });

    it("should return result with 1 pegin and SINGLE strategy", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
      });

      expect(depositResult).toEqual({
        pegins: [
          expect.objectContaining({
            vaultIndex: 0,
            btcTxHash: "0xstandardBtcTxid",
            ethTxHash: "0xStandardEthTx",
          }),
        ],
        batchId: "mock-batch-id-uuid",
        splitTxId: undefined,
        strategy: "SINGLE",
        warnings: undefined,
      });
    });
  });

  describe("MULTI_INPUT Strategy", () => {
    const MULTI_VAULT_PARAMS = {
      ...MOCK_PARAMS,
      vaultAmounts: [100000n, 100000n],
    };

    it("should create 2 pegins using standard path", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { preparePegin } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(preparePegin).toHaveBeenCalledTimes(2);
      });
    });

    it("should NOT create split transaction", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { createSplitTransaction } = vi.mocked(
        await import("@babylonlabs-io/ts-sdk/tbv/core"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
      });

      expect(createSplitTransaction).not.toHaveBeenCalled();
    });

    it("should pass correct UTXOs to each vault", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { preparePegin } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(preparePegin).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            confirmedUTXOs: [MOCK_UTXO_1],
          }),
        );
        expect(preparePegin).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            confirmedUTXOs: [MOCK_UTXO_2],
          }),
        );
      });
    });

    it("should save both pegins with same batchId, no splitTxId", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(2);
      });

      // Both should have same batchId, no splitTxId
      expect(addPendingPegin).toHaveBeenNthCalledWith(
        1,
        "0xEthAddress123",
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          splitTxId: undefined,
          batchIndex: 1, // First vault
          batchTotal: 2, // Two vaults
        }),
      );
      expect(addPendingPegin).toHaveBeenNthCalledWith(
        2,
        "0xEthAddress123",
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          splitTxId: undefined,
          batchIndex: 2, // Second vault
          batchTotal: 2, // Two vaults
        }),
      );
    });

    it("should return result with 2 pegins and MULTI_INPUT strategy", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      expect(depositResult).toEqual({
        pegins: expect.arrayContaining([
          expect.objectContaining({ vaultIndex: 0 }),
          expect.objectContaining({ vaultIndex: 1 }),
        ]),
        batchId: "mock-batch-id-uuid",
        splitTxId: undefined,
        strategy: "MULTI_INPUT",
        warnings: undefined,
      });
    });
  });

  describe("SPLIT Strategy", () => {
    const SPLIT_VAULT_PARAMS = {
      ...MOCK_PARAMS,
      vaultAmounts: [100000n, 100000n],
    };

    it("should create split transaction before pegins", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { createSplitTransaction } = vi.mocked(
        await import("@babylonlabs-io/ts-sdk/tbv/core"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(createSplitTransaction).toHaveBeenCalledWith(
          SPLIT_PLAN.splitTransaction!.inputs,
          SPLIT_PLAN.splitTransaction!.outputs.map((o) => ({
            amount: o.amount,
            address: o.address,
          })),
          "testnet",
        );
      });
    });

    it("should broadcast split TX immediately", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { pushTx } = vi.mocked(await import("@babylonlabs-io/ts-sdk"));

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(pushTx).toHaveBeenCalledWith(
          "mockSignedTxHex",
          "https://mempool.test",
        );
      });
    });

    it("should use preparePeginFromSplitOutput for both vaults", async () => {
      const { planUtxoAllocation, preparePeginFromSplitOutput } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(preparePeginFromSplitOutput).toHaveBeenCalledTimes(2);
      });
    });

    it("should save both pegins with batchId AND splitTxId", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(2);
      });

      // Both should have batchId AND splitTxId
      expect(addPendingPegin).toHaveBeenNthCalledWith(
        1,
        "0xEthAddress123",
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          splitTxId: "splitTxId" + "0".repeat(56),
          batchIndex: 1, // First vault
          batchTotal: 2, // Two vaults
        }),
      );
      expect(addPendingPegin).toHaveBeenNthCalledWith(
        2,
        "0xEthAddress123",
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          splitTxId: "splitTxId" + "0".repeat(56),
          batchIndex: 2, // Second vault
          batchTotal: 2, // Two vaults
        }),
      );
    });

    it("should use broadcastPrePeginWithLocalUtxo for broadcast", async () => {
      const { planUtxoAllocation, broadcastPrePeginWithLocalUtxo } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(broadcastPrePeginWithLocalUtxo).toHaveBeenCalledTimes(2);
      });
    });

    it("should return result with 2 pegins and SPLIT strategy", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      expect(depositResult).toEqual({
        pegins: expect.arrayContaining([
          expect.objectContaining({ vaultIndex: 0 }),
          expect.objectContaining({ vaultIndex: 1 }),
        ]),
        batchId: "mock-batch-id-uuid",
        splitTxId: "splitTxId" + "0".repeat(56),
        strategy: "SPLIT",
        warnings: undefined,
      });
    });

    it("should call setMaximumFeeRate with dynamic value based on feeRate", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { Psbt } = vi.mocked(await import("bitcoinjs-lib"));

      const mockSetMaximumFeeRate = vi.fn();
      vi.mocked(Psbt.fromHex).mockReturnValue({
        setMaximumFeeRate: mockSetMaximumFeeRate,
        extractTransaction: vi.fn(() => ({
          toHex: vi.fn(() => "mockSignedTxHex"),
        })),
      } as any);

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        // feeRate=10, multiplier=5 → maxAllowedFeeRate=50
        expect(mockSetMaximumFeeRate).toHaveBeenCalledWith(50);
      });
    });

    it("should throw when split transaction fee exceeds safety limit", async () => {
      const { planUtxoAllocation, estimateSplitTxFee } = vi.mocked(
        await import("@/services/vault"),
      );

      // Set estimated fee very low so actual fee (10,000 sats) exceeds 5x limit
      vi.mocked(estimateSplitTxFee).mockReturnValueOnce(100n);

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.error).toContain(
          "Split transaction fee 10000 sats exceeds safety limit of 500 sats",
        );
      });
    });
  });

  describe("Validation Errors", () => {
    it("should throw if wallet not connected (no btcAddress)", async () => {
      const { useBtcWalletState } = vi.mocked(
        await import("../useBtcWalletState"),
      );

      vi.mocked(useBtcWalletState).mockReturnValue({
        btcAddress: undefined,
        spendableUTXOs: undefined,
        isUTXOsLoading: false,
        utxoError: null,
      } as any);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe("BTC wallet not connected");
      });
    });

    it("should throw if no spendable UTXOs", async () => {
      const { useBtcWalletState } = vi.mocked(
        await import("../useBtcWalletState"),
      );

      vi.mocked(useBtcWalletState).mockReturnValue({
        btcAddress: "bc1qtest",
        spendableUTXOs: [],
        isUTXOsLoading: false,
        utxoError: null,
      } as any);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe("No spendable UTXOs available");
      });
    });

    it("should throw if invalid vault provider pubkey", async () => {
      const invalidParams = {
        ...MOCK_PARAMS,
        vaultProviderBtcPubkey: "short", // Not 64 hex chars
      };

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(invalidParams),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toContain("Invalid pubkey format");
      });
    });

    it("should throw if no vault amounts provided", async () => {
      const invalidParams = {
        ...MOCK_PARAMS,
        vaultAmounts: [],
      };

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(invalidParams),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe("At least one vault amount required");
      });
    });

    it("should throw if more than 2 vaults specified", async () => {
      const invalidParams = {
        ...MOCK_PARAMS,
        vaultAmounts: [100000n, 100000n, 100000n], // 3 vaults
      };

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(invalidParams),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe("Maximum 2 vaults supported");
      });
    });

    it("should throw if vault amount is zero", async () => {
      const invalidParams = {
        ...MOCK_PARAMS,
        vaultAmounts: [0n],
      };

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(invalidParams),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe("All vault amounts must be positive");
      });
    });

    it("should throw if vault amount is negative", async () => {
      const invalidParams = {
        ...MOCK_PARAMS,
        vaultAmounts: [-100000n],
      };

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(invalidParams),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe("All vault amounts must be positive");
      });
    });

    it("should throw if no vault providers specified", async () => {
      const invalidParams = {
        ...MOCK_PARAMS,
        selectedProviders: [],
      };

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(invalidParams),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe(
          "At least one vault provider required",
        );
      });
    });
  });

  describe("Partial Success", () => {
    it("should continue if vault 1 succeeds but vault 2 fails", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { preparePegin } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);
      vi.mocked(preparePegin)
        .mockResolvedValueOnce({
          btcTxid: "0xvault1TxId" as Hex,
          depositorBtcPubkey: "ab".repeat(32),
          fundedPrePeginTxHex: "vault1PrePeginHex",
          peginTxHex: "vault1PeginHex",
          peginInputSignature: "a".repeat(128),
          selectedUTXOs: [MOCK_UTXO_1],
          fee: 800n,
        })
        .mockRejectedValueOnce(new Error("Vault 2 failed"));

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      expect(depositResult).not.toBeNull();
      // Only successful pegins are included in results
      expect(depositResult!.pegins).toHaveLength(1);
    });

    it("should save only successful pegins", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { preparePegin } = vi.mocked(await import("../depositFlowSteps"));
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);
      vi.mocked(preparePegin)
        .mockResolvedValueOnce({
          btcTxid: "0xvault1TxId" as Hex,
          depositorBtcPubkey: "ab".repeat(32),
          fundedPrePeginTxHex: "vault1PrePeginHex",
          peginTxHex: "vault1PeginHex",
          peginInputSignature: "a".repeat(128),
          selectedUTXOs: [MOCK_UTXO_1],
          fee: 800n,
        })
        .mockRejectedValueOnce(new Error("Failed"));

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(1); // Only vault 1
      });
    });

    it("should log individual vault errors via logger", async () => {
      mockLoggerError.mockClear();

      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { preparePegin } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);
      vi.mocked(preparePegin)
        .mockResolvedValueOnce({
          btcTxid: "0xvault1TxId" as Hex,
          depositorBtcPubkey: "ab".repeat(32),
          fundedPrePeginTxHex: "vault1PrePeginHex",
          peginTxHex: "vault1PeginHex",
          peginInputSignature: "a".repeat(128),
          selectedUTXOs: [MOCK_UTXO_1],
          fee: 800n,
        })
        .mockRejectedValueOnce(new Error("Vault 2 failed"));

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(mockLoggerError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            data: {
              context: "[Multi-Vault] Pegin creation failed for vault 1",
            },
          }),
        );
      });
    });

    it("should show error when ALL pegin creations fail", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { preparePegin } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);
      vi.mocked(preparePegin)
        .mockRejectedValueOnce(new Error("Vault 1 failed"))
        .mockRejectedValueOnce(new Error("Vault 2 failed"));

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toContain("All pegin creations failed");
        expect(result.current.error).toContain("Vault 0: Vault 1 failed");
        expect(result.current.error).toContain("Vault 1: Vault 2 failed");
      });
    });
  });

  describe("State Management", () => {
    it("should update currentStep through flow", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      expect(result.current.currentStep).toBe(1); // SIGN_POP

      // Set up auto-resolution for artifact downloads before starting the flow
      const pollId = setInterval(() => {
        if (result.current.artifactDownloadInfo) {
          result.current.continueAfterArtifactDownload();
        }
      }, 10);

      const executePromise = result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(result.current.currentStep).toBe(7); // COMPLETED
      });

      await executePromise;
      clearInterval(pollId);
    });

    it("should set currentVaultIndex when processing each vault", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      expect(result.current.currentVaultIndex).toBeNull();

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.currentVaultIndex).toBeNull(); // Cleared after completion
      });
    });

    it("should update allocationPlan after planning", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      expect(result.current.allocationPlan).toBeNull();

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.allocationPlan).toEqual(SINGLE_PLAN);
      });
    });
  });

  describe("Split TX Failures", () => {
    it("should fail if split TX broadcast fails", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { pushTx } = vi.mocked(await import("@babylonlabs-io/ts-sdk"));

      vi.mocked(planUtxoAllocation).mockReturnValue(SPLIT_PLAN);
      vi.mocked(pushTx).mockRejectedValue(new Error("Broadcast failed"));

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toContain(
          "Failed to broadcast split transaction",
        );
      });
    });
  });

  describe("Background Operation Warnings", () => {
    it("should include warnings when payout signing fails", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { pollAndPreparePayoutSigning } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);
      vi.mocked(pollAndPreparePayoutSigning).mockRejectedValue(
        new Error("Vault provider unavailable"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      expect(depositResult).not.toBeNull();
      expect(depositResult!.warnings).toBeDefined();
      expect(depositResult!.warnings).toHaveLength(2); // Both vaults failed payout signing
      expect(depositResult!.warnings![0]).toContain(
        "Vault 0: Payout signing failed",
      );
      expect(depositResult!.warnings![1]).toContain(
        "Vault 1: Payout signing failed",
      );
    });

    it("should surface error when all BTC broadcasts fail", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);
      vi.mocked(broadcastPrePeginTransaction).mockRejectedValue(
        new Error("Network timeout"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toContain("All vault broadcasts failed");
      });
    });

    it("should not include warnings field when all operations succeed", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(SINGLE_PLAN);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      expect(depositResult).not.toBeNull();
      expect(depositResult!.warnings).toBeUndefined(); // No warnings when everything succeeds
    });

    it("should surface error when all broadcasts fail even with mixed payout results", async () => {
      const { planUtxoAllocation } = vi.mocked(
        await import("@/services/vault"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );

      vi.mocked(planUtxoAllocation).mockReturnValue(MULTI_INPUT_PLAN);
      vi.mocked(broadcastPrePeginTransaction).mockRejectedValue(
        new Error("Broadcast fail"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n, 100000n],
        }),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toContain("All vault broadcasts failed");
      });
    });
  });
});
