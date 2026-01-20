/**
 * Tests for depositFlowSteps - focusing on validation logic
 */

import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";

// Mock all dependencies before importing the module under test
vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: vi.fn(() => ({ id: 11155111, name: "Sepolia" })),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: vi.fn(() => ({ config: "mock" })),
}));

vi.mock("wagmi/actions", () => ({
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("@/services/deposit", () => ({
  depositService: {
    validateDepositAmount: vi.fn(() => ({ valid: true })),
    formatSatoshisToBtc: vi.fn(),
  },
}));

vi.mock("@/services/deposit/polling", () => ({
  waitForContractVerification: vi.fn(),
}));

vi.mock("@/clients/vault-provider-rpc", () => ({
  VaultProviderRpcApi: vi.fn().mockImplementation(() => ({
    requestDepositorPresignTransactions: vi.fn(),
  })),
}));

vi.mock("@/utils/async", () => ({
  pollUntil: vi.fn((fn) => fn()),
}));

vi.mock("@/services/vault", () => ({
  broadcastPeginTransaction: vi.fn(),
  fetchVaultById: vi.fn(),
  selectUtxosForDeposit: vi.fn(({ availableUtxos }) => availableUtxos),
}));

vi.mock("@/services/vault/vaultPayoutSignatureService", () => ({
  prepareTransactionsForSigning: vi.fn(),
  getSortedVaultKeeperPubkeys: vi.fn((keepers) =>
    keepers.map((k: { btcPubKey: string }) => k.btcPubKey),
  ),
  getSortedUniversalChallengerPubkeys: vi.fn((challengers) =>
    challengers.map((c: { btcPubKey: string }) => c.btcPubKey),
  ),
  submitSignaturesToVaultProvider: vi.fn(),
}));

vi.mock("@/config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("signet"),
}));

vi.mock("@/services/vault/vaultTransactionService", () => ({
  submitPeginRequest: vi.fn(),
}));

vi.mock("@/storage/peginStorage", () => ({
  addPendingPegin: vi.fn(),
  updatePendingPeginStatus: vi.fn(),
}));

vi.mock("@/utils/btc", () => ({
  processPublicKeyToXOnly: vi.fn((key) => key),
  stripHexPrefix: vi.fn((hex) => hex.replace("0x", "")),
}));

vi.mock("@/models/peginStateMachine", () => ({
  LocalStorageStatus: {
    PENDING: "PENDING",
    PAYOUT_SIGNED: "PAYOUT_SIGNED",
    CONFIRMING: "CONFIRMING",
  },
}));

// Import after mocking
import { validateDepositInputs } from "../depositFlowSteps";

describe("validateDepositInputs", () => {
  const validParams = {
    btcAddress: "bc1qtest123",
    depositorEthAddress: "0xEthAddress123" as Address,
    amount: 500000n,
    selectedProviders: ["0xProvider123"],
    confirmedUTXOs: [
      { txid: "0x123", vout: 0, value: 500000, scriptPubKey: "0xabc" },
    ],
    isUTXOsLoading: false,
    utxoError: null,
    vaultKeeperBtcPubkeys: ["0xVaultKeeperKey1"],
    universalChallengerBtcPubkeys: ["0xUniversalChallengerKey1"],
  };

  describe("vault keepers validation", () => {
    it("should throw error when vaultKeeperBtcPubkeys is empty array", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          vaultKeeperBtcPubkeys: [],
        }),
      ).toThrow(
        "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
      );
    });

    it("should throw error when vaultKeeperBtcPubkeys is undefined", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          vaultKeeperBtcPubkeys: undefined as unknown as string[],
        }),
      ).toThrow(
        "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
      );
    });

    it("should throw error when vaultKeeperBtcPubkeys is null", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          vaultKeeperBtcPubkeys: null as unknown as string[],
        }),
      ).toThrow(
        "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
      );
    });

    it("should pass when vaultKeeperBtcPubkeys has one item", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          vaultKeeperBtcPubkeys: ["0xKey1"],
        }),
      ).not.toThrow();
    });

    it("should pass when vaultKeeperBtcPubkeys has multiple items", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          vaultKeeperBtcPubkeys: ["0xKey1", "0xKey2", "0xKey3"],
        }),
      ).not.toThrow();
    });
  });

  describe("universal challengers validation", () => {
    it("should throw error when universalChallengerBtcPubkeys is empty array", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          universalChallengerBtcPubkeys: [],
        }),
      ).toThrow(
        "No universal challengers available. The system requires at least one universal challenger to create a deposit.",
      );
    });

    it("should throw error when universalChallengerBtcPubkeys is undefined", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          universalChallengerBtcPubkeys: undefined as unknown as string[],
        }),
      ).toThrow(
        "No universal challengers available. The system requires at least one universal challenger to create a deposit.",
      );
    });

    it("should throw error when universalChallengerBtcPubkeys is null", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          universalChallengerBtcPubkeys: null as unknown as string[],
        }),
      ).toThrow(
        "No universal challengers available. The system requires at least one universal challenger to create a deposit.",
      );
    });

    it("should pass when universalChallengerBtcPubkeys has one item", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          universalChallengerBtcPubkeys: ["0xKey1"],
        }),
      ).not.toThrow();
    });

    it("should pass when universalChallengerBtcPubkeys has multiple items", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          universalChallengerBtcPubkeys: ["0xKey1", "0xKey2"],
        }),
      ).not.toThrow();
    });
  });

  describe("combined validation", () => {
    it("should throw vault keepers error first when both are empty", () => {
      expect(() =>
        validateDepositInputs({
          ...validParams,
          vaultKeeperBtcPubkeys: [],
          universalChallengerBtcPubkeys: [],
        }),
      ).toThrow(
        "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
      );
    });

    it("should pass validation with valid vault keepers and universal challengers", () => {
      expect(() => validateDepositInputs(validParams)).not.toThrow();
    });
  });
});
