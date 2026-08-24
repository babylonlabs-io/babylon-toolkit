/**
 * Tests for useDepositFlow hook
 *
 * Tests the batch pegin flow where all vaults share a single Pre-PegIn
 * transaction with multiple HTLC outputs (one per vault).
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type {
  DepositTerms,
  DepositTermsApprover,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getOptimisticDepositState,
  hasPayoutSignCancelRecord,
  resetOptimisticDepositState,
} from "@/context/deposit/optimisticDepositState";
import { COPY } from "@/copy";

import { DepositFlowStep } from "../depositFlowSteps";
import { useDepositFlow } from "../useDepositFlow";

const DEPOSIT_ERRORS = COPY.deposit.errors;

// ============================================================================
// Mocks
// ============================================================================

vi.mock("@/utils/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/rpc")>()),
  getVpProxyUrl: (address: string) => `https://proxy.test/rpc/${address}`,
}));

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: vi.fn(() => ({
    getVaultProviderGenesisBtcPubKey: vi.fn(async () => "ab".repeat(32)),
  })),
  getVaultKeeperReader: vi.fn(async () => ({})),
  getUniversalChallengerReader: vi.fn(async () => ({})),
  getOperationKeyReader: vi.fn(async () => ({})),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: vi.fn(),
}));

// The Ethereum finality gate polls the chain for ~1.6 min in production. It is
// a real await in the flow, so every test would hang without a stub; the tests
// that care about the gate itself override this per-case.
vi.mock("@/services/vault/ethConfirmationGate", () => ({
  waitForEthRegistrationDepth: vi.fn(async () => ({
    confirmations: 8,
    basicInfo: { status: 0 },
  })),
}));

// Local override of the global gate mock so we can drive a frozen/paused scope.
const depositGateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => depositGateMock.value,
}));

// Avoid threading a real QueryClientProvider through every renderHook —
// `useDepositFlow` only uses the client to invalidate the UTXO query
// after broadcast; a stub is sufficient for adapter-wiring tests.
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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

// Mock btc utils (btcAddressToScriptPubKeyHex needs valid address + bitcoinjs-lib)
vi.mock("@/utils/btc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/btc")>()),
  btcAddressToScriptPubKeyHex: vi.fn(() => "0x0014mockedscriptpubkey"),
}));

vi.mock("../useVaultProviders", () => ({
  useVaultProviders: vi.fn(),
}));

vi.mock("@/services/vault/vaultTransactionService", () => ({
  preparePeginTransaction: vi.fn(),
  registerPeginBatchOnChain: vi.fn(),
  signProofOfPossession: vi.fn(),
}));

vi.mock("@/services/vault/vaultActivationService", () => ({
  activateVaultWithSecret: vi
    .fn()
    .mockResolvedValue({ hash: "0xActivationTxHash" }),
}));

vi.mock("@/services/vault/vaultPeginBroadcastService", () => ({
  broadcastPrePeginTransaction: vi.fn().mockResolvedValue("mockBroadcastTxId"),
  utxosToExpectedRecord: vi.fn(
    (
      utxos: Array<{
        txid: string;
        vout: number;
        value: number | string;
        scriptPubKey: string;
      }>,
    ) => {
      const record: Record<string, { scriptPubKey: string; value: number }> =
        {};
      for (const u of utxos) {
        record[`${u.txid}:${u.vout}`] = {
          scriptPubKey: u.scriptPubKey,
          value: Number(u.value),
        };
      }
      return record;
    },
  ),
}));

vi.mock("@/services/deposit/validations", () => ({
  validateMultiVaultDepositInputs: vi.fn(),
}));

vi.mock("@/models/peginStateMachine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/models/peginStateMachine")>()),
  LocalStorageStatus: { PENDING: "PENDING", CONFIRMING: "CONFIRMING" },
}));

vi.mock("@/services/vault/vaultUtxoValidationService", () => ({
  assertUtxosAvailable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/storage/peginStorage", () => ({
  addPendingPegin: vi.fn(),
  removePendingPegin: vi.fn(),
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
    event: vi.fn(),
  },
}));

const { MockRegisteredVaultVersionMismatchError } = vi.hoisted(() => ({
  MockRegisteredVaultVersionMismatchError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RegisteredVaultVersionMismatchError";
    }
  },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/ts-sdk/tbv/core")>()),
  RegisteredVaultVersionMismatchError: MockRegisteredVaultVersionMismatchError,
  validateOnChainParticipantKeys: vi.fn().mockResolvedValue({
    vaultProviderBtcPubkeyXOnly: "ab".repeat(32),
    vaultKeeperBtcPubkeysSorted: ["keeper1pubkey"],
    universalChallengerBtcPubkeysSorted: ["uc1pubkey"],
    expectedAppVaultKeepersVersion: 3,
    expectedUniversalChallengersVersion: 5,
    participantKeys: {
      vaultProvider: { operationBtcPubkey: "ab".repeat(32) },
      vaultKeepers: [{ operationBtcPubkey: "keeper1pubkey" }],
      vaultKeeperOperationKeysSorted: ["keeper1pubkey"],
      universalChallengerOperationKeysSorted: ["uc1pubkey"],
    },
  }),
  verifyRegisteredVaultVersions: vi.fn().mockResolvedValue(undefined),
  verifyRegisteredParticipantKeys: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../depositFlowSteps", async () => {
  const actual = await vi.importActual<typeof import("../depositFlowSteps")>(
    "../depositFlowSteps",
  );
  return {
    ...actual,
    getEthWalletClient: vi.fn(),
    registerPeginBatchAndWait: vi.fn(),
    signAndSubmitPayouts: vi.fn(),
    signProofOfPossession: vi.fn(),
    submitWotsPublicKey: vi.fn(),
    waitForPayoutReadiness: vi.fn(),
    waitForWotsReadiness: vi.fn(),
  };
});

// ============================================================================
// Test Data
// ============================================================================

const MOCK_UTXO_1 = {
  txid: "aa".repeat(32),
  vout: 0,
  value: 500000,
  scriptPubKey: "0xabc123",
};

const MOCK_UTXO_2 = {
  txid: "bb".repeat(32),
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

// Wrapper regression: a real depositor-approval wallet (e.g. Ledger) implements
// approveDepositTerms as a class-prototype method, not an own/instance
// property — `{...wallet}` silently drops it, so the vault-app wrapper must
// forward it explicitly instead of relying on spread.
class PrototypeApprovalBtcWallet {
  getPublicKeyHex(): Promise<string> {
    return Promise.resolve("02" + "ab".repeat(32));
  }
  getAddress(): Promise<string> {
    return Promise.resolve("bc1qtest");
  }
  getNetwork(): Promise<"testnet"> {
    return Promise.resolve("testnet");
  }
  deriveContextHash(): Promise<string> {
    return Promise.resolve("cc".repeat(32));
  }
  signPsbt(): Promise<string> {
    return Promise.resolve("mockSignedPsbtHex");
  }
  // Private so a wrong-`this` forward (e.g. an unbound `wallet.approveDepositTerms`
  // reference) throws instead of silently sharing spread-copied state.
  #approvedWith: DepositTerms[] = [];
  get approvedWith(): readonly DepositTerms[] {
    return this.#approvedWith;
  }
  approveDepositTerms(terms: DepositTerms): Promise<void> {
    this.#approvedWith.push(terms);
    return Promise.resolve();
  }
  getChangeAddress(): Promise<string> {
    return Promise.resolve("tb1pledgerchange");
  }
}

const MOCK_ETH_WALLET = {
  account: { address: "0xEthAddress123" as Address },
  chain: { id: 11155111 },
};

const MOCK_DEPOSITOR_PUBKEY = "ab".repeat(32);

const MOCK_DEPOSIT_TERMS: DepositTerms = {
  vaultCoreVersion: 1,
  protocolFeeRate: 10n,
  timelockPegin: 100,
  timelockAssert: 100,
  timelockRefund: 50,
  prepeginTxid: "1".repeat(64),
  prepeginMaxFee: 2000n,
  vaultKeeperBtcPubkeys: ["aa".repeat(32)],
  universalChallengerBtcPubkeys: ["bb".repeat(32)],
  vaults: [
    {
      htlcVout: 0,
      vaultProviderBtcPubkey: "cc".repeat(32),
      peginAmount: 100000n,
      commissionFee: 2500n,
      depositorClaimValue: 20000n,
      peginMaxFee: 800n,
    },
    {
      htlcVout: 1,
      vaultProviderBtcPubkey: "cc".repeat(32),
      peginAmount: 100000n,
      commissionFee: 2500n,
      depositorClaimValue: 20000n,
      peginMaxFee: 800n,
    },
  ],
};

const MOCK_BATCH_RESULT = {
  fundedPrePeginTxHex: "batchFundedPrePeginHex",
  depositorBtcPubkey: MOCK_DEPOSITOR_PUBKEY,
  selectedUTXOs: [MOCK_UTXO_1, MOCK_UTXO_2],
  fee: 2000n,
  perVault: [
    {
      htlcVout: 0,
      peginTxHash: "0xVault0BtcTxHash" as Hex,
      peginTxHex: "peginTxHex0",
      peginTxid: "peginTxid0",
      peginInputSignature: "a".repeat(128),
    },
    {
      htlcVout: 1,
      peginTxHash: "0xVault1BtcTxHash" as Hex,
      peginTxHex: "peginTxHex1",
      peginTxid: "peginTxid1",
      peginInputSignature: "b".repeat(128),
    },
  ],
  // Per-vault derived secrets (returned by SDK orchestrator post-extraction).
  perVaultWotsKeys: [[], []],
  wotsPkHashes: [
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
    "0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678" as Hex,
  ],
  htlcSecretHexes: ["11".repeat(32), "22".repeat(32)],
  authAnchorHex: "ee".repeat(32),
  depositTerms: MOCK_DEPOSIT_TERMS,
};

const MOCK_PARAMS = {
  vaultAmounts: [100000n, 100000n],
  mempoolFeeRate: 10,
  btcWalletProvider: MOCK_BTC_WALLET as any,
  depositorEthAddress: "0xEthAddress123" as Address,
  selectedApplication: "0xAppController",
  selectedProviders: ["0xProvider123"],
  quotedCommissionBps: 250,
  vaultProviderBtcPubkey: "ab".repeat(32),
  vaultKeeperBtcPubkeys: ["keeper1pubkey"],
  universalChallengerBtcPubkeys: ["uc1pubkey"],
};

// ============================================================================
// Helpers
// ============================================================================

async function executeDepositFlow(result: {
  current: ReturnType<typeof useDepositFlow>;
}) {
  const promise = result.current.executeDeposit();
  await act(async () => {
    await promise;
  });
  return promise;
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
  const { broadcastPrePeginTransaction } = vi.mocked(
    await import("@/services/vault/vaultPeginBroadcastService"),
  );
  const { addPendingPegin } = vi.mocked(await import("@/storage/peginStorage"));
  const {
    getEthWalletClient,
    registerPeginBatchAndWait,
    signAndSubmitPayouts,
    signProofOfPossession,
    waitForPayoutReadiness,
    waitForWotsReadiness,
  } = vi.mocked(await import("../depositFlowSteps"));

  vi.mocked(useBtcWalletState).mockReturnValue({
    btcAddress: "bc1qtest",
    spendableUTXOs: [MOCK_UTXO_1, MOCK_UTXO_2],
    isUTXOsLoading: false,
    utxoError: null,
  } as any);

  vi.mocked(useProtocolParamsContext).mockReturnValue({
    config: {
      // Non-default on purpose: a literal version in useDepositFlow would
      // fail the preparePeginTransaction assertion.
      activeVaultCoreVersion: 3,
      offchainParams: {
        babeInstancesToFinalize: 2,
        councilQuorum: 1,
        securityCouncilKeys: ["0xcouncil1"],
        feeRate: 10n,
      },
      offchainParamsVersion: 7,
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

  vi.mocked(getEthWalletClient).mockResolvedValue(MOCK_ETH_WALLET as any);
  vi.mocked(signProofOfPossession).mockResolvedValue({
    btcPopSignature: "0xMockPopSignature" as Hex,
    depositorEthAddress: "0xEthAddress123" as `0x${string}`,
    depositorBtcPubkey: MOCK_DEPOSITOR_PUBKEY,
  });
  vi.mocked(registerPeginBatchAndWait).mockResolvedValue({
    ethTxHash: "0xBatchEthTxHash" as Hex,
    vaults: [
      {
        vaultId: "0xVault0Id" as Hex,
        peginTxHash: "0xVault0BtcTxHash" as Hex,
      },
      {
        vaultId: "0xVault1Id" as Hex,
        peginTxHash: "0xVault1BtcTxHash" as Hex,
      },
    ],
  });
  vi.mocked(waitForWotsReadiness).mockResolvedValue({
    readyVaultIds: new Set(["0xVault0Id", "0xVault1Id"] as Hex[]),
    terminalVaultIds: new Set<Hex>(),
  });
  vi.mocked(waitForPayoutReadiness).mockResolvedValue({
    readyVaultIds: new Set(["0xVault0Id", "0xVault1Id"] as Hex[]),
    terminalVaultIds: new Set<Hex>(),
  });
  vi.mocked(signAndSubmitPayouts).mockResolvedValue(undefined);
  vi.mocked(broadcastPrePeginTransaction).mockResolvedValue(
    "mockBroadcastTxId",
  );
  vi.mocked(addPendingPegin).mockReturnValue(undefined);
}

// ============================================================================
// Tests
// ============================================================================

describe("useDepositFlow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    depositGateMock.value = { protocol: null, aave: null };
    // The optimistic store is module-scoped, so WOTS markers recorded by one
    // flow outlive the test that wrote them.
    resetOptimisticDepositState();
    await setupDefaultMocks();
  });

  describe("Protocol pause gating", () => {
    it("aborts before any side effect when the protocol is frozen/paused", async () => {
      depositGateMock.value = { protocol: "paused", aave: null };

      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { registerPeginBatchAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      let resolved: unknown;
      await act(async () => {
        resolved = await result.current.executeDeposit();
      });

      expect(resolved).toBeNull();
      expect(result.current.error?.body).toBe(
        COPY.deposit.errors.protocolPaused,
      );
      // No BTC was sent and nothing was registered — aborted up front.
      expect(preparePeginTransaction).not.toHaveBeenCalled();
      expect(registerPeginBatchAndWait).not.toHaveBeenCalled();
      expect(broadcastPrePeginTransaction).not.toHaveBeenCalled();
    });
  });

  describe("Batch Pre-PegIn Creation", () => {
    it("should call preparePeginTransaction with all vault amounts", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(preparePeginTransaction).toHaveBeenCalledTimes(1);
        // The hook hands `preparePegin` a phase-tracking wrapper that
        // forwards to MOCK_BTC_WALLET, so match on the behavioural
        // surface rather than the exact wallet reference.
        expect(preparePeginTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            getPublicKeyHex: MOCK_BTC_WALLET.getPublicKeyHex,
            getAddress: MOCK_BTC_WALLET.getAddress,
            getNetwork: MOCK_BTC_WALLET.getNetwork,
          }),
          MOCK_ETH_WALLET,
          expect.objectContaining({
            // Active version from ProtocolParams — a re-pinned constant here
            // would keep building v1 graphs after governance flips to v2.
            vaultCoreVersion: 3,
            pegInAmounts: [100000n, 100000n],
            vaultProviderBtcPubkey: MOCK_PARAMS.vaultProviderBtcPubkey,
            vaultKeeperBtcPubkeys: MOCK_PARAMS.vaultKeeperBtcPubkeys,
            universalChallengerBtcPubkeys:
              MOCK_PARAMS.universalChallengerBtcPubkeys,
            changeAddress: "bc1qtest",
          }),
        );
      });
    });

    it("does not pass hashlocks to preparePeginTransaction (SDK derives them)", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        const callArgs = preparePeginTransaction.mock.calls[0]?.[2];
        expect(callArgs).toBeDefined();
        expect("hashlocks" in (callArgs ?? {})).toBe(false);
      });
    });
  });

  describe("Batch Registration", () => {
    it("should sign PoP before registration and forward the artifact", async () => {
      const { registerPeginBatchAndWait, signProofOfPossession } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      await executeDepositFlow(result);

      await waitFor(() => {
        expect(signProofOfPossession).toHaveBeenCalledTimes(1);
        expect(registerPeginBatchAndWait).toHaveBeenCalledTimes(1);
      });

      // PoP must be signed strictly before the register call.
      const popInvocationOrder =
        signProofOfPossession.mock.invocationCallOrder[0];
      const registerInvocationOrder =
        registerPeginBatchAndWait.mock.invocationCallOrder[0];
      expect(popInvocationOrder).toBeLessThan(registerInvocationOrder);

      // The artifact must be passed through to register unchanged.
      const callArgs = registerPeginBatchAndWait.mock.calls[0]?.[0];
      expect(callArgs?.popSignature).toEqual({
        btcPopSignature: "0xMockPopSignature",
        depositorEthAddress: "0xEthAddress123",
        depositorBtcPubkey: MOCK_DEPOSITOR_PUBKEY,
      });
    });

    it("should call registerPeginBatchAndWait once with all vaults", async () => {
      const { registerPeginBatchAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(registerPeginBatchAndWait).toHaveBeenCalledTimes(1);

        const callArgs = registerPeginBatchAndWait.mock.calls[0]?.[0];
        expect(callArgs?.vaultProviderAddress).toBe("0xProvider123");
        expect(callArgs?.unsignedPrePeginTx).toBe("batchFundedPrePeginHex");
        expect(callArgs?.requests).toHaveLength(2);
        // The commission the depositor saw is forwarded as the quote that
        // bounds maxAcceptableCommissionBps on-chain.
        expect(callArgs?.quotedCommissionBps).toBe(250);

        // First vault: htlcVout = 0
        expect(callArgs?.requests[0]).toEqual(
          expect.objectContaining({
            htlcVout: 0,
            depositorSignedPeginTx: "peginTxHex0",
          }),
        );

        // Second vault: htlcVout = 1
        expect(callArgs?.requests[1]).toEqual(
          expect.objectContaining({
            htlcVout: 1,
            depositorSignedPeginTx: "peginTxHex1",
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

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

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

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

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

    it("should save pegins with PENDING status before broadcast", async () => {
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(2);
        expect(addPendingPegin).toHaveBeenCalledWith(
          "0xEthAddress123",
          expect.objectContaining({
            status: "PENDING",
          }),
        );
      });
    });

    it("waits for Ethereum finality before broadcasting the Pre-PegIn", async () => {
      const { waitForEthRegistrationDepth } = vi.mocked(
        await import("@/services/vault/ethConfirmationGate"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(broadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
      });
      expect(waitForEthRegistrationDepth).toHaveBeenCalledWith(
        expect.objectContaining({
          vaultIds: ["0xVault0Id", "0xVault1Id"],
        }),
      );
      expect(
        waitForEthRegistrationDepth.mock.invocationCallOrder[0],
      ).toBeLessThan(broadcastPrePeginTransaction.mock.invocationCallOrder[0]);
    });

    it("persists the pending records BEFORE the finality wait so a tab close stays resumable", async () => {
      const { waitForEthRegistrationDepth } = vi.mocked(
        await import("@/services/vault/ethConfirmationGate"),
      );
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledTimes(2);
      });
      // The records carry the build-version and participant-key stamps, and
      // the resume path skips both of those checks when the stamp is absent.
      // Waiting first would open a ~1.6 min window in which closing the tab
      // silently downgrades the resume path's guard set.
      expect(addPendingPegin.mock.invocationCallOrder[0]).toBeLessThan(
        waitForEthRegistrationDepth.mock.invocationCallOrder[0],
      );
    });

    it("does not broadcast and keeps the pending records when the finality wait fails", async () => {
      const { waitForEthRegistrationDepth } = vi.mocked(
        await import("@/services/vault/ethConfirmationGate"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );
      const { addPendingPegin, removePendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );
      waitForEthRegistrationDepth.mockRejectedValueOnce(
        new Error("Peg-in registration did not reach 8 Ethereum confirmations"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });
      expect(broadcastPrePeginTransaction).not.toHaveBeenCalled();
      // The registration is on-chain and valid; the deposit is resumable, so
      // the records must survive.
      expect(addPendingPegin).toHaveBeenCalledTimes(2);
      expect(removePendingPegin).not.toHaveBeenCalled();
      expect(result.current.ethConfirmationDetail).toBeNull();
    });

    it("aborts before broadcast when on-chain offchainParamsVersion drifted from the build version", async () => {
      const { verifyRegisteredVaultVersions } = vi.mocked(
        await import("@babylonlabs-io/ts-sdk/tbv/core"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );
      const { addPendingPegin, removePendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      vi.mocked(verifyRegisteredVaultVersions).mockRejectedValueOnce(
        new MockRegisteredVaultVersionMismatchError(
          "Aborting BTC broadcast: signer-set or offchain-params versions changed during registration (vault 0xVault1: offchainParams expected v7, got v8). The Pre-PegIn was not broadcast; the registered ETH vault will time out per protocol rules.",
        ),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        // Version-mismatch errors map to the friendly "parameters changed" copy.
        expect(result.current.error?.body).toBe(
          DEPOSIT_ERRORS.versionMismatch.body,
        );
      });
      expect(broadcastPrePeginTransaction).not.toHaveBeenCalled();
      // addPendingPegin runs before the version check so the user has a
      // resume entry; the mismatch path then removes those entries.
      expect(addPendingPegin).toHaveBeenCalledTimes(2);
      expect(removePendingPegin).toHaveBeenCalledTimes(2);
    });

    it("persists pending pegins and skips broadcast when the version multicall throws (transient RPC)", async () => {
      const { verifyRegisteredVaultVersions } = vi.mocked(
        await import("@babylonlabs-io/ts-sdk/tbv/core"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      vi.mocked(verifyRegisteredVaultVersions).mockRejectedValueOnce(
        new Error("eth_call failed: connection reset"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
      // Without the pre-check addPendingPegin, the ETH-registered vault would
      // be orphaned (no localStorage record, UTXOs unreserved). With it, the
      // user has a PENDING entry and a resume path.
      expect(addPendingPegin).toHaveBeenCalledTimes(2);
      expect(broadcastPrePeginTransaction).not.toHaveBeenCalled();
      // The persisted entry must carry the three build-time versions —
      // the resume broadcast guard in `useVaultActions.handleBroadcast`
      // re-asserts them against on-chain and would refuse to broadcast
      // if they were missing.
      expect(addPendingPegin).toHaveBeenCalledWith(
        "0xEthAddress123",
        expect.objectContaining({
          buildOffchainParamsVersion: 7,
          buildAppVaultKeepersVersion: 3,
          buildUniversalChallengersVersion: 5,
        }),
      );
    });

    it("aborts before any side effects when validateOnChainParticipantKeys rejects", async () => {
      const { validateOnChainParticipantKeys } = vi.mocked(
        await import("@babylonlabs-io/ts-sdk/tbv/core"),
      );
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { registerPeginBatchAndWait, signProofOfPossession } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );

      vi.mocked(validateOnChainParticipantKeys).mockRejectedValueOnce(
        new Error("Vault keeper BTC pubkeys do not match"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        // Unrecognized errors fall through to the sanitized raw message.
        expect(result.current.error?.body).toContain(
          "Vault keeper BTC pubkeys do not match",
        );
      });
      expect(preparePeginTransaction).not.toHaveBeenCalled();
      expect(signProofOfPossession).not.toHaveBeenCalled();
      expect(registerPeginBatchAndWait).not.toHaveBeenCalled();
      expect(broadcastPrePeginTransaction).not.toHaveBeenCalled();
    });

    it("should update pegins to CONFIRMING status after broadcast", async () => {
      const { updatePendingPeginStatus } = vi.mocked(
        await import("@/storage/peginStorage"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(updatePendingPeginStatus).toHaveBeenCalledTimes(2);
        expect(updatePendingPeginStatus).toHaveBeenCalledWith(
          "0xEthAddress123",
          expect.any(String),
          "CONFIRMING",
        );
      });
    });
  });

  describe("Payout Signing", () => {
    it("should sign and submit payouts for each broadcast vault", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(signAndSubmitPayouts).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Result", () => {
    it("should return result with pegins for each vault", async () => {
      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      const depositResult = await executeDepositFlow(result);

      expect(depositResult).toEqual(
        expect.objectContaining({
          batchId: "mock-batch-id-uuid",
          pegins: expect.arrayContaining([
            expect.objectContaining({
              vaultIndex: 0,
              fundedPrePeginTxHex: "batchFundedPrePeginHex",
            }),
            expect.objectContaining({
              vaultIndex: 1,
              fundedPrePeginTxHex: "batchFundedPrePeginHex",
            }),
          ]),
        }),
      );
    });

    it("settles at AWAIT_VP_VERIFICATION with isWaiting after payout signing", async () => {
      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
      });

      expect(result.current.currentStep).toBe(
        DepositFlowStep.AWAIT_VP_VERIFICATION,
      );
      expect(result.current.isWaiting).toBe(true);
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

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.processing).toBe(false);
      });
    });

    it("should continue past payout-signing failures with warnings", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // First vault fails payout signing, second succeeds
      vi.mocked(signAndSubmitPayouts)
        .mockRejectedValueOnce(new Error("VP timeout"))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      const depositResult = await executeDepositFlow(result);

      // Flow should complete with warnings, not error
      expect(depositResult).not.toBeNull();
      expect(depositResult?.warnings).toHaveLength(1);
      expect(depositResult?.warnings?.[0]?.message).toContain(
        "Payout signing failed",
      );

      // Second vault should still attempt
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(2);
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        DepositFlowStep.AWAIT_VP_VERIFICATION,
      ]);
    });

    it("should skip payout signing for vaults whose WOTS key submission failed", async () => {
      const { submitWotsPublicKey, signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // First vault's WOTS submission fails both attempts (retry exhausted)
      vi.mocked(submitWotsPublicKey)
        .mockRejectedValueOnce(new Error("WOTS derivation error"))
        .mockRejectedValueOnce(new Error("WOTS derivation error"))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(depositResult?.warnings).toHaveLength(1);
      expect(depositResult?.warnings?.[0]?.message).toContain(
        "WOTS key submission failed",
      );

      // Payout signing should only be attempted for vault 2 (vault 1 skipped)
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(1);
      expect(signAndSubmitPayouts).toHaveBeenCalledWith(
        expect.objectContaining({ vaultId: "0xVault1Id" }),
      );
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.SUBMIT_WOTS_KEYS,
        DepositFlowStep.AWAIT_VP_VERIFICATION,
      ]);
    });

    it("records a WOTS completion marker for every vault whose submission resolved", async () => {
      // The dashboard row suppresses "Submit WOTS Key" off these markers. The
      // resume path is covered separately; this pins the first-run path, whose
      // marker is written per vault inside the retry loop.
      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      const { wotsSubmittedAt } = getOptimisticDepositState();
      expect(wotsSubmittedAt.has("0xVault0Id")).toBe(true);
      expect(wotsSubmittedAt.has("0xVault1Id")).toBe(true);
    });

    it("records no WOTS completion marker for a vault whose submission failed", async () => {
      const { submitWotsPublicKey } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // First vault fails both attempts (retry exhausted); second succeeds.
      vi.mocked(submitWotsPublicKey)
        .mockRejectedValueOnce(new Error("WOTS derivation error"))
        .mockRejectedValueOnce(new Error("WOTS derivation error"))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      // Suppressing the button for a submission that never landed would strand
      // the deposit with no way to retry.
      const { wotsSubmittedAt } = getOptimisticDepositState();
      expect(wotsSubmittedAt.has("0xVault0Id")).toBe(false);
      expect(wotsSubmittedAt.has("0xVault1Id")).toBe(true);
    });

    it("waits for shared WOTS readiness before submitting any WOTS key", async () => {
      const { submitWotsPublicKey, waitForWotsReadiness } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      await executeDepositFlow(result);

      expect(waitForWotsReadiness).toHaveBeenCalledTimes(1);
      expect(waitForWotsReadiness).toHaveBeenCalledWith(
        expect.objectContaining({
          providerAddress: "0xProvider123",
          vaults: [
            {
              vaultId: "0xVault0Id",
              peginTxHash: "0xVault0BtcTxHash",
            },
            {
              vaultId: "0xVault1Id",
              peginTxHash: "0xVault1BtcTxHash",
            },
          ],
        }),
      );
      expect(waitForWotsReadiness.mock.invocationCallOrder[0]).toBeLessThan(
        submitWotsPublicKey.mock.invocationCallOrder[0],
      );
    });

    it("skips WOTS submission for vaults not ready before the shared readiness timeout", async () => {
      const {
        submitWotsPublicKey,
        signAndSubmitPayouts,
        waitForWotsReadiness,
      } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(waitForWotsReadiness).mockResolvedValueOnce({
        readyVaultIds: new Set(["0xVault1Id"] as Hex[]),
        terminalVaultIds: new Set<Hex>(),
      });

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(result.current.lastWarnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              "Vault 1: WOTS key submission skipped - vault provider was not ready",
            ),
          }),
        ]),
      );
      expect(submitWotsPublicKey).toHaveBeenCalledTimes(1);
      expect(submitWotsPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({ vaultId: "0xVault1Id" }),
      );
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(1);
      expect(signAndSubmitPayouts).toHaveBeenCalledWith(
        expect.objectContaining({ vaultId: "0xVault1Id" }),
      );
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.AWAIT_BTC_CONFIRMATION,
        DepositFlowStep.AWAIT_VP_VERIFICATION,
      ]);
    });

    it("surfaces terminal WOTS readiness statuses distinctly and continues ready siblings", async () => {
      const {
        submitWotsPublicKey,
        signAndSubmitPayouts,
        waitForWotsReadiness,
      } = vi.mocked(await import("../depositFlowSteps"));

      vi.mocked(waitForWotsReadiness).mockResolvedValueOnce({
        readyVaultIds: new Set(["0xVault1Id"] as Hex[]),
        terminalVaultIds: new Set(["0xVault0Id"] as Hex[]),
      });

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(result.current.lastWarnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              "Vault 1: WOTS key submission skipped - vault provider reported this BTC Vault cannot continue",
            ),
          }),
        ]),
      );
      expect(submitWotsPublicKey).toHaveBeenCalledTimes(1);
      expect(submitWotsPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({ vaultId: "0xVault1Id" }),
      );
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(1);
      expect(signAndSubmitPayouts).toHaveBeenCalledWith(
        expect.objectContaining({ vaultId: "0xVault1Id" }),
      );
    });

    it("hands off without warning when payout readiness is not reached in the initial modal", async () => {
      const { signAndSubmitPayouts, waitForPayoutReadiness } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      vi.mocked(waitForPayoutReadiness).mockResolvedValueOnce({
        readyVaultIds: new Set<Hex>(),
        terminalVaultIds: new Set<Hex>(),
      });

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(signAndSubmitPayouts).not.toHaveBeenCalled();
      expect(result.current.lastWarnings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Payout signing failed"),
          }),
        ]),
      );
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
      ]);
    });

    it("continues ready siblings while not-ready payout siblings stay at payout preparation", async () => {
      const { signAndSubmitPayouts, waitForPayoutReadiness } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      vi.mocked(waitForPayoutReadiness).mockResolvedValueOnce({
        readyVaultIds: new Set(["0xVault1Id"] as Hex[]),
        terminalVaultIds: new Set<Hex>(),
      });

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(1);
      expect(signAndSubmitPayouts).toHaveBeenCalledWith(
        expect.objectContaining({ vaultId: "0xVault1Id" }),
      );
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        DepositFlowStep.AWAIT_VP_VERIFICATION,
      ]);
    });

    it("does not surface SDK payout-readiness polling timeout as payout signing failure", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      vi.mocked(signAndSubmitPayouts).mockRejectedValue(
        new Error(
          "Polling timeout after 1200000ms for pegin abcdef12… (target: PendingDepositorSignatures, PendingACKs, PendingActivation, ActivatedPendingBroadcast, Activated)",
        ),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(2);
      expect(result.current.lastWarnings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Payout signing failed"),
          }),
        ]),
      );
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
      ]);
    });

    it("should retry WOTS submission once before skipping vault", async () => {
      const { submitWotsPublicKey, signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // First vault: fails once, succeeds on retry
      // Second vault: succeeds first try
      vi.mocked(submitWotsPublicKey)
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce(undefined) // vault 1 retry succeeds
        .mockResolvedValueOnce(undefined); // vault 2 succeeds

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      const depositResult = await executeDepositFlow(result);

      // No warnings — both vaults recovered
      expect(depositResult).not.toBeNull();
      expect(depositResult?.warnings).toBeUndefined();

      // Both vaults should proceed to payout signing
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(2);
    });

    it("should complete with warnings when all payout signings fail", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // Both vaults fail payout signing
      vi.mocked(signAndSubmitPayouts)
        .mockRejectedValueOnce(new Error("VP timeout"))
        .mockRejectedValueOnce(new Error("VP timeout"));

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(depositResult?.warnings).toHaveLength(2);
    });

    it("resets a failed vault's per-vault step to the payout wait before continuing", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      // Vault 0 fails mid-graph-signing; vault 1 succeeds.
      vi.mocked(signAndSubmitPayouts)
        .mockImplementationOnce(async ({ onProgress }) => {
          onProgress?.({ phase: "graph", completed: 0, total: 1 });
          throw new Error("VP timeout");
        })
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      const depositResult = await executeDepositFlow(result);

      // The failed vault must not be left rendering a mid-signing step next
      // to its failure warning (post-loop invariant: unsigned vaults rest at
      // AWAIT_PAYOUT_TRANSACTIONS).
      expect(depositResult).not.toBeNull();
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        DepositFlowStep.AWAIT_VP_VERIFICATION,
      ]);
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

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      // Start flow and immediately abort
      const promise = result.current.executeDeposit();
      result.current.abort();
      await promise;

      // Error should not be shown (aborted flows are silent)
      expect(result.current.error).toBeNull();
    });

    it("tags the failure capture with the step the flow was on when it threw", async () => {
      const { registerPeginBatchAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      // The flow enters SUBMIT_PEGIN immediately before this call, several
      // steps past the initial DERIVE_VAULT_SECRET.
      vi.mocked(registerPeginBatchAndWait).mockRejectedValueOnce(
        new Error("ETH registration reverted"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { depositStep: "SUBMIT_PEGIN" },
        }),
      );
    });
  });

  describe("Single Vault", () => {
    const SINGLE_PARAMS = {
      ...MOCK_PARAMS,
      vaultAmounts: [100000n],
    };

    it("should create batch with single vault amount", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { registerPeginBatchAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // Return single-vault batch result
      vi.mocked(preparePeginTransaction).mockResolvedValueOnce({
        ...MOCK_BATCH_RESULT,
        perVault: [MOCK_BATCH_RESULT.perVault[0]],
      } as any);

      // Single-vault batch registration
      vi.mocked(registerPeginBatchAndWait).mockResolvedValueOnce({
        ethTxHash: "0xSingleBatchEthTx" as Hex,
        vaults: [
          {
            vaultId: "0xSingleVaultId" as Hex,
            peginTxHash: "0xVault0BtcTxHash" as Hex,
          },
        ],
      });

      const { result } = renderHook(() => useDepositFlow(SINGLE_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(preparePeginTransaction).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            pegInAmounts: [100000n],
          }),
        );

        // Single vault should still use batch call with 1 request
        expect(registerPeginBatchAndWait).toHaveBeenCalledTimes(1);
        const callArgs = registerPeginBatchAndWait.mock.calls[0]?.[0];
        expect(callArgs?.requests).toHaveLength(1);
      });
    });
  });

  describe("Pubkey Consistency (Issue #3)", () => {
    it("rejects when PoP pubkey differs from preparePegin pubkey", async () => {
      const { signProofOfPossession } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const { registerPeginBatchAndWait } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      // PoP returns a different pubkey than preparePeginTransaction
      vi.mocked(signProofOfPossession).mockResolvedValueOnce({
        btcPopSignature: "0xMockPopSignature" as Hex,
        depositorEthAddress: "0xEthAddress123" as `0x${string}`,
        depositorBtcPubkey: "ff".repeat(32), // different from MOCK_DEPOSITOR_PUBKEY
      });

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.error?.body).toBe(
          DEPOSIT_ERRORS.walletAccountChanged.body,
        );
      });

      // Registration must never be attempted with mismatched keys
      expect(registerPeginBatchAndWait).not.toHaveBeenCalled();
    });
  });

  describe("Peg-in signing progress", () => {
    it("uses the wallet's native batch signPsbts so the peg-in txs sign in one popup", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const nativeSignPsbt = vi.fn().mockResolvedValue("signedPsbt");
      const nativeSignPsbts = vi
        .fn()
        .mockResolvedValue(["signedPsbt0", "signedPsbt1"]);
      const batchWallet = {
        ...MOCK_BTC_WALLET,
        signPsbt: nativeSignPsbt,
        signPsbts: nativeSignPsbts,
      };
      // The SDK signs the peg-in PSBTs by calling the wallet wrapper's
      // signPsbts once; the wrapper delegates to the native batch call.
      vi.mocked(preparePeginTransaction).mockImplementation(async (wallet) => {
        await wallet.signPsbts(["psbt0", "psbt1"], [{}, {}]);
        return MOCK_BATCH_RESULT as any;
      });

      const { result } = renderHook(() =>
        useDepositFlow({
          ...MOCK_PARAMS,
          btcWalletProvider: batchWallet as any,
        }),
      );
      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.peginSigningProgress).toEqual({
          completed: 2,
          total: 2,
        });
      });
      // One native batch call signs every peg-in tx; the per-tx signer is unused.
      expect(nativeSignPsbts).toHaveBeenCalledTimes(1);
      expect(nativeSignPsbts).toHaveBeenCalledWith(
        ["psbt0", "psbt1"],
        [{}, {}],
      );
      expect(nativeSignPsbt).not.toHaveBeenCalled();
    });

    it("falls back to sequential signPsbt for wallets without native batch signing, ticking the counter per tx", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      // MOCK_BTC_WALLET has no signPsbts, so the SDK's signPsbtsWithFallback
      // signs each PSBT via the wrapper's signPsbt; the counter ticks per tx.
      vi.mocked(preparePeginTransaction).mockImplementation(async (wallet) => {
        await wallet.signPsbt("psbt0", {});
        await wallet.signPsbt("psbt1", {});
        return MOCK_BATCH_RESULT as any;
      });

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.peginSigningProgress).toEqual({
          completed: 2,
          total: 2,
        });
      });
      expect(MOCK_BTC_WALLET.signPsbt).toHaveBeenCalledTimes(2);
    });
  });

  describe("Device-sign cancellation", () => {
    // Only signPsbt/signPsbts/signMessage go through the Ledger provider's
    // abortable loop, so the cancel affordance must track exactly those
    // windows — never derive/approve ceremonies or non-wallet waits.

    /** Wallet whose signPsbt stays pending until the test settles it. */
    function pendingSignWallet(withCancel: boolean) {
      const settle: {
        resolve: (v: string) => void;
        reject: (e: unknown) => void;
      } = { resolve: () => {}, reject: () => {} };
      const signPsbt = vi.fn(
        () =>
          new Promise<string>((resolve, reject) => {
            settle.resolve = resolve;
            settle.reject = reject;
          }),
      );
      const cancelSigning = vi.fn();
      const wallet = {
        ...MOCK_BTC_WALLET,
        signPsbt,
        ...(withCancel ? { cancelSigning } : {}),
      };
      return { wallet, settle, cancelSigning };
    }

    /** What the Ledger provider rejects with when a requested cancel settles. */
    function signingCanceledError() {
      return Object.assign(
        new Error(
          "Signing canceled after 0 of 1 PSBT(s) — the ceremony restarts from the device approval screens on retry.",
        ),
        { code: "CONNECTION_REJECTED" },
      );
    }

    it("exposes canCancelDeviceSign only while a pre-pegin signPsbt is in flight on a provider with cancelSigning", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { wallet, settle } = pendingSignWallet(true);
      vi.mocked(preparePeginTransaction).mockImplementation(async (w) => {
        await w.signPsbt("psbt0", {});
        return MOCK_BATCH_RESULT as any;
      });

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );
      expect(result.current.canCancelDeviceSign).toBe(false);

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      await act(async () => {
        settle.resolve("mockSignedPsbtHex");
        await flowPromise;
      });
      expect(result.current.canCancelDeviceSign).toBe(false);
    });

    it("keeps canCancelDeviceSign false for providers without cancelSigning", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { wallet, settle } = pendingSignWallet(false);
      vi.mocked(preparePeginTransaction).mockImplementation(async (w) => {
        await w.signPsbt("psbt0", {});
        return MOCK_BATCH_RESULT as any;
      });

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() => expect(wallet.signPsbt).toHaveBeenCalled());

      expect(result.current.canCancelDeviceSign).toBe(false);

      await act(async () => {
        settle.resolve("mockSignedPsbtHex");
        await flowPromise;
      });
    });

    it("cancels the provider that started the sign, not a wallet swapped in mid-prompt", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { wallet, settle, cancelSigning } = pendingSignWallet(true);
      vi.mocked(preparePeginTransaction).mockImplementation(async (w) => {
        await w.signPsbt("psbt0", {});
        return MOCK_BATCH_RESULT as any;
      });

      const { result, rerender } = renderHook(
        (props: { btcWalletProvider: unknown }) =>
          useDepositFlow({
            ...MOCK_PARAMS,
            btcWalletProvider: props.btcWalletProvider as any,
          }),
        { initialProps: { btcWalletProvider: wallet as unknown } },
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      // Swap the connected wallet while the device prompt is still open.
      const replacementCancelSigning = vi.fn();
      rerender({
        btcWalletProvider: {
          ...MOCK_BTC_WALLET,
          cancelSigning: replacementCancelSigning,
        },
      });

      // The affordance tracks the running ceremony, not the live prop.
      expect(result.current.canCancelDeviceSign).toBe(true);

      act(() => {
        result.current.cancelDeviceSign();
      });
      expect(cancelSigning).toHaveBeenCalledTimes(1);
      expect(replacementCancelSigning).not.toHaveBeenCalled();

      await act(async () => {
        settle.reject(signingCanceledError());
        await flowPromise;
      });
    });

    // Shared setup for the cancel-request tests below: start a flow with a
    // held-open signPsbt, request the device cancel, hand back a settle helper.
    async function startSignAndRequestCancel() {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { wallet, settle, cancelSigning } = pendingSignWallet(true);
      vi.mocked(preparePeginTransaction).mockImplementation(async (w) => {
        await w.signPsbt("psbt0", {});
        return MOCK_BATCH_RESULT as any;
      });

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      act(() => {
        result.current.cancelDeviceSign();
      });

      const settleAsCancelRejection = async () => {
        let resolved: unknown;
        await act(async () => {
          settle.reject(signingCanceledError());
          resolved = await flowPromise;
        });
        return resolved;
      };
      return { result, cancelSigning, settleAsCancelRejection };
    }

    it("cancelDeviceSign forwards to the provider's cancelSigning once", async () => {
      const { cancelSigning, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      expect(cancelSigning).toHaveBeenCalledTimes(1);

      await settleAsCancelRejection();
    });

    it("surfaces a settled self-cancel as the signing-cancelled copy, not the wallet-rejection copy", async () => {
      const { result, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      // The flow controller was NOT aborted: the rejection reaches the normal
      // error path (an aborted flow would have swallowed it silently). The
      // user clicked OUR cancel, so the "You rejected the request in your
      // wallet. Click Retry" copy would misattribute it — and this surface
      // renders no Retry button at all.
      const resolved = await settleAsCancelRejection();
      expect(resolved).toBeNull();
      expect(result.current.error).toEqual(DEPOSIT_ERRORS.signingCanceled);
    });

    it("sets deviceCancelRequested on request and clears it when the cancelled sign settles", async () => {
      const { result, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      expect(result.current.deviceCancelRequested).toBe(true);

      await settleAsCancelRejection();
      expect(result.current.deviceCancelRequested).toBe(false);
    });

    it("clears deviceCancelRequested when the sign settles successfully after a late cancel", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { wallet, settle } = pendingSignWallet(true);
      vi.mocked(preparePeginTransaction).mockImplementation(async (w) => {
        await w.signPsbt("psbt0", {});
        return MOCK_BATCH_RESULT as any;
      });

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      act(() => {
        result.current.cancelDeviceSign();
      });

      let resolved: unknown;
      await act(async () => {
        settle.resolve("mockSignedPsbtHex");
        resolved = await flowPromise;
      });

      expect(resolved).not.toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.deviceCancelRequested).toBe(false);
    });

    it("covers the batch signPsbts window", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const settle: { resolve: (v: string[]) => void } = { resolve: () => {} };
      const signPsbts = vi.fn(
        () =>
          new Promise<string[]>((resolve) => {
            settle.resolve = resolve;
          }),
      );
      const wallet = {
        ...MOCK_BTC_WALLET,
        signPsbts,
        cancelSigning: vi.fn(),
      };
      vi.mocked(preparePeginTransaction).mockImplementation(async (w) => {
        await w.signPsbts!(["psbt0", "psbt1"], [{}, {}]);
        return MOCK_BATCH_RESULT as any;
      });

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      await act(async () => {
        settle.resolve(["signed0", "signed1"]);
        await flowPromise;
      });
      expect(result.current.canCancelDeviceSign).toBe(false);
    });

    it("covers the proof-of-possession window", async () => {
      const { signProofOfPossession } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const settle: { resolve: (v: unknown) => void } = { resolve: () => {} };
      vi.mocked(signProofOfPossession).mockImplementation(
        () =>
          new Promise((resolve) => {
            settle.resolve = resolve as (v: unknown) => void;
          }) as any,
      );
      const wallet = { ...MOCK_BTC_WALLET, cancelSigning: vi.fn() };

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      await act(async () => {
        settle.resolve({
          btcPopSignature: "0xMockPopSignature",
          depositorEthAddress: "0xEthAddress123",
          depositorBtcPubkey: MOCK_DEPOSITOR_PUBKEY,
        });
        await flowPromise;
      });
      expect(result.current.canCancelDeviceSign).toBe(false);
    });

    it("covers the Pre-PegIn broadcast signature window", async () => {
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );
      const { wallet, settle } = pendingSignWallet(true);
      vi.mocked(broadcastPrePeginTransaction).mockImplementation(
        async ({ btcWalletProvider }) => {
          await btcWalletProvider.signPsbt("fundedPrePegin");
          return "mockBroadcastTxId";
        },
      );

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      await act(async () => {
        settle.resolve("signedFundedPrePegin");
        await flowPromise;
      });
      expect(result.current.canCancelDeviceSign).toBe(false);
    });

    it("withholds the Pre-PegIn broadcast when a late cancel settles after its signature completes", async () => {
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );
      const { updatePendingPeginStatus } = vi.mocked(
        await import("@/storage/peginStorage"),
      );
      const { wallet, settle } = pendingSignWallet(true);
      vi.mocked(broadcastPrePeginTransaction).mockImplementation(
        async ({ btcWalletProvider }) => {
          // Mirrors the real service: the sign must succeed before pushTx.
          await btcWalletProvider.signPsbt("fundedPrePegin");
          return "mockBroadcastTxId";
        },
      );

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      act(() => {
        result.current.cancelDeviceSign();
      });

      let resolved: unknown;
      await act(async () => {
        settle.resolve("signedFundedPrePegin"); // sign completes AFTER the cancel
        resolved = await flowPromise;
      });

      // Elsewhere a late cancel + successful sign deliberately proceeds; at
      // the broadcast site the next step is the irreversible pushTx, so the
      // signed tx is withheld: cancelled copy, records stay PENDING so the
      // resume flow's Broadcast button recovers the deposit.
      expect(resolved).toBeNull();
      expect(result.current.error).toEqual(
        DEPOSIT_ERRORS.signingCanceledAfterRegistration,
      );
      expect(updatePendingPeginStatus).not.toHaveBeenCalled();
    });

    it("shows the after-registration cancel copy when a broadcast-window cancel settles", async () => {
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );
      const { wallet, settle } = pendingSignWallet(true);
      vi.mocked(broadcastPrePeginTransaction).mockImplementation(
        async ({ btcWalletProvider }) => {
          await btcWalletProvider.signPsbt("fundedPrePegin");
          return "mockBroadcastTxId";
        },
      );

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );
      act(() => {
        result.current.cancelDeviceSign();
      });

      await act(async () => {
        settle.reject(signingCanceledError());
        await flowPromise;
      });

      // The vaults are already registered on Ethereum with PENDING resume
      // rows — "the deposit did not continue" would hide the resume path.
      expect(result.current.error).toEqual(
        DEPOSIT_ERRORS.signingCanceledAfterRegistration,
      );
    });

    it("covers the post-broadcast depositor-graph window", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      // Only the FIRST graph sign is held open — the flow runs one payout
      // round per vault, and a still-pending second round would hang the test.
      const settle: { resolve: (v: string) => void } = { resolve: () => {} };
      const signPsbt = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<string>((resolve) => {
              settle.resolve = resolve;
            }),
        )
        .mockResolvedValue("mockSignedPsbtHex");
      const wallet = { ...MOCK_BTC_WALLET, signPsbt, cancelSigning: vi.fn() };
      vi.mocked(signAndSubmitPayouts).mockImplementation(
        async ({ btcWallet }) => {
          await btcWallet.signPsbt("graphPsbt");
        },
      );

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      await act(async () => {
        settle.resolve("signedGraphPsbt");
        await flowPromise;
      });
      expect(result.current.canCancelDeviceSign).toBe(false);
    });

    // Shared setup for the multi-vault payout-cancel tests below: hold vault
    // 0's graph sign open, request the device cancel, hand back a settle helper.
    async function startPayoutSignAndRequestCancel() {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const settle: { reject: (e: unknown) => void } = { reject: () => {} };
      const signPsbt = vi
        .fn()
        // Vault 0's graph sign is held open for the cancel; a (buggy) second
        // vault ceremony would resolve immediately and expose itself in the
        // loop-stop test.
        .mockImplementationOnce(
          () =>
            new Promise<string>((_resolve, reject) => {
              settle.reject = reject;
            }),
        )
        .mockResolvedValue("mockSignedPsbtHex");
      const wallet = { ...MOCK_BTC_WALLET, signPsbt, cancelSigning: vi.fn() };
      vi.mocked(signAndSubmitPayouts).mockImplementation(
        async ({ btcWallet }) => {
          await btcWallet.signPsbt("graphPsbt");
        },
      );

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      act(() => {
        result.current.cancelDeviceSign();
      });

      const settleAsCancelRejection = async () => {
        let resolved: unknown;
        await act(async () => {
          settle.reject(signingCanceledError());
          resolved = await flowPromise;
        });
        return resolved;
      };
      return { result, signAndSubmitPayouts, settleAsCancelRejection };
    }

    it("stops the payout loop when a requested cancel settles — the next vault gets no ceremony", async () => {
      const { signAndSubmitPayouts, settleAsCancelRejection } =
        await startPayoutSignAndRequestCancel();

      await settleAsCancelRejection();

      // The cancel stops the loop: vault 1's ceremony must never start —
      // before the fix it re-ran the full device ceremony seconds after
      // the user asked to stop.
      expect(signAndSubmitPayouts).toHaveBeenCalledTimes(1);
    });

    it("resolves the flow with a deposit result when a mid-loop payout cancel settles", async () => {
      const { settleAsCancelRejection } =
        await startPayoutSignAndRequestCancel();

      const resolved = await settleAsCancelRejection();
      expect(resolved).not.toBeNull();
    });

    it("sets no flow error when a mid-loop payout cancel settles", async () => {
      const { result, settleAsCancelRejection } =
        await startPayoutSignAndRequestCancel();

      await settleAsCancelRejection();
      expect(result.current.error).toBeNull();
    });

    it("records the payout-sign cancel marker for the cancelled vault only", async () => {
      const { settleAsCancelRejection } =
        await startPayoutSignAndRequestCancel();

      await settleAsCancelRejection();

      // ResumeSignContent reads this to withhold its auto-run — without it
      // the continuation view re-prompts the device moments after the cancel.
      expect(hasPayoutSignCancelRecord("0xVault0Id")).toBe(true);
      // Vault 1 was left unattempted, not cancelled.
      expect(hasPayoutSignCancelRecord("0xVault1Id")).toBe(false);
    });

    it("resets the cancelled vault's per-vault step to the payout wait when the cancel settles", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const settle: { reject: (e: unknown) => void } = { reject: () => {} };
      const signPsbt = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<string>((_resolve, reject) => {
              settle.reject = reject;
            }),
        )
        .mockResolvedValue("mockSignedPsbtHex");
      const wallet = { ...MOCK_BTC_WALLET, signPsbt, cancelSigning: vi.fn() };
      vi.mocked(signAndSubmitPayouts).mockImplementation(
        async ({ btcWallet, onProgress }) => {
          // Advance the vault's step off the wait, as the real flow does
          // once graph signing starts.
          onProgress?.({ phase: "graph", completed: 0, total: 1 });
          await btcWallet.signPsbt("graphPsbt");
        },
      );

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, btcWalletProvider: wallet as any }),
      );
      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );
      act(() => {
        result.current.cancelDeviceSign();
      });

      await act(async () => {
        settle.reject(signingCanceledError());
        await flowPromise;
      });

      // The cancelled vault must not be left rendering a mid-signing step
      // next to the cancelled warning (post-loop invariant: unsigned vaults
      // rest at AWAIT_PAYOUT_TRANSACTIONS).
      expect(result.current.perVaultSteps).toEqual([
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
      ]);
    });

    it("warns only for the cancelled vault — the unattempted vault gets no warning", async () => {
      const { result, settleAsCancelRejection } =
        await startPayoutSignAndRequestCancel();

      await settleAsCancelRejection();

      // Cancelled outcome, not a plain success: vault 0 carries the
      // cancelled warning; vault 1 is unattempted, not failed (no warning).
      expect(result.current.lastWarnings).toEqual([
        {
          vaultId: "0xVault0Id",
          stage: "payout",
          terminal: false,
          message: COPY.deposit.warnings.payoutSigningCanceled(1),
        },
      ]);
    });

    // Same shape for a single-vault deposit: the whole batch is trimmed to
    // one vault, its graph sign held open, and the device cancel requested.
    async function startSingleVaultPayoutSignAndRequestCancel() {
      const {
        signAndSubmitPayouts,
        registerPeginBatchAndWait,
        waitForWotsReadiness,
        waitForPayoutReadiness,
      } = vi.mocked(await import("../depositFlowSteps"));
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      vi.mocked(preparePeginTransaction).mockResolvedValueOnce({
        ...MOCK_BATCH_RESULT,
        perVault: [MOCK_BATCH_RESULT.perVault[0]],
      } as any);
      vi.mocked(registerPeginBatchAndWait).mockResolvedValueOnce({
        ethTxHash: "0xSingleBatchEthTx" as Hex,
        vaults: [
          {
            vaultId: "0xSingleVaultId" as Hex,
            peginTxHash: "0xVault0BtcTxHash" as Hex,
          },
        ],
      });
      vi.mocked(waitForWotsReadiness).mockResolvedValueOnce({
        readyVaultIds: new Set(["0xSingleVaultId"] as Hex[]),
        terminalVaultIds: new Set<Hex>(),
      });
      vi.mocked(waitForPayoutReadiness).mockResolvedValueOnce({
        readyVaultIds: new Set(["0xSingleVaultId"] as Hex[]),
        terminalVaultIds: new Set<Hex>(),
      });

      const settle: { reject: (e: unknown) => void } = { reject: () => {} };
      const signPsbt = vi.fn(
        () =>
          new Promise<string>((_resolve, reject) => {
            settle.reject = reject;
          }),
      );
      const wallet = { ...MOCK_BTC_WALLET, signPsbt, cancelSigning: vi.fn() };
      vi.mocked(signAndSubmitPayouts).mockImplementation(
        async ({ btcWallet }) => {
          await btcWallet.signPsbt("graphPsbt");
        },
      );

      const { result } = renderHook(() =>
        useDepositFlow({
          ...MOCK_PARAMS,
          vaultAmounts: [100000n],
          btcWalletProvider: wallet as any,
        }),
      );

      let flowPromise!: Promise<unknown>;
      act(() => {
        flowPromise = result.current.executeDeposit();
      });
      await waitFor(() =>
        expect(result.current.canCancelDeviceSign).toBe(true),
      );

      act(() => {
        result.current.cancelDeviceSign();
      });

      const settleAsCancelRejection = async () => {
        let resolved: unknown;
        await act(async () => {
          settle.reject(signingCanceledError());
          resolved = await flowPromise;
        });
        return resolved;
      };
      return { result, settleAsCancelRejection };
    }

    it("resolves the flow with a deposit result when a single-vault payout cancel settles", async () => {
      const { settleAsCancelRejection } =
        await startSingleVaultPayoutSignAndRequestCancel();

      const resolved = await settleAsCancelRejection();
      expect(resolved).not.toBeNull();
    });

    it("sets no flow error when a single-vault payout cancel settles", async () => {
      const { result, settleAsCancelRejection } =
        await startSingleVaultPayoutSignAndRequestCancel();

      await settleAsCancelRejection();
      expect(result.current.error).toBeNull();
    });

    it("surfaces a single-vault payout cancel as the cancelled warning, not a signing failure", async () => {
      const { result, settleAsCancelRejection } =
        await startSingleVaultPayoutSignAndRequestCancel();

      await settleAsCancelRejection();

      // Cancelled, not "Payout signing failed - <wallet error>".
      expect(result.current.lastWarnings).toEqual([
        {
          vaultId: "0xSingleVaultId",
          stage: "payout",
          terminal: false,
          message: COPY.deposit.warnings.payoutSigningCanceled(1),
        },
      ]);
    });
  });

  describe("Soft warnings", () => {
    it("populates lastWarnings when addPendingPegin throws on persist failure", async () => {
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );
      // Simulate a localStorage write failure (quota / private browsing)
      // for every per-vault persist attempt. The flow must continue (the
      // vault is registered on-chain) and surface a soft warning.
      vi.mocked(addPendingPegin)
        .mockImplementationOnce(() => {
          throw new Error("Unable to save the deposit record locally.");
        })
        .mockImplementationOnce(() => {
          throw new Error("Unable to save the deposit record locally.");
        });

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      const depositResult = await executeDepositFlow(result);

      expect(depositResult).not.toBeNull();
      expect(result.current.error).toBeFalsy();
      expect(
        result.current.lastWarnings.some((w) =>
          w.message.includes("couldn't save a local copy"),
        ),
      ).toBe(true);
    });

    it("passes the full wallet UTXOs to preparePeginTransaction (no pre-filtering)", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      await executeDepositFlow(result);

      expect(preparePeginTransaction).toHaveBeenCalledTimes(1);
      const peginCall = vi.mocked(preparePeginTransaction).mock.calls[0];
      const params = peginCall[2] as { availableUTXOs: unknown[] };
      // Test harness sets spendableUTXOs to both mocks; no pre-filtering.
      expect(params.availableUTXOs).toEqual([MOCK_UTXO_1, MOCK_UTXO_2]);
    });

    it("preserves a buffered warning when a later step throws", async () => {
      // Regression: `depositRecordNotSaved` is pushed during the flow (per
      // vault) but the success snapshot of `lastWarnings` happens only on
      // the return path. If broadcast throws AFTER the addPendingPegin
      // warning is pushed, the catch must also snapshot the warning so
      // the user sees both the error AND the localStorage issue.
      const { addPendingPegin } = vi.mocked(
        await import("@/storage/peginStorage"),
      );
      const { broadcastPrePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultPeginBroadcastService"),
      );

      vi.mocked(addPendingPegin)
        .mockImplementationOnce(() => {
          throw new Error("Unable to save the deposit record locally.");
        })
        .mockImplementationOnce(() => {
          throw new Error("Unable to save the deposit record locally.");
        });
      vi.mocked(broadcastPrePeginTransaction).mockRejectedValueOnce(
        new Error("Bitcoin RPC unreachable"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      await executeDepositFlow(result);

      await waitFor(() => {
        // Broadcast failures map to the friendly broadcast callout.
        expect(result.current.error?.body).toBe(
          DEPOSIT_ERRORS.broadcastFailed.body,
        );
      });
      // The depositRecordNotSaved warning collected BEFORE the broadcast
      // error must still be visible.
      expect(
        result.current.lastWarnings.some((w) =>
          w.message.includes("couldn't save a local copy"),
        ),
      ).toBe(true);
    });

    it("surfaces preparePeginTransaction's error when funds are insufficient", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      vi.mocked(preparePeginTransaction).mockRejectedValueOnce(
        new Error("Insufficient funds: need 1000000 sats, have 1000 sats"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));
      await executeDepositFlow(result);

      await waitFor(() => {
        // A BTC sat shortfall isn't a known bucket, so the raw message is
        // preserved in the callout body.
        expect(result.current.error?.body).toContain("Insufficient funds");
        expect(result.current.processing).toBe(false);
      });
    });

    it("refuses to submit and never prepares the pegin when the commission is unavailable", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );

      const { result } = renderHook(() =>
        useDepositFlow({ ...MOCK_PARAMS, quotedCommissionBps: undefined }),
      );
      await executeDepositFlow(result);

      await waitFor(() => {
        expect(result.current.error?.title).toBe("Commission unavailable");
        expect(result.current.processing).toBe(false);
      });
      // The guard fires before any BTC is committed.
      expect(preparePeginTransaction).not.toHaveBeenCalled();
    });
  });

  describe("Deposit-terms threading", () => {
    it("forwards the SDK-built depositTerms into payout signing", async () => {
      const { signAndSubmitPayouts } = vi.mocked(
        await import("../depositFlowSteps"),
      );

      const { result } = renderHook(() => useDepositFlow(MOCK_PARAMS));

      await executeDepositFlow(result);

      // Per-call, not any-call: the production site is a per-vault loop, so a
      // regression that forwards terms on only a subset of vaults must fail.
      const calls = vi.mocked(signAndSubmitPayouts).mock.calls;
      expect(calls).toHaveLength(2);
      for (const [params] of calls) {
        expect(params.depositTerms).toBe(MOCK_DEPOSIT_TERMS);
      }
    });
  });

  describe("Deposit-terms approval capability forwarding through wallet wrappers", () => {
    it("forwards a prototype-method approveDepositTerms through both wallet wrapper sites", async () => {
      const { preparePeginTransaction } = vi.mocked(
        await import("@/services/vault/vaultTransactionService"),
      );
      const { submitWotsPublicKey } = vi.mocked(
        await import("../depositFlowSteps"),
      );
      const { supportsDepositApproval } = await import(
        "@babylonlabs-io/ts-sdk/tbv/core"
      );

      let peginWallet: BitcoinWallet | undefined;
      vi.mocked(preparePeginTransaction).mockImplementation(async (wallet) => {
        peginWallet = wallet;
        return MOCK_BATCH_RESULT as any;
      });

      let postBroadcastWallet: BitcoinWallet | undefined;
      vi.mocked(submitWotsPublicKey).mockImplementation(async (params) => {
        postBroadcastWallet = params.btcWallet;
      });

      const approvalWallet = new PrototypeApprovalBtcWallet();

      const { result } = renderHook(() =>
        useDepositFlow({
          ...MOCK_PARAMS,
          btcWalletProvider: approvalWallet as any,
        }),
      );
      await executeDepositFlow(result);

      // Approval wallets dictate the Pre-PegIn change address.
      expect(preparePeginTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ changeAddress: "tb1pledgerchange" }),
      );

      expect(peginWallet).toBeDefined();
      expect(supportsDepositApproval(peginWallet!)).toBe(true);

      expect(postBroadcastWallet).toBeDefined();
      expect(supportsDepositApproval(postBroadcastWallet!)).toBe(true);

      // Presence isn't enough: the forwarded method must actually delegate to
      // the underlying wallet with the same terms object.
      await (
        peginWallet as BitcoinWallet & DepositTermsApprover
      ).approveDepositTerms(MOCK_DEPOSIT_TERMS);
      await (
        postBroadcastWallet as BitcoinWallet & DepositTermsApprover
      ).approveDepositTerms(MOCK_DEPOSIT_TERMS);
      expect(approvalWallet.approvedWith).toEqual([
        MOCK_DEPOSIT_TERMS,
        MOCK_DEPOSIT_TERMS,
      ]);
    });
  });
});
