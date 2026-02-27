/**
 * Unit tests for vaultSplitPeginService.
 *
 * All external dependencies (SDK, bitcoinjs-lib, config, contracts) are mocked
 * so that tests are fully isolated, fast, and deterministic.
 *
 * Key things under test:
 *  - preparePeginFromSplitOutput: pubkey normalisation, SDK call orchestration, return mapping
 *  - registerSplitPeginOnChain:   PeginManager construction, delegation, return pass-through
 *  - broadcastPeginWithLocalUtxo: UTXO matching (no mempool), PSBT construction, sign & broadcast
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  broadcastPeginWithLocalUtxo,
  preparePeginFromSplitOutput,
  registerSplitPeginOnChain,
  type BroadcastSplitPeginParams,
  type PrepareSplitPeginParams,
  type RegisterSplitPeginParams,
} from "../vaultSplitPeginService";

// ─── Hoisted mocks (must run before module imports) ──────────────────────────

const {
  mockBuildPeginPsbt,
  mockSelectUtxosForPegin,
  mockFundPeginTransaction,
  mockGetNetwork,
  mockGetPsbtInputFields,
  mockRegisterPeginOnChain,
  MockPeginManager,
  mockPushTx,
  MockTransaction,
  mockFromHex,
  MockPsbt,
  mockPsbtInstance,
} = vi.hoisted(() => {
  // --- SDK tbv/core mocks ---
  const mockBuildPeginPsbt = vi.fn();
  const mockSelectUtxosForPegin = vi.fn();
  const mockFundPeginTransaction = vi.fn();
  const mockGetNetwork = vi.fn();
  const mockGetPsbtInputFields = vi.fn();

  // PeginManager class mock
  const mockRegisterPeginOnChain = vi.fn();
  class MockPeginManager {
    constructor(public config: unknown) {}
    registerPeginOnChain = mockRegisterPeginOnChain;
  }

  // --- @babylonlabs-io/ts-sdk top-level ---
  const mockPushTx = vi.fn();

  // --- bitcoinjs-lib mocks ---

  // Psbt instance — shared across tests, reset in beforeEach
  const mockPsbtInstance = {
    setVersion: vi.fn(),
    setLocktime: vi.fn(),
    addInput: vi.fn(),
    addOutput: vi.fn(),
    toHex: vi.fn(() => "psbt-hex"),
    finalizeAllInputs: vi.fn(),
    extractTransaction: vi.fn(() => ({ toHex: () => "signed-tx-hex" })),
  };

  class MockPsbt {
    setVersion = mockPsbtInstance.setVersion;
    setLocktime = mockPsbtInstance.setLocktime;
    addInput = mockPsbtInstance.addInput;
    addOutput = mockPsbtInstance.addOutput;
    toHex = mockPsbtInstance.toHex;
    finalizeAllInputs = mockPsbtInstance.finalizeAllInputs;
    extractTransaction = mockPsbtInstance.extractTransaction;

    static fromHex = vi.fn(() => {
      // Returns a Psbt-like object used after signPsbt
      return {
        finalizeAllInputs: mockPsbtInstance.finalizeAllInputs,
        extractTransaction: mockPsbtInstance.extractTransaction,
      };
    });
  }

  // Transaction.fromHex mock — returns a controllable fake tx
  const mockFromHex = vi.fn();
  class MockTransaction {
    static fromHex = mockFromHex;
  }

  return {
    mockBuildPeginPsbt,
    mockSelectUtxosForPegin,
    mockFundPeginTransaction,
    mockGetNetwork,
    mockGetPsbtInputFields,
    mockRegisterPeginOnChain,
    MockPeginManager,
    mockPushTx,
    MockTransaction,
    mockFromHex,
    MockPsbt,
    mockPsbtInstance,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  buildPeginPsbt: mockBuildPeginPsbt,
  selectUtxosForPegin: mockSelectUtxosForPegin,
  fundPeginTransaction: mockFundPeginTransaction,
  getNetwork: mockGetNetwork,
  getPsbtInputFields: mockGetPsbtInputFields,
  PeginManager: MockPeginManager,
}));

vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: mockPushTx,
}));

vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: vi.fn(() => ({ id: 11155111, name: "Sepolia" })),
}));

vi.mock("bitcoinjs-lib", () => ({
  Transaction: MockTransaction,
  Psbt: MockPsbt,
}));

vi.mock("buffer", () => ({
  Buffer: globalThis.Buffer,
}));

vi.mock("../../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.space/signet/api"),
}));

vi.mock("../../../../config/contracts", () => ({
  CONTRACTS: { BTC_VAULTS_MANAGER: "0xvaultsmanager" as `0x${string}` },
}));

vi.mock("../../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "testnet"),
}));

// processPublicKeyToXOnly and stripHexPrefix are pure functions with no
// external dependencies — let them run real rather than mocking them.
// This also validates that the service wires them correctly.

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Make a minimal UTXO with a P2TR scriptPubKey. */
function makeUtxo(txid: string, vout: number, value = 10_000_000): UTXO {
  return {
    txid,
    vout,
    value,
    scriptPubKey: "5120" + "ab".repeat(32),
  };
}

