/**
 * Tests for useMultiVaultDepositFlow hook
 *
 * Tests the batch pegin flow where all vaults share a single Pre-PegIn
 * transaction with multiple HTLC outputs (one per vault).
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMultiVaultDepositFlow } from "../useMultiVaultDepositFlow";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("@/utils/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/rpc")>()),
  getVpProxyUrl: (address: string) => `https://proxy.test/rpc/${address}`,
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  ensureHexPrefix: (hex: string) => (hex.startsWith("0x") ? hex : `0x${hex}`),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: vi.fn(),
}));

vi.mock("../useBtcWalletState", () => ({
  useBtcWalletState: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-batch-id-uuid"),
}));

vi.mock("@/config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "testnet"),
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(),
}));

vi.mock("../useVaultProviders", () => ({
  useVaultProviders: vi.fn(),
}));

vi.mock("@/services/vault/vaultTransactionService", () => ({
  preparePeginTransaction: vi.fn(),
  registerPeginOnChain: vi.fn(),
}));

vi.mock("@/services/vault/vaultPayoutSignatureService", () => ({
  signPayoutTransactions: vi.fn(),
}));

vi.mock("@/services/vault/depositorGraphSigningService", () => ({
  signDepositorGraph: vi.fn().mockResolvedValue({
    payout_signatures: { payout_signature: "mock_payout_sig" },
    per_challenger: {},
  }),
}));

vi.mock("@/services/vault/vaultActivationService", () => ({
  activateVaultWithSecret: vi
    .fn()
    .mockResolvedValue({ hash: "0xActivationTxHash" }),
}));

vi.mock("@/services/vault/vaultPeginBroadcastService", () => ({
  broadcastPrePeginTransaction: vi.fn().mockResolvedValue("mockBroadcastTxId"),
}));

vi.mock("@/services/lamport/lamportService", () => ({
  deriveLamportPkHash: vi
    .fn()
    .mockResolvedValue(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    ),
}));

vi.mock("@/services/lamport", () => ({
  deriveLamportPkHash: vi
    .fn()
    .mockResolvedValue(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    ),
  linkPeginToMnemonic: vi.fn(),
}));

vi.mock("@/services/deposit/validations", () => ({
  validateMultiVaultDepositInputs: vi.fn(),
}));

vi.mock("@/models/peginStateMachine", () => ({
  LocalStorageStatus: { CONFIRMING: "CONFIRMING" },
}));

vi.mock("@/storage/peginStorage", () => ({
  addPendingPegin: vi.fn(),
}));

vi.mock("@/utils/secretUtils", () => ({
  hashSecret: vi.fn((hex: string) => `0x${hex.slice(0, 64)}` as Hex),
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

vi.mock("../depositFlowSteps", () => ({
  DepositFlowStep: {
    SIGN_POP: 1,
    SUBMIT_PEGIN: 2,
    BROADCAST_PRE_PEGIN: 3,
    SIGN_PAYOUTS: 4,
    ARTIFACT_DOWNLOAD: 5,
    ACTIVATE_VAULT: 6,
    COMPLETED: 7,
  },
  getEthWalletClient: vi.fn(),
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
  getPublicKeyHex: vi.fn().mockResolvedValue("02" + "ab".repeat(32)),
  signPsbt: vi.fn().mockResolvedValue("mockSignedPsbtHex"),
  getAddress: vi.fn().mockResolvedValue("bc1qtest"),
  getNetwork: vi.fn().mockResolvedValue("testnet"),
};

const MOCK_ETH_WALLET = {
  account: { address: "0xEthAddress123" as Address },
  chain: { id: 11155111 },
};

const MOCK_DEPOSITOR_PUBKEY = "ab".repeat(32);

const MOCK_BATCH_RESULT = {
  fundedPrePeginTxHex: "batchFundedPrePeginHex",
  unsignedPrePeginTxHex: "batchUnsignedPrePeginHex",
  depositorBtcPubkey: MOCK_DEPOSITOR_PUBKEY,
  selectedUTXOs: [MOCK_UTXO_1, MOCK_UTXO_2],
  fee: 2000n,
  perVault: [
    {
      htlcVout: 0,
      btcTxHash: "0xVault0BtcTxHash" as Hex,
      peginTxHex: "peginTxHex0",
      peginTxid: "peginTxid0",
      peginInputSignature: "a".repeat(128),
    },
    {
      htlcVout: 1,
      btcTxHash: "0xVault1BtcTxHash" as Hex,
      peginTxHex: "peginTxHex1",
      peginTxid: "peginTxid1",
      peginInputSignature: "b".repeat(128),
    },
  ],
};

const MOCK_PARAMS = {
  vaultAmounts: [100000n, 100000n],
  mempoolFeeRate: 10,
  btcWalletProvider: MOCK_BTC_WALLET as any,
  depositorEthAddress: "0xEthAddress123" as Address,
  selectedApplication: "0xAppController",
  selectedProviders: ["0xProvider123"],
  vaultProviderBtcPubkey: "ab".repeat(32),
  vaultKeeperBtcPubkeys: ["keeper1pubkey"],
  universalChallengerBtcPubkeys: ["uc1pubkey"],
  getMnemonic: async () => "test mnemonic phrase for lamport key derivation",
  htlcSecretHexes: ["ab".repeat(32), "cd".repeat(32)],
  depositorSecretHashes: [
    ("0x" + "aa".repeat(32)) as Hex,
    ("0x" + "bb".repeat(32)) as Hex,
  ],
};

// ============================================================================
// Helpers
// ============================================================================

async function executeWithAutoArtifactDownload(result: {
  current: ReturnType<typeof useMultiVaultDepositFlow>;
}) {
  const pollId = setInterval(() => {
    if (result.current.artifactDownloadInfo) {
      void act(() => {
        result.current.continueAfterArtifactDownload();
      });
    }
  }, 10);

  try {
    return await result.current.executeMultiVaultDeposit();
  } finally {
    clearInterval(pollId);
  }
}

async function setupDefaultMocks() {
  const { useBtcWalletState } = vi.mocked(await import("../useBtcWalletState"));
  const { useProtocolParamsContext } = vi.mocked(
    await import("@/context/ProtocolParamsContext"),
  );
  const { useVaultProviders } = vi.mocked(await import("../useVaultProviders"));
  const { preparePeginTransaction } = vi.mocked(
    await import("@/services/vault/vaultTransactionService"),
  );
  const { signPayoutTransactions } = vi.mocked(
    await import("@/services/vault/vaultPayoutSignatureService"),
  );
  const { broadcastPrePeginTransaction } = vi.mocked(
    await import("@/services/vault/vaultPeginBroadcastService"),
  );
  const { addPendingPegin } = vi.mocked(await import("@/storage/peginStorage"));
  const {
    getEthWalletClient,
    registerPeginAndWait,
    pollAndPreparePayoutSigning,
    submitPayoutSignatures,
    waitForContractVerification,
  } = vi.mocked(await import("../depositFlowSteps"));

  vi.mocked(useBtcWalletState).mockReturnValue({
    btcAddress: "bc1qtest",
    spendableUTXOs: [MOCK_UTXO_1, MOCK_UTXO_2],
    isUTXOsLoading: false,
    utxoError: null,
  } as any);

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
    timelockRefund: 50,
    getOffchainParamsByVersion: vi.fn(() => ({
      timelockAssert: 100n,
      securityCouncilKeys: ["0xcouncil1"],
    })),
  } as any);

  vi.mocked(useVaultProviders).mockReturnValue({
    findProvider: vi.fn(() => ({
      id: "0xProvider123",
      url: "https://provider.test",
      btcPubKey: "providerpubkey",
    })),
    vaultKeepers: [{ btcPubKey: "keeper1pubkey" }],
  } as any);

  vi.mocked(preparePeginTransaction).mockResolvedValue(
    MOCK_BATCH_RESULT as any,
  );

  vi.mocked(signPayoutTransactions).mockResolvedValue({
    mockclaimer: { payout_signature: "payoutSig" },
  });

  vi.mocked(getEthWalletClient).mockResolvedValue(MOCK_ETH_WALLET as any);
  vi.mocked(registerPeginAndWait).mockResolvedValue({
    btcTxid: "0xRegisteredVaultId" as Hex,
    ethTxHash: "0xEthTxHash" as Hex,
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

  describe("Batch Pre-PegIn Creation", () => {
    it("should call preparePeginTransaction with all vault amounts", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(preparePeginTransaction).toHaveBeenCalledTimes(1);
        expect(preparePeginTransaction).toHaveBeenCalledWith(
          MOCK_BTC_WALLET,
          MOCK_ETH_WALLET,
          expect.objectContaining({
            pegInAmounts: [100000n, 100000n],
            vaultProviderBtcPubkey: MOCK_PARAMS.vaultProviderBtcPubkey,
            vaultKeeperBtcPubkeys: MOCK_PARAMS.vaultKeeperBtcPubkeys,
            universalChallengerBtcPubkeys:
              MOCK_PARAMS.universalChallengerBtcPubkeys,
          }),
        );
      });
    });

    it("should compute hashlocks from secret hexes", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        const callArgs = preparePeginTransaction.mock.calls[0]?.[2];
        expect(callArgs?.hashlocks).toHaveLength(2);
      });
    });
  });

  describe("Per-Vault Registration", () => {
    it("should register each vault with correct htlcVout", async () => {
      const { registerPeginAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(registerPeginAndWait).toHaveBeenCalledTimes(2);

        // First vault: htlcVout = 0
        expect(registerPeginAndWait).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            htlcVout: 0,
            peginTxHex: "peginTxHex0",
            unsignedPrePeginTxHex: "batchFundedPrePeginHex",
          }),
        );

        // Second vault: htlcVout = 1
        expect(registerPeginAndWait).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            htlcVout: 1,
            peginTxHex: "peginTxHex1",
            unsignedPrePeginTxHex: "batchFundedPrePeginHex",
          }),
        );
      });
    });

    it("should reuse PoP signature from first vault for subsequent vaults", async () => {
      const { registerPeginAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // First call returns a PoP signature
      vi.mocked(registerPeginAndWait)
        .mockResolvedValueOnce({
          btcTxid: "0xVault0Id" as Hex,
          ethTxHash: "0xEthTx0" as Hex,
          btcPopSignature: "0xPopSig" as Hex,
        })
        .mockResolvedValueOnce({
          btcTxid: "0xVault1Id" as Hex,
          ethTxHash: "0xEthTx1" as Hex,
          btcPopSignature: "0xPopSig" as Hex,
        });

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        // First vault: no pre-signed PoP
        expect(registerPeginAndWait).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            preSignedBtcPopSignature: undefined,
          }),
        );

        // Second vault: reuses PoP from first
        expect(registerPeginAndWait).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            preSignedBtcPopSignature: "0xPopSig",
          }),
        );
      });
    });
  });

  describe("Storage", () => {
    it("should save each vault with batchId and correct batchIndex", async () => {
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(2);
      });

      expect(addPendingPegin).toHaveBeenNthCalledWith(
        1,
        "0xEthAddress123",
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          batchIndex: 1,
          batchTotal: 2,
        }),
      );

      expect(addPendingPegin).toHaveBeenNthCalledWith(
        2,
        "0xEthAddress123",
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          batchIndex: 2,
          batchTotal: 2,
        }),
      );
    });
  });

  describe("Broadcasting", () => {
    it("should broadcast ONE shared Pre-PegIn transaction", async () => {
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(broadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
        expect(broadcastPrePeginTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            unsignedTxHex: "batchFundedPrePeginHex",
            depositorBtcPubkey: MOCK_DEPOSITOR_PUBKEY,
          }),
        );
      });
    });

    it("should save pegins with CONFIRMING status after broadcast", async () => {
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(2);
        expect(addPendingPegin).toHaveBeenCalledWith(
          "0xEthAddress123",
          expect.objectContaining({
            status: "CONFIRMING",
          }),
        );
      });
    });
  });

  describe("Payout Signing", () => {
    it("should poll and sign payouts for each broadcast vault", async () => {
      const { pollAndPreparePayoutSigning } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(pollAndPreparePayoutSigning).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Vault Activation", () => {
    it("should activate each vault with its HTLC secret", async () => {
      const { activateVaultWithSecret } = vi.mocked(
        await import("@/services/vault/vaultActivationService"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(activateVaultWithSecret).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Result", () => {
    it("should return result with pegins for each vault", async () => {
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      expect(depositResult).toEqual(
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          pegins: expect.arrayContaining([
            expect.objectContaining({
              vaultIndex: 0,
              htlcSecretHex: "ab".repeat(32),
              fundedPrePeginTxHex: "batchFundedPrePeginHex",
            }),
            expect.objectContaining({
              vaultIndex: 1,
              htlcSecretHex: "cd".repeat(32),
              fundedPrePeginTxHex: "batchFundedPrePeginHex",
            }),
          ]),
        }),
      );
    });

    it("should set currentStep to COMPLETED on success", async () => {
      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
      });

      // DepositFlowStep.COMPLETED = 7
      expect(result.current.currentStep).toBe(7);
    });
  });

  describe("Error Handling", () => {
    it("should set error when batch pegin creation fails", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      vi.mocked(preparePeginTransaction).mockRejectedValueOnce(
        new Error("WASM error: invalid params"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.processing).toBe(false);
      });
    });

    it("should set error when broadcast fails", async () => {
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );
      vi.mocked(broadcastPrePeginTransaction).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(result.current.error).toContain(
          "Failed to broadcast batch Pre-PegIn transaction",
        );
      });
    });

    it("should continue with other vaults when payout signing fails for one", async () => {
      const { pollAndPreparePayoutSigning, submitPayoutSignatures } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // First vault fails payout signing, second succeeds
      vi.mocked(pollAndPreparePayoutSigning)
        .mockRejectedValueOnce(new Error("VP timeout"))
        .mockResolvedValueOnce({
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

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      const depositResult = await executeWithAutoArtifactDownload(result);

      // Flow should complete with warnings, not error
      expect(depositResult).not.toBeNull();
      expect(depositResult?.warnings).toHaveLength(1);
      expect(depositResult?.warnings?.[0]).toContain("Payout signing failed");

      // Second vault's payouts should still be submitted
      expect(submitPayoutSignatures).toHaveBeenCalledTimes(1);
    });

    it("should not show error when flow is aborted", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      // Make batch creation hang until abort
      vi.mocked(preparePeginTransaction).mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("aborted")), 100);
          }),
      );

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(MOCK_PARAMS),
      );

      // Start flow and immediately abort
      const promise = result.current.executeMultiVaultDeposit();
      result.current.abort();
      await promise;

      // Error should not be shown (aborted flows are silent)
      expect(result.current.error).toBeNull();
    });
  });

  describe("Single Vault", () => {
    const SINGLE_PARAMS = {
      ...MOCK_PARAMS,
      vaultAmounts: [100000n],
      htlcSecretHexes: ["ab".repeat(32)],
    };

    it("should create batch with single vault amount", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      // Return single-vault batch result
      vi.mocked(preparePeginTransaction).mockResolvedValueOnce({
        ...MOCK_BATCH_RESULT,
        perVault: [MOCK_BATCH_RESULT.perVault[0]],
      } as any);

      const { result } = renderHook(() =>
        useMultiVaultDepositFlow(SINGLE_PARAMS),
      );

      await executeWithAutoArtifactDownload(result);

      await waitFor(() => {
        expect(preparePeginTransaction).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            pegInAmounts: [100000n],
          }),
        );
      });
    });
  });
});
