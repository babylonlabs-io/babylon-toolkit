/**
 * Tests for useMultiVaultDepositFlow hook
 *
 * Tests all three allocation strategies:
 * - SINGLE: One vault using standard flow
 * - MULTI_INPUT: Two vaults with existing UTXOs
 * - SPLIT: Two vaults with split transaction
 *
 * The hook receives a precomputed allocation plan and handles split TX
 * signing/broadcasting internally as step 0 (for SPLIT strategy).
 * POP signature from vault 0 is reused for vault 1.
 */

import { renderHook, waitFor } from "@testing-library/react";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AllocationPlan } from "@/services/vault";

import { useMultiVaultDepositFlow } from "../useMultiVaultDepositFlow";

// ============================================================================
// Mocks
// ============================================================================

// Mock SDK functions
vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  createSplitTransaction: vi.fn(),
  createSplitTransactionPsbt: vi.fn(),
}));

// Mock wallet connector
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: vi.fn(),
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
  broadcastPeginWithLocalUtxo: vi.fn(),
}));

vi.mock("@/services/vault/vaultPayoutSignatureService", () => ({
  signPayout: vi.fn(),
  signPayoutOptimistic: vi.fn(),
}));

// Mock storage
vi.mock("@/storage/peginStorage", () => ({
  addPendingPegin: vi.fn(),
}));