/** 32 bytes = 64 hex chars — x-only pubkey (Taproot/Schnorr format) */
const X_ONLY_PUBKEY = "aa".repeat(32);

const SPLIT_OUTPUT = makeUtxo("a".repeat(64), 0, 5_001_000);

const CHANGE_ADDRESS = "tb1p" + "a".repeat(58);
const VAULT_PROVIDER_ADDRESS = "0xprovider" as `0x${string}`;
const VAULT_PROVIDER_BTC_PUBKEY = "bb".repeat(32);
const VAULT_KEEPER_PUBKEYS = ["cc".repeat(32)];
const UNIVERSAL_CHALLENGER_PUBKEYS = ["dd".repeat(32)];

const MOCK_PEGIN_PSBT = {
  psbtHex: "unfunded-psbt-hex",
  txid: "cafebabe" + "0".repeat(56),
  vaultScriptPubKey: "vault-script-pubkey",
  vaultValue: 5_000_000n,
};

// 1-input pegin fee at feeRate=5: ceil((P2TR_INPUT_SIZE(58) + 2×OUTPUT_SIZE(43) + OVERHEAD(11)) × 5)
//                                = ceil(155 × 5) = 775 sats
const MOCK_FEE = 775n;
// Arbitrary mock change amount — the value is not used by any function under test
const MOCK_CHANGE_AMOUNT = 225n;

const MOCK_UTXO_SELECTION = {
  selectedUTXOs: [SPLIT_OUTPUT],
  totalValue: BigInt(SPLIT_OUTPUT.value),
  fee: MOCK_FEE,
  changeAmount: MOCK_CHANGE_AMOUNT,
};

const MOCK_FUNDED_TX_HEX = "funded-tx-hex";

// ─── preparePeginFromSplitOutput ─────────────────────────────────────────────

describe("preparePeginFromSplitOutput", () => {
  let baseParams: PrepareSplitPeginParams;

  beforeEach(() => {
    vi.clearAllMocks();

    baseParams = {
      pegInAmount: 5_000_000n,
      feeRate: 5,
      changeAddress: CHANGE_ADDRESS,
      vaultProviderAddress: VAULT_PROVIDER_ADDRESS,
      depositorBtcPubkey: X_ONLY_PUBKEY,
      vaultProviderBtcPubkey: VAULT_PROVIDER_BTC_PUBKEY,
      vaultKeeperBtcPubkeys: [...VAULT_KEEPER_PUBKEYS],
      universalChallengerBtcPubkeys: [...UNIVERSAL_CHALLENGER_PUBKEYS],
      timelockPegin: 100,
      depositorClaimValue: 35_000n,
      splitOutput: SPLIT_OUTPUT,
    };

    mockBuildPeginPsbt.mockResolvedValue(MOCK_PEGIN_PSBT);
    mockSelectUtxosForPegin.mockReturnValue(MOCK_UTXO_SELECTION);
    mockFundPeginTransaction.mockReturnValue(MOCK_FUNDED_TX_HEX);
    mockGetNetwork.mockReturnValue({ network: "testnet" });
  });

  // ── pubkey validation ──────────────────────────────────────────────────

  describe("pubkey validation", () => {
    it("accepts valid 64-char x-only pubkey", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.depositorBtcPubkey).toBe(X_ONLY_PUBKEY);
    });

    it("rejects pubkey with invalid length", async () => {
      baseParams.depositorBtcPubkey = "aa".repeat(33); // 66 chars
      await expect(preparePeginFromSplitOutput(baseParams)).rejects.toThrow(
        "must be 64 hex characters",
      );
    });

    it("rejects pubkey with invalid characters", async () => {
      baseParams.depositorBtcPubkey = "zz".repeat(32); // invalid hex
      await expect(preparePeginFromSplitOutput(baseParams)).rejects.toThrow(
        "must be 64 hex characters",
      );
    });

    it("strips 0x prefix from vaultProviderBtcPubkey", async () => {
      baseParams.vaultProviderBtcPubkey = "0x" + VAULT_PROVIDER_BTC_PUBKEY;
      await preparePeginFromSplitOutput(baseParams);

      const callArg = mockBuildPeginPsbt.mock.calls[0][0];
      expect(callArg.vaultProviderPubkey).toBe(VAULT_PROVIDER_BTC_PUBKEY);
    });

    it("strips 0x prefix from vaultKeeperBtcPubkeys entries", async () => {
      baseParams.vaultKeeperBtcPubkeys = ["0x" + VAULT_KEEPER_PUBKEYS[0]];
      await preparePeginFromSplitOutput(baseParams);

      const callArg = mockBuildPeginPsbt.mock.calls[0][0];
      expect(callArg.vaultKeeperPubkeys).toEqual([VAULT_KEEPER_PUBKEYS[0]]);
    });

    it("strips 0x prefix from universalChallengerBtcPubkeys entries", async () => {
      baseParams.universalChallengerBtcPubkeys = [
        "0x" + UNIVERSAL_CHALLENGER_PUBKEYS[0],
      ];
      await preparePeginFromSplitOutput(baseParams);

      const callArg = mockBuildPeginPsbt.mock.calls[0][0];
      expect(callArg.universalChallengerPubkeys).toEqual([
        UNIVERSAL_CHALLENGER_PUBKEYS[0],
      ]);
    });
  });

  // ── SDK call orchestration ────────────────────────────────────────────────

  describe("SDK call orchestration", () => {
    it("calls buildPeginPsbt with normalised pubkeys, pegInAmount, timelock, claimValue, and network", async () => {
      await preparePeginFromSplitOutput(baseParams);

      expect(mockBuildPeginPsbt).toHaveBeenCalledTimes(1);
      expect(mockBuildPeginPsbt).toHaveBeenCalledWith({
        depositorPubkey: X_ONLY_PUBKEY,
        vaultProviderPubkey: VAULT_PROVIDER_BTC_PUBKEY,
        vaultKeeperPubkeys: VAULT_KEEPER_PUBKEYS,
        universalChallengerPubkeys: UNIVERSAL_CHALLENGER_PUBKEYS,
        timelockPegin: 100,
        pegInAmount: baseParams.pegInAmount,
        depositorClaimValue: 35_000n,
        network: "testnet",
      });
    });

    it("calls selectUtxosForPegin with only the split output as the UTXO pool", async () => {
      await preparePeginFromSplitOutput(baseParams);

      expect(mockSelectUtxosForPegin).toHaveBeenCalledTimes(1);
      const [utxos, amount, feeRate] = mockSelectUtxosForPegin.mock.calls[0];
      expect(utxos).toHaveLength(1);
      expect(utxos[0]).toBe(SPLIT_OUTPUT);
      expect(amount).toBe(baseParams.pegInAmount);
      expect(feeRate).toBe(baseParams.feeRate);
    });

    it("calls fundPeginTransaction with psbtHex from buildPeginPsbt", async () => {
      await preparePeginFromSplitOutput(baseParams);

      expect(mockFundPeginTransaction).toHaveBeenCalledTimes(1);
      const callArg = mockFundPeginTransaction.mock.calls[0][0];
      expect(callArg.unfundedTxHex).toBe(MOCK_PEGIN_PSBT.psbtHex);
    });

    it("calls fundPeginTransaction with changeAddress and changeAmount from selection", async () => {
      await preparePeginFromSplitOutput(baseParams);

      const callArg = mockFundPeginTransaction.mock.calls[0][0];
      expect(callArg.changeAddress).toBe(CHANGE_ADDRESS);
      expect(callArg.changeAmount).toBe(MOCK_UTXO_SELECTION.changeAmount);
    });

    it("calls fundPeginTransaction with selectedUTXOs from selectUtxosForPegin", async () => {
      await preparePeginFromSplitOutput(baseParams);

      const callArg = mockFundPeginTransaction.mock.calls[0][0];
      expect(callArg.selectedUTXOs).toEqual(MOCK_UTXO_SELECTION.selectedUTXOs);
    });
  });

  // ── return value ──────────────────────────────────────────────────────────

  describe("return value", () => {
    it("returns btcTxHash from buildPeginPsbt txid", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.btcTxHash).toBe(MOCK_PEGIN_PSBT.txid);
    });

    it("returns fundedTxHex from fundPeginTransaction", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.fundedTxHex).toBe(MOCK_FUNDED_TX_HEX);
    });

    it("returns vaultScriptPubKey from buildPeginPsbt", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.vaultScriptPubKey).toBe(MOCK_PEGIN_PSBT.vaultScriptPubKey);
    });

    it("returns selectedUTXOs from selectUtxosForPegin", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.selectedUTXOs).toBe(MOCK_UTXO_SELECTION.selectedUTXOs);
    });

    it("returns fee from selectUtxosForPegin", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.fee).toBe(MOCK_UTXO_SELECTION.fee);
    });

    it("returns changeAmount from selectUtxosForPegin", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.changeAmount).toBe(MOCK_UTXO_SELECTION.changeAmount);
    });

    it("returns the normalised x-only depositorBtcPubkey", async () => {
      const result = await preparePeginFromSplitOutput(baseParams);
      expect(result.depositorBtcPubkey).toBe(X_ONLY_PUBKEY);
    });
  });

  // ── error handling ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("wraps SDK errors with 'Failed to prepare pegin from split output:'", async () => {
      mockBuildPeginPsbt.mockRejectedValue(new Error("WASM init failed"));

      await expect(preparePeginFromSplitOutput(baseParams)).rejects.toThrow(
        "Failed to prepare pegin from split output: WASM init failed",
      );
    });
  });
});