// Mock deposit flow steps
vi.mock("../depositFlowSteps", () => ({
  DepositFlowStep: {
    SIGN_SPLIT_TX: 0,
    SIGN_POP: 1,
    SUBMIT_PEGIN: 2,
    SIGN_PAYOUTS: 3,
    BROADCAST_BTC: 4,
    COMPLETED: 5,
  },
  getEthWalletClient: vi.fn(),
  submitPeginAndWait: vi.fn(),
  pollAndPreparePayoutSigning: vi.fn(),
  submitPayoutSignatures: vi.fn(),
  waitForContractVerification: vi.fn(),
  broadcastBtcTransaction: vi.fn(),
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

// Params with precomputed plans (required by the hook)
const MOCK_PARAMS = {
  vaultAmounts: [100000n],
  feeRate: 10,
  btcWalletProvider: MOCK_BTC_WALLET as any,
  depositorEthAddress: "0xEthAddress123" as Address,
  selectedApplication: "0xAppController",
  selectedProviders: ["0xProvider123"],
  vaultProviderBtcPubkey: "ab".repeat(32), // 64 hex chars
  vaultKeeperBtcPubkeys: ["keeper1pubkey"],
  universalChallengerBtcPubkeys: ["uc1pubkey"],
  precomputedPlan: SINGLE_PLAN,
};

const MULTI_VAULT_PARAMS = {
  ...MOCK_PARAMS,
  vaultAmounts: [100000n, 100000n],
  precomputedPlan: MULTI_INPUT_PLAN,
};

const SPLIT_VAULT_PARAMS = {
  ...MOCK_PARAMS,
  vaultAmounts: [100000n, 100000n],
  precomputedPlan: SPLIT_PLAN,
};

// ============================================================================
// Helper Functions
// ============================================================================

async function setupDefaultMocks() {
  const { pushTx } = vi.mocked(await import("@babylonlabs-io/ts-sdk"));
  const { createSplitTransaction, createSplitTransactionPsbt } = vi.mocked(
    await import("@babylonlabs-io/ts-sdk/tbv/core"),
  );
  const { useChainConnector } = vi.mocked(
    await import("@babylonlabs-io/wallet-connector"),
  );
  const { useProtocolParamsContext } = vi.mocked(
    await import("@/context/ProtocolParamsContext"),
  );
  const { useVaultProviders } = vi.mocked(await import("../useVaultProviders"));
  const {
    preparePeginFromSplitOutput,
    registerSplitPeginOnChain,
    broadcastPeginWithLocalUtxo,
  } = vi.mocked(await import("@/services/vault"));
  const { signPayout, signPayoutOptimistic } = vi.mocked(
    await import("@/services/vault/vaultPayoutSignatureService"),
  );
  const { addPendingPegin } = vi.mocked(await import("@/storage/peginStorage"));
  const {
    getEthWalletClient,
    submitPeginAndWait,
    pollAndPreparePayoutSigning,
    submitPayoutSignatures,
    waitForContractVerification,
    broadcastBtcTransaction,
  } = vi.mocked(await import("../depositFlowSteps"));

  // SDK split transaction mocks
  vi.mocked(pushTx).mockResolvedValue("splitBroadcastTxId");
  vi.mocked(createSplitTransaction).mockReturnValue({
    txHex: "mockSplitTxHex",
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
  vi.mocked(createSplitTransactionPsbt).mockReturnValue("mockPsbtHex");

  // Wallet connector
  vi.mocked(useChainConnector).mockReturnValue({
    connectedWallet: {
      account: { address: "bc1qtest" },
    },
  } as any);

  // Protocol params (currently unused but kept for future compatibility)
  vi.mocked(useProtocolParamsContext).mockReturnValue({} as any);

  // Vault providers
  vi.mocked(useVaultProviders).mockReturnValue({
    findProvider: vi.fn(() => ({
      id: "0xProvider123",
      url: "https://provider.test",
      btcPubKey: "providerpubkey",
    })),
    vaultKeepers: [{ btcPubKey: "keeper1pubkey" }],
  } as any);

  // Vault services
  vi.mocked(preparePeginFromSplitOutput).mockResolvedValue({
    btcTxHash: "peginTxHash" as Hex,
    fundedTxHex: "fundedTxHex",
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
  vi.mocked(broadcastPeginWithLocalUtxo).mockResolvedValue("btcTxId");

  // Payout signing
  vi.mocked(signPayout).mockResolvedValue("payoutSig");
  vi.mocked(signPayoutOptimistic).mockResolvedValue("payoutOptimisticSig");

  // Deposit flow steps
  vi.mocked(getEthWalletClient).mockResolvedValue(MOCK_ETH_WALLET as any);
  vi.mocked(submitPeginAndWait).mockResolvedValue({
    btcTxid: "standardBtcTxid",
    ethTxHash: "0xStandardEthTx" as Hex,
    depositorBtcPubkey: "ab".repeat(32),
    btcTxHex: "standardTxHex",
    selectedUTXOs: [MOCK_UTXO_1],
    fee: 800n,
    btcPopSignature: "0xMockPopSignature" as Hex,
  });
  vi.mocked(pollAndPreparePayoutSigning).mockResolvedValue({
    context: {} as any,
    vaultProviderUrl: "https://provider.test",
    preparedTransactions: [
      {
        claimerPubkeyXOnly: "claimerpubkey",
        payoutOptimisticTxHex: "payoutOptHex",
        payoutTxHex: "payoutHex",
        claimTxHex: "claimHex",
        assertTxHex: "assertHex",
      },
    ],
  });
  vi.mocked(submitPayoutSignatures).mockResolvedValue(undefined);
  vi.mocked(waitForContractVerification).mockResolvedValue(undefined);
  vi.mocked(broadcastBtcTransaction).mockResolvedValue(undefined);

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
    it("should use standard submitPeginAndWait path", async () => {
      const { submitPeginAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(submitPeginAndWait).toHaveBeenCalledTimes(1);
        expect(submitPeginAndWait).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: 100000n,
            confirmedUTXOs: [MOCK_UTXO_1],
          }),
        );
      });
    });

    it("should save pegin with batchId but no splitTxId", async () => {
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

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
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
      });

      expect(depositResult).toEqual({
        pegins: [
          expect.objectContaining({
            vaultIndex: 0,
            btcTxHash: "standardBtcTxid",
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
    it("should create 2 pegins using standard path", async () => {
      const { submitPeginAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(submitPeginAndWait).toHaveBeenCalledTimes(2);
      });
    });

    it("should pass correct UTXOs to each vault", async () => {
      const { submitPeginAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(submitPeginAndWait).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            confirmedUTXOs: [MOCK_UTXO_1],
          }),
        );
        expect(submitPeginAndWait).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            confirmedUTXOs: [MOCK_UTXO_2],
          }),
        );
      });
    });

    it("should save both pegins with same batchId, no splitTxId", async () => {
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

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
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

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
    it("should use preparePeginFromSplitOutput for both vaults", async () => {
      const { preparePeginFromSplitOutput } = vi.mocked(
        await import("@/services/vault"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(preparePeginFromSplitOutput).toHaveBeenCalledTimes(2);
      });
    });

    it("should save both pegins with batchId AND splitTxId", async () => {
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

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

    it("should use broadcastPeginWithLocalUtxo for broadcast", async () => {
      const { broadcastPeginWithLocalUtxo } = vi.mocked(
        await import("@/services/vault"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(broadcastPeginWithLocalUtxo).toHaveBeenCalledTimes(2);
      });
    });

    it("should return result with 2 pegins and SPLIT strategy", async () => {
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SPLIT_VAULT_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

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
  });

  describe("Validation Errors", () => {
    it("should throw if wallet not connected (no btcAddress)", async () => {
      const { useChainConnector } = vi.mocked(
        await import("@babylonlabs-io/wallet-connector"),
      );

      vi.mocked(useChainConnector).mockReturnValue({
        connectedWallet: null,
      } as any);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(depositResult).toBeNull();
        expect(result.current.error).toBe("BTC wallet not connected");
      });
    });
  });

  describe("Partial Success", () => {
    it("should continue if vault 1 succeeds but vault 2 fails", async () => {
      const { submitPeginAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      vi.mocked(submitPeginAndWait)
        .mockResolvedValueOnce({
          // Vault 1 succeeds
          btcTxid: "vault1TxId",
          ethTxHash: "0xVault1Eth" as Hex,
          depositorBtcPubkey: "ab".repeat(32),
          btcTxHex: "vault1Hex",
          selectedUTXOs: [MOCK_UTXO_1],
          fee: 800n,
          btcPopSignature: "0xMockPopSignature" as Hex,
        })
        .mockRejectedValueOnce(new Error("Vault 2 failed")); // Vault 2 fails

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

      expect(depositResult).not.toBeNull();
      expect(depositResult!.pegins).toHaveLength(2);
      expect(depositResult!.pegins[0].error).toBeUndefined();
      expect(depositResult!.pegins[1].error).toBe("Vault 2 failed");
    });

    it("should save only successful pegins", async () => {
      const { submitPeginAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      vi.mocked(submitPeginAndWait)
        .mockResolvedValueOnce({
          btcTxid: "vault1TxId",
          ethTxHash: "0xVault1Eth" as Hex,
          depositorBtcPubkey: "ab".repeat(32),
          btcTxHex: "vault1Hex",
          selectedUTXOs: [MOCK_UTXO_1],
          fee: 800n,
          btcPopSignature: "0xMockPopSignature" as Hex,
        })
        .mockRejectedValueOnce(new Error("Failed"));

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(1); // Only vault 1
      });
    });
  });

  describe("State Management", () => {
    it("should update currentStep through flow", async () => {
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      expect(result.current.currentStep).toBe(1); // SIGN_POP

      const executePromise = result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(result.current.currentStep).toBe(5); // COMPLETED
      });

      await executePromise;
    });

    it("should set currentVaultIndex when processing each vault", async () => {
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      expect(result.current.currentVaultIndex).toBeNull();

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(result.current.currentVaultIndex).toBeNull(); // Cleared after completion
      });
    });

    it("should set allocationPlan from precomputed plan", async () => {
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      expect(result.current.allocationPlan).toBeNull();

      await result.current.executeMultiVaultDeposit();

      await waitFor(() => {
        expect(result.current.allocationPlan).toEqual(SINGLE_PLAN);
      });
    });
  });

  describe("Background Operation Warnings", () => {
    it("should include warnings when payout signing fails", async () => {
      const { pollAndPreparePayoutSigning } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      vi.mocked(pollAndPreparePayoutSigning).mockRejectedValue(
        new Error("Vault provider unavailable"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

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

    it("should include warnings when BTC broadcast fails", async () => {
      const { broadcastBtcTransaction } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      vi.mocked(broadcastBtcTransaction).mockRejectedValue(
        new Error("Network timeout"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

      expect(depositResult).not.toBeNull();
      expect(depositResult!.warnings).toBeDefined();
      expect(depositResult!.warnings![0]).toContain(
        "Vault 0: BTC broadcast failed",
      );
    });

    it("should not include warnings field when all operations succeed", async () => {
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

      expect(depositResult).not.toBeNull();
      expect(depositResult!.warnings).toBeUndefined(); // No warnings when everything succeeds
    });

    it("should accumulate warnings from both payout and broadcast failures", async () => {
      const { pollAndPreparePayoutSigning, broadcastBtcTransaction } =
        vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(pollAndPreparePayoutSigning)
        .mockRejectedValueOnce(new Error("Payout fail vault 0"))
        .mockResolvedValueOnce({
          context: {} as any,
          vaultProviderUrl: "https://provider.test",
          preparedTransactions: [
            {
              claimerPubkeyXOnly: "claimerpubkey",
              payoutOptimisticTxHex: "payoutOptHex",
              payoutTxHex: "payoutHex",
              claimTxHex: "claimHex",
              assertTxHex: "assertHex",
            },
          ],
        });
      vi.mocked(broadcastBtcTransaction).mockRejectedValue(
        new Error("Broadcast fail"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MULTI_VAULT_PARAMS),
      );

      const depositResult = await result.current.executeMultiVaultDeposit();

      expect(depositResult).not.toBeNull();
      expect(depositResult!.warnings).toBeDefined();
      expect(depositResult!.warnings!.length).toBeGreaterThanOrEqual(2);
      // At least one payout warning and one or more broadcast warnings
    });
  });
});