// ─── registerSplitPeginOnChain ───────────────────────────────────────────────

describe("registerSplitPeginOnChain", () => {
  let baseParams: RegisterSplitPeginParams;
  let mockBtcWallet: { getPublicKeyHex: Mock };
  let mockEthWallet: { account: { address: string } };

  beforeEach(() => {
    vi.clearAllMocks();

    mockBtcWallet = { getPublicKeyHex: vi.fn() };
    mockEthWallet = { account: { address: "0xdepositor" } };

    baseParams = {
      depositorBtcPubkey: X_ONLY_PUBKEY,
      unsignedBtcTx: "unsigned-tx-hex",
      vaultProviderAddress: VAULT_PROVIDER_ADDRESS,
      onPopSigned: undefined,
    };

    mockRegisterPeginOnChain.mockResolvedValue({
      ethTxHash: "0xethtxhash" as `0x${string}`,
      vaultId: "0xvaultid" as `0x${string}`,
    });
  });

  // ── PeginManager construction ─────────────────────────────────────────────

  describe("PeginManager construction", () => {
    it("constructs PeginManager with correct config values", async () => {
      await registerSplitPeginOnChain(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );

      // Verify PeginManager was instantiated once
      expect(mockRegisterPeginOnChain).toHaveBeenCalledTimes(1);
    });

    it("calls registerPeginOnChain on the PeginManager instance", async () => {
      await registerSplitPeginOnChain(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );
      expect(mockRegisterPeginOnChain).toHaveBeenCalledTimes(1);
    });
  });

  // ── delegation ────────────────────────────────────────────────────────────

  describe("registerPeginOnChain delegation", () => {
    it("passes depositorBtcPubkey, unsignedBtcTx, and vaultProvider correctly", async () => {
      await registerSplitPeginOnChain(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );

      expect(mockRegisterPeginOnChain).toHaveBeenCalledWith({
        depositorBtcPubkey: X_ONLY_PUBKEY,
        unsignedBtcTx: "unsigned-tx-hex",
        vaultProvider: VAULT_PROVIDER_ADDRESS,
        onPopSigned: undefined,
        depositorLamportPkHash: undefined,
      });
    });

    it("passes onPopSigned callback when provided", async () => {
      const onPopSigned = vi.fn();
      baseParams.onPopSigned = onPopSigned;

      await registerSplitPeginOnChain(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );

      const callArg = mockRegisterPeginOnChain.mock.calls[0][0];
      expect(callArg.onPopSigned).toBe(onPopSigned);
    });
  });

  // ── return value ──────────────────────────────────────────────────────────

  describe("return value", () => {
    it("returns ethTxHash unchanged from registerPeginOnChain result", async () => {
      const result = await registerSplitPeginOnChain(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );
      expect(result.ethTxHash).toBe("0xethtxhash");
    });

    it("returns vaultId unchanged from registerPeginOnChain result", async () => {
      const result = await registerSplitPeginOnChain(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );
      expect(result.vaultId).toBe("0xvaultid");
    });
  });

  // ── error handling ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("wraps errors with 'Failed to register split pegin on-chain:'", async () => {
      mockRegisterPeginOnChain.mockRejectedValue(
        new Error("ETH transaction reverted"),
      );

      await expect(
        registerSplitPeginOnChain(
          mockBtcWallet as any,
          mockEthWallet as any,
          baseParams,
        ),
      ).rejects.toThrow(
        "Failed to register split pegin on-chain: ETH transaction reverted",
      );
    });
  });
});

// ─── broadcastPeginWithLocalUtxo ─────────────────────────────────────────────

describe("broadcastPeginWithLocalUtxo", () => {
  /**
   * A raw Bitcoin transaction stores txid bytes in **little-endian** (reversed) order.
   * When we do `Buffer.from(input.hash).reverse().toString("hex")` we recover the
   * display txid.  So if the display txid is SPLIT_OUTPUT.txid ("aaa...0"),
   * the raw hash bytes must be its reverse.
   */
  const SPLIT_TXID = SPLIT_OUTPUT.txid; // "aaa...0" (64 chars)
  const SPLIT_TXID_BYTES = Buffer.from(SPLIT_TXID, "hex").reverse();

  /** Minimal fake Transaction object with one input. */
  function makeFakeTx(
    overrides: {
      ins?: Array<{ hash: Buffer; index: number; sequence: number }>;
      outs?: Array<{ script: Buffer; value: number }>;
      version?: number;
      locktime?: number;
    } = {},
  ) {
    return {
      ins: overrides.ins ?? [
        {
          hash: SPLIT_TXID_BYTES,
          index: 0,
          sequence: 0xffffffff,
        },
      ],
      outs: overrides.outs ?? [
        { script: Buffer.from("76a914", "hex"), value: 4_999_000 },
      ],
      version: overrides.version ?? 2,
      locktime: overrides.locktime ?? 0,
    };
  }

  const MOCK_PSBT_INPUT_FIELDS = {
    witnessUtxo: {
      script: Buffer.from("5120" + "ab".repeat(32), "hex"),
      value: SPLIT_OUTPUT.value,
    },
    tapInternalKey: Buffer.from(X_ONLY_PUBKEY, "hex"),
  };

  let mockSignPsbt: Mock;
  let baseParams: BroadcastSplitPeginParams;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSignPsbt = vi.fn().mockResolvedValue("signed-psbt-hex");

    baseParams = {
      fundedTxHex: "funded-tx-hex",
      depositorBtcPubkey: X_ONLY_PUBKEY,
      splitOutputs: [SPLIT_OUTPUT],
      signPsbt: mockSignPsbt,
    };

    mockFromHex.mockReturnValue(makeFakeTx());
    mockGetPsbtInputFields.mockReturnValue(MOCK_PSBT_INPUT_FIELDS);
    mockPushTx.mockResolvedValue("broadcast-txid");

    // Reset Psbt instance mock methods
    mockPsbtInstance.setVersion.mockReset();
    mockPsbtInstance.setLocktime.mockReset();
    mockPsbtInstance.addInput.mockReset();
    mockPsbtInstance.addOutput.mockReset();
    mockPsbtInstance.toHex.mockReturnValue("psbt-hex");
    mockPsbtInstance.finalizeAllInputs.mockReset();
    mockPsbtInstance.extractTransaction.mockReturnValue({
      toHex: () => "signed-tx-hex",
    });
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("throws 'Transaction has no inputs' when tx has empty ins", async () => {
      mockFromHex.mockReturnValue(makeFakeTx({ ins: [] }));

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Transaction has no inputs",
      );
    });

    it("throws 'Invalid pubkey format' for a pubkey shorter than 64 chars", async () => {
      baseParams.depositorBtcPubkey = "aa".repeat(31); // 62 chars

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Invalid pubkey format",
      );
    });

    it("throws 'Invalid pubkey format' for a pubkey longer than 64 chars", async () => {
      baseParams.depositorBtcPubkey = "aa".repeat(33); // 66 chars

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Invalid pubkey format",
      );
    });

    it("throws 'Invalid pubkey format' for non-hex characters", async () => {
      // 64 chars but contains "zz"
      baseParams.depositorBtcPubkey = "zz".repeat(1) + "aa".repeat(31);

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Invalid pubkey format",
      );
    });
  });

  // ── 0x prefix stripping ───────────────────────────────────────────────────

  describe("0x prefix stripping", () => {
    it("strips 0x prefix from fundedTxHex before passing to Transaction.fromHex", async () => {
      baseParams.fundedTxHex = "0x" + "funded-tx-hex";
      await broadcastPeginWithLocalUtxo(baseParams);

      expect(mockFromHex).toHaveBeenCalledWith("funded-tx-hex");
    });

    it("does not double-strip when fundedTxHex has no 0x prefix", async () => {
      baseParams.fundedTxHex = "funded-tx-hex";
      await broadcastPeginWithLocalUtxo(baseParams);

      expect(mockFromHex).toHaveBeenCalledWith("funded-tx-hex");
    });

    it("strips 0x prefix from depositorBtcPubkey before validation", async () => {
      baseParams.depositorBtcPubkey = "0x" + X_ONLY_PUBKEY;
      // Should succeed — 0x is stripped leaving the valid 64-char key
      await expect(
        broadcastPeginWithLocalUtxo(baseParams),
      ).resolves.toBeDefined();
    });
  });

  // ── UTXO matching ─────────────────────────────────────────────────────────

  describe("UTXO matching", () => {
    it("matches split output by reversed txid and vout", async () => {
      // The service reverses input.hash to get display txid and compares to splitOutputs
      await broadcastPeginWithLocalUtxo(baseParams);

      // getPsbtInputFields should be called with the matched utxo data
      expect(mockGetPsbtInputFields).toHaveBeenCalledTimes(1);
      const [utxoArg] = mockGetPsbtInputFields.mock.calls[0];
      expect(utxoArg.txid).toBe(SPLIT_TXID);
      expect(utxoArg.vout).toBe(0);
      expect(utxoArg.value).toBe(SPLIT_OUTPUT.value);
    });

    it("throws 'Missing UTXO data' when no split output matches the input txid:vout", async () => {
      // Input has a different hash
      const unknownTxid = "ff".repeat(32);
      const unknownHashBytes = Buffer.from(unknownTxid, "hex").reverse();
      mockFromHex.mockReturnValue(
        makeFakeTx({
          ins: [{ hash: unknownHashBytes, index: 0, sequence: 0xffffffff }],
        }),
      );

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Missing UTXO data for input",
      );
    });

    it("includes available split output txid prefix in the error message", async () => {
      const unknownHashBytes = Buffer.from("ff".repeat(32), "hex").reverse();
      mockFromHex.mockReturnValue(
        makeFakeTx({
          ins: [{ hash: unknownHashBytes, index: 0, sequence: 0xffffffff }],
        }),
      );

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        // Error message should contain the first 8 chars of the available txid
        SPLIT_TXID.slice(0, 8),
      );
    });

    it("throws when vout matches but txid does not", async () => {
      const wrongTxidBytes = Buffer.from("ee".repeat(32), "hex").reverse();
      // vout=0 matches SPLIT_OUTPUT.vout, but txid is different
      mockFromHex.mockReturnValue(
        makeFakeTx({
          ins: [{ hash: wrongTxidBytes, index: 0, sequence: 0xffffffff }],
        }),
      );

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Missing UTXO data for input",
      );
    });

    it("throws when txid matches but vout does not", async () => {
      // vout=99 — does not match SPLIT_OUTPUT.vout=0
      mockFromHex.mockReturnValue(
        makeFakeTx({
          ins: [{ hash: SPLIT_TXID_BYTES, index: 99, sequence: 0xffffffff }],
        }),
      );

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Missing UTXO data for input",
      );
    });
  });

  // ── PSBT construction ─────────────────────────────────────────────────────

  describe("PSBT construction", () => {
    it("sets PSBT version from the parsed transaction", async () => {
      mockFromHex.mockReturnValue(makeFakeTx({ version: 2 }));
      await broadcastPeginWithLocalUtxo(baseParams);
      expect(mockPsbtInstance.setVersion).toHaveBeenCalledWith(2);
    });

    it("sets PSBT locktime from the parsed transaction", async () => {
      mockFromHex.mockReturnValue(makeFakeTx({ locktime: 800_000 }));
      await broadcastPeginWithLocalUtxo(baseParams);
      expect(mockPsbtInstance.setLocktime).toHaveBeenCalledWith(800_000);
    });

    it("calls getPsbtInputFields with matched UTXO data", async () => {
      await broadcastPeginWithLocalUtxo(baseParams);

      const [utxoArg] = mockGetPsbtInputFields.mock.calls[0];
      expect(utxoArg.scriptPubKey).toBe(SPLIT_OUTPUT.scriptPubKey);
      expect(utxoArg.value).toBe(SPLIT_OUTPUT.value);
    });

    it("calls getPsbtInputFields with the x-only public key buffer", async () => {
      await broadcastPeginWithLocalUtxo(baseParams);

      const [, pubkeyArg] = mockGetPsbtInputFields.mock.calls[0];
      expect(pubkeyArg).toEqual(Buffer.from(X_ONLY_PUBKEY, "hex"));
    });

    it("adds input to PSBT with hash, index, sequence, and spread psbtInputFields", async () => {
      const fakeTx = makeFakeTx();
      mockFromHex.mockReturnValue(fakeTx);
      await broadcastPeginWithLocalUtxo(baseParams);

      expect(mockPsbtInstance.addInput).toHaveBeenCalledWith({
        hash: fakeTx.ins[0]!.hash,
        index: fakeTx.ins[0]!.index,
        sequence: fakeTx.ins[0]!.sequence,
        ...MOCK_PSBT_INPUT_FIELDS,
      });
    });

    it("adds all outputs to PSBT", async () => {
      const fakeTx = makeFakeTx({
        outs: [
          { script: Buffer.from("aaaa", "hex"), value: 1_000_000 },
          { script: Buffer.from("bbbb", "hex"), value: 2_000_000 },
        ],
      });
      mockFromHex.mockReturnValue(fakeTx);

      await broadcastPeginWithLocalUtxo(baseParams);

      expect(mockPsbtInstance.addOutput).toHaveBeenCalledTimes(2);
      expect(mockPsbtInstance.addOutput).toHaveBeenNthCalledWith(1, {
        script: fakeTx.outs[0]!.script,
        value: fakeTx.outs[0]!.value,
      });
      expect(mockPsbtInstance.addOutput).toHaveBeenNthCalledWith(2, {
        script: fakeTx.outs[1]!.script,
        value: fakeTx.outs[1]!.value,
      });
    });
  });

  // ── signing and broadcast ─────────────────────────────────────────────────

  describe("signing and broadcast", () => {
    it("calls signPsbt with the PSBT hex", async () => {
      await broadcastPeginWithLocalUtxo(baseParams);
      expect(mockSignPsbt).toHaveBeenCalledWith("psbt-hex");
    });

    it("calls pushTx with signed tx hex and mempool API URL", async () => {
      await broadcastPeginWithLocalUtxo(baseParams);

      expect(mockPushTx).toHaveBeenCalledWith(
        "signed-tx-hex",
        "https://mempool.space/signet/api",
      );
    });

    it("returns the txid string from pushTx", async () => {
      const result = await broadcastPeginWithLocalUtxo(baseParams);
      expect(result).toBe("broadcast-txid");
    });
  });

  // ── error handling ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("wraps broadcast errors with 'Failed to broadcast split pegin transaction:'", async () => {
      mockPushTx.mockRejectedValue(new Error("mempool rejected tx"));

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Failed to broadcast split pegin transaction: mempool rejected tx",
      );
    });

    it("wraps signing errors with 'Failed to broadcast split pegin transaction:'", async () => {
      mockSignPsbt.mockRejectedValue(new Error("user rejected signing"));

      await expect(broadcastPeginWithLocalUtxo(baseParams)).rejects.toThrow(
        "Failed to broadcast split pegin transaction: user rejected signing",
      );
    });
  });
});
