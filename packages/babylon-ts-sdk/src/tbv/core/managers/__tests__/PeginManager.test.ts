/**
 * Tests for PeginManager
 *
 * Tests the manager's ability to orchestrate peg-in operations
 * using primitives, utilities, and mock wallets.
 */

import {
  computeMinClaimValue,
  computeMinPeginFee,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import {
  decodeFunctionData,
  zeroAddress,
  type Address,
  type Chain,
  type PublicClient,
} from "viem";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { SignPsbtOptions } from "../../../../shared/wallets";
import { MockBitcoinWallet, MockEthereumWallet } from "../../../../testing";
import { MEMPOOL_API_URLS } from "../../clients/mempool";
import { BTCVaultRegistryABI } from "../../contracts";
import {
  DepositTermsRejectedError,
  type DepositTerms,
} from "../../deposit-terms";
import {
  deriveNativeSegwitAddress,
  deriveTaprootAddress,
} from "../../primitives";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import type { UTXO } from "../../utils";
import { PeginManager, type PeginManagerConfig } from "../PeginManager";

// Mock calculateBtcTxHash to avoid parsing funded pre-pegin tx in tests
vi.mock("../../utils/transaction/btcTxHash", () => ({
  calculateBtcTxHash: vi.fn(() => `0x${"a".repeat(64)}`),
}));

// Mock buildPeginInputPsbt, extractPeginInputSignature, and finalizePeginInputPsbt —
// the mock wallet cannot produce a valid signed PSBT, so we mock these primitives
vi.mock("../../primitives/psbt/peginInput", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../primitives/psbt/peginInput")>();
  return {
    ...actual,
    buildPeginInputPsbt: vi.fn().mockResolvedValue({ psbtHex: "deadbeef" }),
    extractPeginInputSignature: vi.fn().mockReturnValue("a".repeat(128)),
    finalizePeginInputPsbt: vi
      .fn()
      .mockReturnValue("mock-depositor-signed-pegin-tx"),
  };
});

// Mocked for the same reason: mock wallet returns non-PSBT hex.
vi.mock(
  "../../primitives/psbt/assertPsbtUnsignedTxMatches",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../primitives/psbt/assertPsbtUnsignedTxMatches")
      >();
    return {
      ...actual,
      assertPsbtUnsignedTxMatches: vi.fn(),
    };
  },
);

// Schnorr-signature verification needs a real PSBT + real signature, which the
// mock wallet cannot produce. It is verified in its own dedicated real-PSBT
// tests (primitives/psbt/__tests__/verifyScriptPathSchnorrSignature.test.ts).
vi.mock("../../primitives/psbt/verifyScriptPathSchnorrSignature", () => ({
  assertScriptPathSchnorrSignature: vi.fn(),
}));

// Key-path twin of the script-path stub above: real verification lives in
// primitives/psbt/__tests__/verifyKeyPathSchnorrSignature.test.ts.
vi.mock("../../primitives/psbt/verifyKeyPathSchnorrSignature", () => ({
  assertReturnedKeyPathSignatures: vi.fn(),
}));

// Passthrough observer: records each per-vault PegIn build so the seam test can
// assert the htlcVout bind-checks run BEFORE deposit-terms approval. The
// prePeginTamper hook lets tests corrupt the Pre-PegIn commit pass to prove
// the sizing/commit and funded-fee cross-checks fire; each resets it to null.
const peginBuildLog = vi.hoisted(() => [] as string[]);
const prePeginTamper = vi.hoisted(
  () =>
    ({ fn: null }) as {
      fn:
        | ((
            r: import("../../primitives").PrePeginPsbtResult,
          ) => import("../../primitives").PrePeginPsbtResult)
        | null;
    },
);
vi.mock("../../primitives/psbt/pegin", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../primitives/psbt/pegin")>();
  const wrapped: typeof actual.buildPeginTxFromFundedPrePegin = async (
    ...args
  ) => {
    peginBuildLog.push("buildPeginTx");
    return actual.buildPeginTxFromFundedPrePegin(...args);
  };
  const wrappedPrePegin: typeof actual.buildPrePeginPsbt = async (...args) => {
    const result = await actual.buildPrePeginPsbt(...args);
    return prePeginTamper.fn ? prePeginTamper.fn(result) : result;
  };
  return {
    ...actual,
    buildPeginTxFromFundedPrePegin: wrapped,
    buildPrePeginPsbt: wrappedPrePegin,
  };
});

// Test chain configuration (minimal viem Chain)
const TEST_CHAIN: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.org"] },
  },
};

// Mock public client passed into PeginManager config so tests don't
// hit HTTP. Mirrors viem's PublicClient surface used by the manager.
const TEST_PUBLIC_CLIENT = {
  estimateGas: vi.fn().mockResolvedValue(100000n),
  // Empty bytecode marks the connected wallet as an Externally Owned Account
  // (EOA — controlled by a single private key, e.g. MetaMask), so the
  // smart-account-aware receipt wait delegates directly to
  // waitForTransactionReceipt.
  getCode: vi.fn().mockResolvedValue("0x"),
  waitForTransactionReceipt: vi.fn().mockResolvedValue({
    status: "success",
    transactionHash: "0x" + "ab".repeat(32),
  }),
  readContract: vi
    .fn()
    .mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "getPegInFee") return Promise.resolve(0n);
      // viem returns uint16 as a JS number — emulate that for the mock.
      if (functionName === "getVaultProviderCommission")
        return Promise.resolve(0);
      // getBtcVaultBasicInfo — return struct with zero depositor (vault doesn't exist)
      return Promise.resolve({ depositor: zeroAddress });
    }),
} as unknown as PublicClient;

// Test constants - use valid secp256k1 x-only public keys
const TEST_KEYS = {
  // Must stay = MockBitcoinWallet's default privkey-1 pubkey (G.x): the PoP
  // tests sign with the mock's default key.
  DEPOSITOR: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  VAULT_PROVIDER:
    "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  VAULT_KEEPER_1:
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  VAULT_KEEPER_2:
    "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
  UNIVERSAL_CHALLENGER_1:
    "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
} as const;

// Mock depositor WOTS public key hash (bytes32)
const MOCK_WOTS_PK_HASH = `0x${"ab".repeat(32)}` as `0x${string}`;

// Mock hashlock for HTLC (bytes32)
const MOCK_HASHLOCK = `0x${"cd".repeat(32)}` as `0x${string}`;

// Peg-in config fingerprint. Distinct from the other bytes32 mocks above so a
// slot mix-up cannot pass. PeginManager only forwards it — the encoding and
// the calldata position are covered in the eth-client calldata tests.
const FINGERPRINT = `0x${"7c".repeat(32)}` as `0x${string}`;

function mockDepositorSignedPeginTx(prevoutByte: number): string {
  const transaction = new bitcoin.Transaction();
  transaction.version = 2;
  transaction.addInput(Buffer.alloc(32, prevoutByte), 0);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 50_000);
  transaction.setWitness(0, [Buffer.alloc(64, 0x11)]);
  return transaction.toHex();
}

// Distinct, well-formed SegWit transactions: the ETH-only txid parser rejects
// malformed placeholders rather than hashing arbitrary bytes.
const MOCK_DEPOSITOR_SIGNED_PEGIN_TX = mockDepositorSignedPeginTx(0xab);
const MOCK_DEPOSITOR_SIGNED_PEGIN_TX_ALT = mockDepositorSignedPeginTx(0xac);

const TEST_AMOUNTS = {
  PEGIN: 90_000n,
  PEGIN_SMALL: 50_000n,
  PEGIN_MEDIUM: 100_000n,
} as const;

// Test UTXOs with valid P2TR scriptPubKey (OP_1 <32-byte-pubkey>)
// Format: 51 (OP_1) + 20 (push 32 bytes) + 32-byte pubkey
// Values are large to cover the WASM-computed htlcValue, which includes
// pegInAmount + depositorClaimValue (protocol graph fees) + internal fees.
const TEST_UTXOS: UTXO[] = [
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000001",
    vout: 0,
    value: 800_000,
    scriptPubKey:
      "5120" +
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000002",
    vout: 0,
    value: 800_000,
    scriptPubKey:
      "5120" +
      "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000003",
    vout: 1,
    value: 800_000,
    scriptPubKey:
      "5120" +
      "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  },
];

// Use lowercase to avoid EIP-55 checksum validation issues
const TEST_CONTRACT_ADDRESS =
  "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address;

// Bech32m P2TR address derived from TEST_KEYS.DEPOSITOR on signet. Used as
// the deposit's change address AND default depositor payout address — both
// values now require binding to the connected wallet pubkey (audit #200).
// `initEccLib(ecc)` runs in `src/test/setup.ts` before this module loads.
const TEST_CHANGE_ADDRESS = deriveTaprootAddress(TEST_KEYS.DEPOSITOR, "signet");
const TEST_PAYOUT_ADDRESS = TEST_CHANGE_ADDRESS;
// A valid P2TR address NOT derived from TEST_KEYS.DEPOSITOR — used in
// address-binding-rejection tests below.
const FOREIGN_BTC_ADDRESS = deriveTaprootAddress(
  TEST_KEYS.VAULT_PROVIDER,
  "signet",
);

// Base params for preparePegin — shared across tests. Hashlocks are
// derived internally from the wallet root, so they are NOT passed in.
const BASE_PREPARE_PEGIN_PARAMS = {
  vaultCoreVersion: 1,
  vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
  vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
  universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
  timelockPegin: 100,
  timelockAssert: 100,
  timelockRefund: 144,
  protocolFeeRate: 10n,
  minPeginFeeRate: 10n,
  mempoolFeeRate: 10,
  councilQuorum: 2,
  councilSize: 3,
  availableUTXOs: TEST_UTXOS,
  changeAddress: TEST_CHANGE_ADDRESS,
  commissionBps: 250,
} as const;

describe("PeginManager", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Constructor", () => {
    it("should create a manager with valid config", () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const config: PeginManagerConfig = {
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: {
          btcVaultRegistry: TEST_CONTRACT_ADDRESS,
        },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      };

      const manager = new PeginManager(config);

      expect(manager).toBeInstanceOf(PeginManager);
      expect(manager.getNetwork()).toBe("signet");
      expect(manager.getVaultContractAddress()).toBe(TEST_CONTRACT_ADDRESS);
    });

    it("should support different networks", () => {
      const btcWallet = new MockBitcoinWallet();
      const ethWallet = new MockEthereumWallet();

      const networks = ["bitcoin", "testnet", "signet", "regtest"] as const;

      for (const network of networks) {
        const manager = new PeginManager({
          btcNetwork: network,
          btcWallet,
          ethWallet: ethWallet as any,
          ethChain: TEST_CHAIN,
          publicClient: TEST_PUBLIC_CLIENT,
          vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
          mempoolApiUrl: MEMPOOL_API_URLS.signet,
        });

        expect(manager.getNetwork()).toBe(network);
      }
    });
  });

  describe("preparePegin", () => {
    it("passes the wallet's raw (compressed) pubkey to signPsbt (single-vault pegin)", async () => {
      // Regression: taproot signPsbt expects the wallet's native format
      // on signInputs[].publicKey (UniSat/OKX/OneKey reject x-only with
      // "invalid public key in toSignInput"). A single-vault pegin is one
      // PSBT, so signPsbtsWithFallback routes it to signPsbt.
      const compressedPubkey = `02${TEST_KEYS.DEPOSITOR}`;
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: compressedPubkey,
      });
      const ethWallet = new MockEthereumWallet();
      const signPsbtSpy = vi.spyOn(btcWallet, "signPsbt");

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      expect(signPsbtSpy).toHaveBeenCalled();
      const signOptions = signPsbtSpy.mock.calls[0][1];
      const publicKey = signOptions?.signInputs?.[0]?.publicKey;
      expect(publicKey).toBe(compressedPubkey);
    });

    it("rebinds every wallet-signed PegIn PSBT against the requested one — one call per vault, paired by index", async () => {
      const { assertPsbtUnsignedTxMatches } = await import(
        "../../primitives/psbt/assertPsbtUnsignedTxMatches"
      );
      const { buildPeginInputPsbt } = await import(
        "../../primitives/psbt/peginInput"
      );
      const rebind = vi.mocked(assertPsbtUnsignedTxMatches);
      const builder = vi.mocked(buildPeginInputPsbt);
      rebind.mockClear();
      // Distinct per-call PSBT hex so we can prove each rebind call gets
      // its own (requested, returned) pair instead of all calls being
      // validated against index 0.
      let buildCount = 0;
      builder.mockImplementation(async () => ({
        psbtHex: `requested_${buildCount++}`,
      }));

      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // 2 vaults so we exercise the per-vault loop, not just index 0.
      await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN, TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      expect(rebind).toHaveBeenCalledTimes(2);
      // Each rebind call must pair the per-vault request with the wallet's
      // response for THAT vault — MockBitcoinWallet.signPsbts produces
      // `<requested>deadbeef`, so `returned[i]` must be `requested[i]deadbeef`.
      rebind.mock.calls.forEach(([params], i) => {
        expect(params.requestedPsbtHex).toBe(`requested_${i}`);
        expect(params.returnedPsbtHex).toBe(`requested_${i}deadbeef`);
      });
    });

    it("aborts preparePegin before sig extraction when the rebind helper rejects", async () => {
      const { assertPsbtUnsignedTxMatches } = await import(
        "../../primitives/psbt/assertPsbtUnsignedTxMatches"
      );
      const { extractPeginInputSignature } = await import(
        "../../primitives/psbt/peginInput"
      );
      const rebind = vi.mocked(assertPsbtUnsignedTxMatches);
      const extract = vi.mocked(extractPeginInputSignature);
      rebind.mockClear();
      extract.mockClear();
      rebind.mockImplementationOnce(() => {
        throw new Error("input 0 prevout txid differs (requested=ab… …)");
      });

      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/prevout txid differs/);

      expect(extract).not.toHaveBeenCalled();
    });

    it("should prepare a pegin with valid params", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      // Verify wrapper shape
      expect(result).toHaveProperty("transaction");
      expect(result).toHaveProperty("depositorBtcPubkey");
      expect(result).toHaveProperty("derivedSecrets");

      const tx = result.transaction;
      expect(tx).toHaveProperty("fundedPrePeginTxHex");
      expect(tx).toHaveProperty("prePeginTxid");
      expect(tx).toHaveProperty("perVault");
      expect(tx).toHaveProperty("selectedUTXOs");
      expect(tx).toHaveProperty("fee");
      expect(tx).toHaveProperty("changeAmount");

      // Verify per-vault data
      expect(tx.perVault).toHaveLength(1);
      expect(tx.perVault[0]).toHaveProperty("htlcVout");
      expect(tx.perVault[0]).toHaveProperty("htlcValue");
      expect(tx.perVault[0]).toHaveProperty("peginTxHex");
      expect(tx.perVault[0]).toHaveProperty("peginTxid");
      expect(tx.perVault[0]).toHaveProperty("peginInputSignature");
      expect(tx.perVault[0]).toHaveProperty("vaultScriptPubKey");

      // Verify types
      expect(typeof tx.fundedPrePeginTxHex).toBe("string");
      expect(typeof tx.perVault[0].htlcValue).toBe("bigint");
      expect(typeof tx.perVault[0].vaultScriptPubKey).toBe("string");
      expect(Array.isArray(tx.selectedUTXOs)).toBe(true);
      expect(typeof tx.fee).toBe("bigint");
      expect(typeof tx.changeAmount).toBe("bigint");
      expect(tx.perVault[0].peginInputSignature).toBe("a".repeat(128)); // from mock

      // Verify values
      expect(tx.fundedPrePeginTxHex.length).toBeGreaterThan(0);
      expect(tx.perVault[0].htlcValue).toBeGreaterThan(0n);
      expect(tx.perVault[0].vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(tx.selectedUTXOs.length).toBeGreaterThan(0);
      expect(tx.fee).toBeGreaterThan(0n);
      expect(tx.perVault[0].peginTxid).toMatch(/^[0-9a-f]{64}$/);

      // Derived secrets shape
      expect(result.derivedSecrets.perVaultWotsKeys).toHaveLength(1);
      expect(result.derivedSecrets.wotsPkHashes).toHaveLength(1);
      expect(result.derivedSecrets.htlcSecretHexes).toHaveLength(1);
      expect(result.derivedSecrets.htlcSecretHexes[0]).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(result.derivedSecrets.wotsPkHashes[0]).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.derivedSecrets.authAnchorHex).toMatch(/^[0-9a-f]{64}$/);

      // Pubkey snapshot returned at top level (safe to persist).
      expect(result.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
    });

    it("should select UTXOs covering htlcValue + fee", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN_SMALL],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      const tx = result.transaction;
      expect(tx.selectedUTXOs.length).toBeGreaterThanOrEqual(1);

      // Selected UTXOs must cover all outputs (HTLC + CPFP anchor) + fee
      const totalSelected = tx.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBeGreaterThanOrEqual(
        tx.perVault[0].htlcValue + tx.fee,
      );
      expect(tx.changeAmount).toBeGreaterThanOrEqual(0n);
    });

    it("should handle multiple vault keepers and universal challengers", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
        vaultKeeperBtcPubkeys: [
          TEST_KEYS.VAULT_KEEPER_1,
          TEST_KEYS.VAULT_KEEPER_2,
        ],
      });

      expect(result.transaction.fundedPrePeginTxHex.length).toBeGreaterThan(0);
      expect(
        result.transaction.perVault[0].vaultScriptPubKey.length,
      ).toBeGreaterThan(0);
    });

    it("should calculate change correctly", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      const tx = result.transaction;
      // Selected UTXOs must cover all outputs (HTLC + CPFP anchor) + fee
      const totalSelected = tx.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBeGreaterThanOrEqual(
        tx.perVault[0].htlcValue + tx.fee,
      );
      expect(tx.changeAmount).toBeGreaterThanOrEqual(0n);
    });

    it("should throw error for insufficient funds", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const totalAvailable = TEST_UTXOS.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      const excessiveAmount = totalAvailable + 100_000n;

      await expect(
        manager.preparePegin({
          amounts: [excessiveAmount],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/Insufficient funds/);
    });

    it("should throw error for empty UTXOs", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
          availableUTXOs: [],
        }),
      ).rejects.toThrow(/no UTXOs available/);
    });

    it("should throw error for invalid public keys", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
          vaultProviderBtcPubkey: "invalid-pubkey",
        }),
      ).rejects.toThrow();
    });

    it("should throw error for empty vault keepers", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
          vaultKeeperBtcPubkeys: [],
          universalChallengerBtcPubkeys: [],
        }),
      ).rejects.toThrow();
    });

    it("approves the deposit terms after derive and before PegIn signing for capable wallets", async () => {
      const callOrder: string[] = [];
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const originalDeriveContextHash =
        btcWallet.deriveContextHash.bind(btcWallet);
      const originalSignPsbts = btcWallet.signPsbts.bind(btcWallet);
      let approvedTerms: DepositTerms | undefined;
      let peginBuildsAtApproval = -1;
      peginBuildLog.length = 0;

      // Own-property overrides (class-field semantics) — mirrors how a real
      // approval-capable wallet exposes approveDepositTerms.
      const capableWallet = Object.assign(btcWallet, {
        deriveContextHash: async (appName: string, context: string) => {
          callOrder.push("deriveContextHash");
          return originalDeriveContextHash(appName, context);
        },
        signPsbts: async (
          psbtsHexes: string[],
          options?: SignPsbtOptions[],
        ) => {
          callOrder.push("signPsbts");
          return originalSignPsbts(psbtsHexes, options);
        },
        approveDepositTerms: async (terms: DepositTerms) => {
          callOrder.push("approveDepositTerms");
          approvedTerms = terms;
          peginBuildsAtApproval = peginBuildLog.length;
        },
        getChangeAddress: async () => TEST_CHANGE_ADDRESS,
      });

      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet: capableWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Distinct amounts so per-vault ordering is observable (identical
      // amounts would make a vault-order swap invisible).
      const vaultAmounts = [TEST_AMOUNTS.PEGIN, TEST_AMOUNTS.PEGIN_MEDIUM];
      const result = await manager.preparePegin({
        // 2 vaults so the batch path calls wallet.signPsbts (not signPsbt),
        // matching the "signPsbts" label asserted below.
        amounts: vaultAmounts,
        ...BASE_PREPARE_PEGIN_PARAMS,
        // Distinct from minPeginFeeRate (10n) so a protocolFeeRate assertion can
        // tell the two same-typed rates apart.
        protocolFeeRate: 12n,
      });

      expect(callOrder.filter((c) => c === "approveDepositTerms")).toHaveLength(
        1,
      );
      const deriveIdx = callOrder.indexOf("deriveContextHash");
      const approveIdx = callOrder.indexOf("approveDepositTerms");
      const signIdx = callOrder.indexOf("signPsbts");
      expect(deriveIdx).toBeGreaterThanOrEqual(0);
      expect(approveIdx).toBeGreaterThan(deriveIdx);
      expect(signIdx).toBeGreaterThan(approveIdx);
      // Seam invariant (see DepositTermsApprover): any derive invalidates a
      // prior approval, so every derive inside preparePegin must precede the
      // approval — pin the LAST derive before it, not just the first.
      expect(callOrder.lastIndexOf("deriveContextHash")).toBeLessThan(
        approveIdx,
      );
      // Both per-vault PegIn builds (and their htlcVout bind-checks) must have
      // run before the depositor approved on the device.
      expect(peginBuildsAtApproval).toBe(2);

      expect(approvedTerms).toBeDefined();
      expect(approvedTerms?.prepeginTxid).toBe(
        result.transaction.prePeginTxid.replace(/^0x/i, "").toLowerCase(),
      );
      expect(result.depositTerms).toBe(approvedTerms);

      // Pin every field the manager maps into buildDepositTerms. Several are
      // same-typed and trivially swappable (the two key lists, the three sat
      // amounts, the two rates, the two timelocks), so a partial check lets a
      // mis-wiring through silently.
      expect(approvedTerms?.protocolFeeRate).toBe(12n);
      expect(approvedTerms?.timelockPegin).toBe(
        BASE_PREPARE_PEGIN_PARAMS.timelockPegin,
      );
      expect(approvedTerms?.timelockAssert).toBe(
        BASE_PREPARE_PEGIN_PARAMS.timelockAssert,
      );
      expect(approvedTerms?.timelockRefund).toBe(
        BASE_PREPARE_PEGIN_PARAMS.timelockRefund,
      );
      expect(approvedTerms?.vaultKeeperBtcPubkeys).toEqual(
        BASE_PREPARE_PEGIN_PARAMS.vaultKeeperBtcPubkeys,
      );
      expect(approvedTerms?.universalChallengerBtcPubkeys).toEqual(
        BASE_PREPARE_PEGIN_PARAMS.universalChallengerBtcPubkeys,
      );
      expect(approvedTerms?.prepeginMaxFee).toBe(result.transaction.fee);

      // Recompute the two WASM-sourced sat amounts independently so a swap
      // between them (or with prepeginMaxFee) is caught, not just positivity.
      const expectedClaimValue = await computeMinClaimValue(
        BASE_PREPARE_PEGIN_PARAMS.vaultCoreVersion,
        BASE_PREPARE_PEGIN_PARAMS.vaultKeeperBtcPubkeys.length,
        BASE_PREPARE_PEGIN_PARAMS.universalChallengerBtcPubkeys.length,
        BASE_PREPARE_PEGIN_PARAMS.councilQuorum,
        BASE_PREPARE_PEGIN_PARAMS.councilSize,
        12n,
      );
      const expectedPeginMaxFee = await computeMinPeginFee(
        BASE_PREPARE_PEGIN_PARAMS.vaultCoreVersion,
        BASE_PREPARE_PEGIN_PARAMS.vaultKeeperBtcPubkeys.length,
        BASE_PREPARE_PEGIN_PARAMS.universalChallengerBtcPubkeys.length,
        BASE_PREPARE_PEGIN_PARAMS.minPeginFeeRate,
      );
      expect(expectedClaimValue).not.toBe(expectedPeginMaxFee);

      expect(approvedTerms?.vaults).toHaveLength(2);
      approvedTerms?.vaults.forEach((vault, index) => {
        expect(vault.htlcVout).toBe(index);
        expect(vault.vaultProviderBtcPubkey).toBe(
          BASE_PREPARE_PEGIN_PARAMS.vaultProviderBtcPubkey,
        );
        expect(vault.peginAmount).toBe(vaultAmounts[index]);
        // The CEILING the registration calldata carries: floor(vaultAmount *
        // (quoted 250 + 25 headroom) / 10_000) — not the quoted commission.
        expect(vault.commissionFee).toBe(
          (vaultAmounts[index] *
            BigInt(BASE_PREPARE_PEGIN_PARAMS.commissionBps + 25)) /
            10_000n,
        );
        expect(vault.peginMaxFee).toBe(expectedPeginMaxFee);
        expect(vault.depositorClaimValue).toBe(expectedClaimValue);
      });
    });

    it("rejects before any device call when validateDepositTerms refuses the provisional terms", async () => {
      // T4 (#2110): an envelope violation must cost zero device ceremonies —
      // today it is discovered only after the physical Screen-1 approval.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const deriveSpy = vi.fn(btcWallet.deriveContextHash.bind(btcWallet));
      const signPsbtSpy = vi.fn(btcWallet.signPsbt.bind(btcWallet));
      const signPsbtsSpy = vi.fn(btcWallet.signPsbts.bind(btcWallet));
      const approveSpy = vi.fn(async () => {});
      const capableWallet = Object.assign(btcWallet, {
        deriveContextHash: deriveSpy,
        signPsbt: signPsbtSpy,
        signPsbts: signPsbtsSpy,
        approveDepositTerms: approveSpy,
        validateDepositTerms: vi.fn(async () => {
          throw new DepositTermsRejectedError(
            "Deposit terms outside the device-supported range: protocolFeeRate",
          );
        }),
        getChangeAddress: async () => TEST_CHANGE_ADDRESS,
      });
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet: capableWallet,
        ethWallet: new MockEthereumWallet() as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toMatchObject({
        name: "DepositTermsRejectedError",
        reason: "device-envelope",
      });

      expect(capableWallet.validateDepositTerms).toHaveBeenCalledOnce();
      expect(deriveSpy).not.toHaveBeenCalled();
      expect(approveSpy).not.toHaveBeenCalled();
      expect(signPsbtSpy).not.toHaveBeenCalled();
      expect(signPsbtsSpy).not.toHaveBeenCalled();
    });

    it("validates provisional terms before the derive and approves the final terms identical except the txid", async () => {
      const callOrder: string[] = [];
      let validatedTerms: DepositTerms | undefined;
      let approvedTerms: DepositTerms | undefined;
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const originalDerive = btcWallet.deriveContextHash.bind(btcWallet);
      const capableWallet = Object.assign(btcWallet, {
        deriveContextHash: async (appName: string, context: string) => {
          callOrder.push("deriveContextHash");
          return originalDerive(appName, context);
        },
        validateDepositTerms: vi.fn(async (terms: DepositTerms) => {
          callOrder.push("validateDepositTerms");
          validatedTerms = terms;
        }),
        approveDepositTerms: vi.fn(async (terms: DepositTerms) => {
          callOrder.push("approveDepositTerms");
          approvedTerms = terms;
        }),
        getChangeAddress: async () => TEST_CHANGE_ADDRESS,
      });
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet: capableWallet,
        ethWallet: new MockEthereumWallet() as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      // The validate-only pre-check runs BEFORE the first device screen.
      expect(capableWallet.validateDepositTerms).toHaveBeenCalledOnce();
      const validateIdx = callOrder.indexOf("validateDepositTerms");
      const deriveIdx = callOrder.indexOf("deriveContextHash");
      expect(validateIdx).toBeGreaterThanOrEqual(0);
      expect(deriveIdx).toBeGreaterThan(validateIdx);

      // The provisional txid is the all-zero placeholder and never reaches the
      // device: approveDepositTerms (the only device-bound terms call) gets
      // the real Pre-PegIn txid instead.
      expect(validatedTerms?.prepeginTxid).toBe("00".repeat(32));
      expect(approvedTerms?.prepeginTxid).toBe(
        result.transaction.prePeginTxid.replace(/^0x/i, "").toLowerCase(),
      );
      expect(approvedTerms?.prepeginTxid).not.toBe(
        validatedTerms?.prepeginTxid,
      );

      // Every other field of the validated provisional terms must equal the
      // approved terms — the pre-check validated what the device later shows.
      expect({
        ...validatedTerms,
        prepeginTxid: approvedTerms!.prepeginTxid,
      }).toEqual(approvedTerms);
    });

    it("keeps the provisional terms identical to the approved terms except the txid across a 2-vault batch", async () => {
      let validatedTerms: DepositTerms | undefined;
      let approvedTerms: DepositTerms | undefined;
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const capableWallet = Object.assign(btcWallet, {
        validateDepositTerms: vi.fn(async (terms: DepositTerms) => {
          validatedTerms = terms;
        }),
        approveDepositTerms: vi.fn(async (terms: DepositTerms) => {
          approvedTerms = terms;
        }),
        getChangeAddress: async () => TEST_CHANGE_ADDRESS,
      });
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet: capableWallet,
        ethWallet: new MockEthereumWallet() as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await manager.preparePegin({
        // Distinct amounts so a per-vault projection swap is observable.
        amounts: [TEST_AMOUNTS.PEGIN, TEST_AMOUNTS.PEGIN_MEDIUM],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      // The per-vault projection (vault groups, commission fees, htlcVout
      // ordering) must already be final in the provisional terms.
      expect(validatedTerms?.prepeginTxid).toBe("00".repeat(32));
      expect(validatedTerms?.vaults.map((v) => v.peginAmount)).toEqual([
        TEST_AMOUNTS.PEGIN,
        TEST_AMOUNTS.PEGIN_MEDIUM,
      ]);
      expect({
        ...validatedTerms,
        prepeginTxid: approvedTerms!.prepeginTxid,
      }).toEqual(approvedTerms);
    });

    it("throws when the commit pass diverges from the sizing pass on depositorClaimValue", async () => {
      // The provisional pre-check validated the sizing-build value; a commit
      // pass that computes a different one must fail, not ship unvalidated.
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet: new MockBitcoinWallet({ publicKeyHex: TEST_KEYS.DEPOSITOR }),
        ethWallet: new MockEthereumWallet() as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      let prePeginCalls = 0;
      prePeginTamper.fn = (result) => {
        prePeginCalls += 1;
        return prePeginCalls === 2
          ? { ...result, depositorClaimValue: result.depositorClaimValue + 1n }
          : result;
      };
      try {
        await expect(
          manager.preparePegin({
            amounts: [TEST_AMOUNTS.PEGIN],
            ...BASE_PREPARE_PEGIN_PARAMS,
          }),
        ).rejects.toThrow(/sizing\/commit divergence/i);
      } finally {
        prePeginTamper.fn = null;
      }
    });

    it("throws when the commit pass diverges from the sizing pass on minPeginFee", async () => {
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet: new MockBitcoinWallet({ publicKeyHex: TEST_KEYS.DEPOSITOR }),
        ethWallet: new MockEthereumWallet() as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      let prePeginCalls = 0;
      prePeginTamper.fn = (result) => {
        prePeginCalls += 1;
        return prePeginCalls === 2
          ? { ...result, minPeginFee: result.minPeginFee + 1n }
          : result;
      };
      try {
        await expect(
          manager.preparePegin({
            amounts: [TEST_AMOUNTS.PEGIN],
            ...BASE_PREPARE_PEGIN_PARAMS,
          }),
        ).rejects.toThrow(/sizing\/commit divergence/i);
      } finally {
        prePeginTamper.fn = null;
      }
    });

    it("is a no-op for wallets without approveDepositTerms", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      // The proof is the flow completing above without throwing — preparePegin
      // would raise "not a function" if it called the absent method.
      expect(result.depositTerms).toBeDefined();
      expect(result.depositTerms.vaults).toHaveLength(1);
    });

    it("throws when the funded Pre-PegIn fee diverges from the sizing-pass fee", async () => {
      // depositTerms.prepeginMaxFee publishes sizing.fee as a hardware signing
      // bound — a funded tx paying a different fee must be refused, not shipped.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Corrupt only the COMMIT pass (second buildPrePeginPsbt call) — the
      // sizing pass must stay honest so sizing.fee is the real baseline.
      let prePeginCalls = 0;
      prePeginTamper.fn = (result) => {
        prePeginCalls += 1;
        return prePeginCalls === 2
          ? { ...result, totalOutputValue: result.totalOutputValue + 1n }
          : result;
      };
      try {
        await expect(
          manager.preparePegin({
            amounts: [TEST_AMOUNTS.PEGIN],
            ...BASE_PREPARE_PEGIN_PARAMS,
          }),
        ).rejects.toThrow(/funded fee/i);
      } finally {
        prePeginTamper.fn = null;
      }
    });
  });

  describe("Wallet integration", () => {
    it("should use wallet public key for depositor", async () => {
      const customPubkey = TEST_KEYS.VAULT_KEEPER_2;
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: customPubkey,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const getPublicKeySpy = vi.spyOn(btcWallet, "getPublicKeyHex");

      await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
        // changeAddress must be derived from the wallet's signing key
        // (audit #200 binding check).
        changeAddress: deriveTaprootAddress(customPubkey, "signet"),
      });

      expect(getPublicKeySpy).toHaveBeenCalled();
    });

    it("should handle wallet errors gracefully", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
        shouldFailSigning: true,
      });
      const ethWallet = new MockEthereumWallet();

      btcWallet.getPublicKeyHex = async () => {
        throw new Error("Wallet connection failed");
      };

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow("Wallet connection failed");
    });
  });

  describe("signProofOfPossession", () => {
    // A REAL two-item P2WPKH witness for the PoP message the manager under
    // test builds — `verifyPopWitness` now cryptographically verifies it
    // (vaultd's message.rs:107-133), so injected fixtures must be valid.
    async function realPopWitnessHex(
      ethWallet: MockEthereumWallet,
    ): Promise<string> {
      const popMessage = `${ethWallet.account!.address.toLowerCase()}:${TEST_CHAIN.id}:pegin:${TEST_CONTRACT_ADDRESS.toLowerCase()}`;
      const signed = await new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      }).signMessage(popMessage, "bip322-simple");
      return signed.slice(2);
    }

    it("returns signature bound to connected ETH and BTC identities", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const signMessageSpy = vi.spyOn(btcWallet, "signMessage");

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();

      expect(signMessageSpy).toHaveBeenCalledTimes(1);
      expect(signMessageSpy.mock.calls[0][1]).toBe("bip322-simple");
      expect(pop.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
      expect(pop.depositorEthAddress).toBe(ethWallet.account!.address);
      expect(pop.btcPopSignature.startsWith("0x")).toBe(true);
      expect(pop.btcPopSignature).toMatch(/^0x[0-9a-f]+$/);
    });

    it("strips 0x prefix from depositor BTC pubkey", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: `0x${TEST_KEYS.DEPOSITOR}`,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
    });

    it("lowercases 0x-prefixed hex wallet output", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const witnessHex = await realPopWitnessHex(ethWallet);
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce(
        `0x${witnessHex.toUpperCase()}`,
      );

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.btcPopSignature).toBe(`0x${witnessHex}`);
    });

    it("rejects wallet output that is not a decodable witness", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("0xDEADBEEF");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /proof of possession witness/,
      );
    });

    it("throws when the wallet returns a P2TR PoP whose signature does not verify", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      // 0x01 0x40 ‖ 64 zero bytes: structurally valid, signature is not.
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce(
        `0x0140${"00".repeat(64)}`,
      );
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /proof of possession signature does not verify/,
      );
    });

    it("verifies a two-item (P2WPKH) PoP witness and lets it through", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const witnessHex = await realPopWitnessHex(ethWallet);
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce(
        `0x${witnessHex}`,
      );

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.btcPopSignature).toBe(`0x${witnessHex}`);
    });

    it("throws when the wallet returns a P2WPKH PoP whose signature does not verify", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      // Flip a hex digit inside the DER r value (offset 20 of the witness).
      const witnessHex = await realPopWitnessHex(ethWallet);
      const tampered =
        witnessHex.slice(0, 20) +
        (witnessHex[20] === "0" ? "1" : "0") +
        witnessHex.slice(21);
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce(`0x${tampered}`);

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /proof of possession signature does not verify/,
      );
    });

    it("rejects an empty signature from the wallet", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(/empty/i);
    });

    it("rejects a malformed (non-canonical) base64 signature", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      // "AB==" decodes to 1 byte but canonical encoding would be "AA==".
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("AB==");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(/base64/i);
    });

    it("rejects a malformed hex signature", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("0xZZ");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(/hex/i);
    });

    it("treats unprefixed hex-looking output as hex, not base64", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const witnessHex = await realPopWitnessHex(ethWallet);
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce(witnessHex);

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.btcPopSignature).toBe(`0x${witnessHex}`);
    });

    it("accepts a compressed sec1 pubkey and drops the prefix byte", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: `02${TEST_KEYS.DEPOSITOR}`,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
    });

    it("rejects a BTC pubkey of non-standard length", async () => {
      // 40 hex chars — neither x-only, compressed, nor uncompressed.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: "ab".repeat(20),
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /public key length/i,
      );
    });

    it("throws when ETH wallet has no account", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      (ethWallet as any).account = undefined;

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /wallet account not found/i,
      );
    });
  });

  describe("registerPeginOnChain", () => {
    async function makeManagerWithPop() {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();
      return { manager, btcWallet, ethWallet, popSignature };
    }

    it("should call ethWallet.sendTransaction with encoded contract data", async () => {
      const { manager, ethWallet, popSignature } = await makeManagerWithPop();
      const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");

      const result = await manager.registerPeginOnChain({
        unsignedPrePeginTx: "0100000000010000000000",
        depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        hashlock: MOCK_HASHLOCK,
        htlcVout: 0,
        depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
        depositorWotsPkHash: MOCK_WOTS_PK_HASH,
        popSignature,
        expectedFingerprint: FINGERPRINT,
      });

      expect(sendTxSpy).toHaveBeenCalled();
      const txRequest = sendTxSpy.mock.calls[0][0];
      expect(txRequest.to).toBe(TEST_CONTRACT_ADDRESS);
      expect(txRequest.data).toBeDefined();
      expect(txRequest.data).toContain("0x");

      expect(result.ethTxHash.startsWith("0x")).toBe(true);
      expect(result.vaultId.startsWith("0x")).toBe(true);
      expect(result).not.toHaveProperty("btcPopSignature");
    });

    it("requires quotedCommissionBps at registration for approval-capable wallets", async () => {
      // The device froze the commission ceiling from the quote at approval;
      // the chain-current fallback could exceed it, so it is refused.
      const { manager, btcWallet, popSignature } = await makeManagerWithPop();
      const approvalCapable = btcWallet as unknown as Record<string, unknown>;
      approvalCapable.approveDepositTerms = async () => {};
      approvalCapable.getChangeAddress = async () => TEST_CHANGE_ADDRESS;

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
          // quotedCommissionBps deliberately omitted
        }),
      ).rejects.toThrow(/quotedCommissionBps is required/);
    });

    it("should throw when ETH wallet is connected to a different account than the PoP", async () => {
      const { manager, ethWallet, popSignature } = await makeManagerWithPop();
      // Simulate account switch between signing PoP and submitting.
      (ethWallet as any).account = {
        ...ethWallet.account,
        address: "0x1111111111111111111111111111111111111111",
      };

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
        }),
      ).rejects.toThrow(/Proof of possession/i);
    });

    it("should throw when BTC wallet is connected to a different pubkey than the PoP", async () => {
      const { manager, btcWallet, popSignature } = await makeManagerWithPop();
      // Simulate BTC wallet swap between signing PoP and submitting.
      vi.spyOn(btcWallet, "getPublicKeyHex").mockResolvedValue(
        TEST_KEYS.VAULT_KEEPER_1,
      );

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
        }),
      ).rejects.toThrow(/BTC wallet is currently connected/i);
    });

    it("should handle ETH wallet transaction failure", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet({
        shouldFailOperations: true,
      });
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      // Produce popSignature while the wallet is still healthy for signing;
      // the mock only fails ETH ops, not BTC signing.
      const popSignature = await manager.signProofOfPossession();

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
        }),
      ).rejects.toThrow(/Mock transaction failed/);
    });

    it("should handle hex-prefixed and non-prefixed inputs", async () => {
      const { manager, ethWallet, popSignature } = await makeManagerWithPop();
      const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");

      await manager.registerPeginOnChain({
        unsignedPrePeginTx: "0x0100000000010000000000",
        depositorSignedPeginTx: `0x${MOCK_DEPOSITOR_SIGNED_PEGIN_TX}`,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        hashlock: MOCK_HASHLOCK,
        htlcVout: 0,
        depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
        depositorWotsPkHash: MOCK_WOTS_PK_HASH,
        popSignature,
        expectedFingerprint: FINGERPRINT,
      });
      expect(sendTxSpy).toHaveBeenCalled();

      sendTxSpy.mockClear();
      await manager.registerPeginOnChain({
        unsignedPrePeginTx: "0100000000010000000000",
        depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        hashlock: MOCK_HASHLOCK,
        htlcVout: 0,
        depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
        depositorWotsPkHash: MOCK_WOTS_PK_HASH,
        popSignature,
        expectedFingerprint: FINGERPRINT,
      });
      expect(sendTxSpy).toHaveBeenCalled();

      sendTxSpy.mockClear();
      await manager.registerPeginOnChain({
        unsignedPrePeginTx: "0X0100000000010000000000",
        depositorSignedPeginTx: `0X${MOCK_DEPOSITOR_SIGNED_PEGIN_TX}`,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        hashlock: MOCK_HASHLOCK,
        htlcVout: 0,
        depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
        depositorWotsPkHash: MOCK_WOTS_PK_HASH,
        popSignature,
        expectedFingerprint: FINGERPRINT,
      });
      expect(sendTxSpy).toHaveBeenCalled();
    });

    it("should throw when transaction receipt status is reverted", async () => {
      vi.mocked(
        TEST_PUBLIC_CLIENT.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        status: "reverted",
        transactionHash: `0x${"ab".repeat(32)}`,
      } as never);

      const { manager, popSignature } = await makeManagerWithPop();

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
        }),
      ).rejects.toThrow(/Transaction reverted/);
    });

    describe("resolveMaxAcceptableCommissionBps (boundary cases)", () => {
      // The shared TEST_PUBLIC_CLIENT.readContract mock is reset to its
      // default after each case so per-test overrides don't leak.
      const DEFAULT_READ_CONTRACT_IMPL = ({
        functionName,
      }: {
        functionName: string;
      }) => {
        if (functionName === "getPegInFee") return Promise.resolve(0n);
        if (functionName === "getVaultProviderCommission")
          return Promise.resolve(0);
        return Promise.resolve({ depositor: zeroAddress });
      };

      afterEach(() => {
        vi.mocked(TEST_PUBLIC_CLIENT.readContract).mockImplementation(
          DEFAULT_READ_CONTRACT_IMPL,
        );
      });

      // Decode the submitPeginRequest call data emitted by registerPeginOnChain
      // and return the encoded maxAcceptableCommissionBps (7th arg, 0-indexed 6).
      async function captureMaxAcceptableCommissionBps(
        currentBpsMockReturn: unknown,
        quotedCommissionBps?: number,
      ): Promise<number> {
        const readContractMock = vi.mocked(TEST_PUBLIC_CLIENT.readContract);
        readContractMock.mockImplementation(
          ({ functionName }: { functionName: string }) => {
            if (functionName === "getPegInFee") return Promise.resolve(0n);
            if (functionName === "getVaultProviderCommission")
              return Promise.resolve(currentBpsMockReturn);
            return Promise.resolve({ depositor: zeroAddress });
          },
        );

        const { manager, ethWallet, popSignature } = await makeManagerWithPop();
        const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");

        await manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
          quotedCommissionBps,
        });

        const txData = sendTxSpy.mock.calls[0][0].data as `0x${string}`;
        const decoded = decodeFunctionData({
          abi: BTCVaultRegistryABI,
          data: txData,
        });
        // submitPeginRequest args: [depositorEthAddress, depositorBtcPubkeyHex,
        // btcPopSignature, unsignedPrePeginTxHex, depositorSignedPeginTxHex,
        // vaultProvider, maxAcceptableCommissionBps, hashlock, htlcVout,
        // payoutScriptPubKey, depositorWotsPkHash]
        expect(decoded.functionName).toBe("submitPeginRequest");
        return Number((decoded.args as readonly unknown[])[6]);
      }

      it("returns 25 when currentBps is 0 (HEADROOM only)", async () => {
        expect(await captureMaxAcceptableCommissionBps(0)).toBe(25);
      });

      it("returns currentBps + HEADROOM just below the cap (9974 -> 9999)", async () => {
        expect(await captureMaxAcceptableCommissionBps(9974)).toBe(9999);
      });

      it("clamps to the 9999 cap when currentBps + HEADROOM would exceed it (9975 -> 9999)", async () => {
        expect(await captureMaxAcceptableCommissionBps(9975)).toBe(9999);
      });

      it("clamps to 9999 at the contract maximum (9999 -> 9999)", async () => {
        expect(await captureMaxAcceptableCommissionBps(9999)).toBe(9999);
      });

      it("anchors to quoted + HEADROOM when quotedCommissionBps is supplied and chain is within drift", async () => {
        expect(await captureMaxAcceptableCommissionBps(110, 100)).toBe(125);
      });

      it("anchors to quoted + HEADROOM even when chain reports below quote (no race-down adjustment)", async () => {
        expect(await captureMaxAcceptableCommissionBps(50, 100)).toBe(125);
      });

      it("throws when chain drifted past quoted + HEADROOM since quote-display", async () => {
        const readContractMock = vi.mocked(TEST_PUBLIC_CLIENT.readContract);
        readContractMock.mockImplementation(
          ({ functionName }: { functionName: string }) => {
            if (functionName === "getPegInFee") return Promise.resolve(0n);
            if (functionName === "getVaultProviderCommission")
              return Promise.resolve(200);
            return Promise.resolve({ depositor: zeroAddress });
          },
        );
        const { manager, popSignature } = await makeManagerWithPop();

        await expect(
          manager.registerPeginOnChain({
            unsignedPrePeginTx: "0100000000010000000000",
            depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
            vaultProvider: TEST_CONTRACT_ADDRESS,
            hashlock: MOCK_HASHLOCK,
            htlcVout: 0,
            depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
            depositorWotsPkHash: MOCK_WOTS_PK_HASH,
            popSignature,
            expectedFingerprint: FINGERPRINT,
            quotedCommissionBps: 100,
          }),
        ).rejects.toThrow(/commission changed since quote/);
      });
    });
  });

  describe("registerPeginBatchOnChain", () => {
    const BASE_UNSIGNED_PRE_PEGIN = "0100000000010000000000";
    const baseRequest = {
      depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
      hashlock: MOCK_HASHLOCK,
      depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
      depositorWotsPkHash: MOCK_WOTS_PK_HASH,
    } as const;

    it("rejects a batch when ETH wallet switches after PoP was signed", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      (ethWallet as any).account = {
        ...ethWallet.account,
        address: "0x1111111111111111111111111111111111111111",
      };

      await expect(
        manager.registerPeginBatchOnChain({
          vaultProvider: TEST_CONTRACT_ADDRESS,
          unsignedPrePeginTx: BASE_UNSIGNED_PRE_PEGIN,
          popSignature,
          expectedFingerprint: FINGERPRINT,
          requests: [
            {
              ...baseRequest,
              htlcVout: 0,
              depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
            },
            {
              ...baseRequest,
              htlcVout: 1,
              depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX_ALT,
              hashlock: MOCK_HASHLOCK_ALT,
            },
          ],
        }),
      ).rejects.toThrow(/Proof of possession/i);
    });

    it("rejects a batch when BTC wallet switches after PoP was signed", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      vi.spyOn(btcWallet, "getPublicKeyHex").mockResolvedValue(
        TEST_KEYS.VAULT_KEEPER_1,
      );

      await expect(
        manager.registerPeginBatchOnChain({
          vaultProvider: TEST_CONTRACT_ADDRESS,
          unsignedPrePeginTx: BASE_UNSIGNED_PRE_PEGIN,
          popSignature,
          expectedFingerprint: FINGERPRINT,
          requests: [
            {
              ...baseRequest,
              htlcVout: 0,
              depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
            },
            {
              ...baseRequest,
              htlcVout: 1,
              depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX_ALT,
              hashlock: MOCK_HASHLOCK_ALT,
            },
          ],
        }),
      ).rejects.toThrow(/BTC wallet is currently connected/i);
    });

    const MOCK_HASHLOCK_ALT = `0x${"ef".repeat(32)}` as `0x${string}`;

    it("submits submitPeginRequestBatch encoding PoP + each request", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      const result = await manager.registerPeginBatchOnChain({
        vaultProvider: TEST_CONTRACT_ADDRESS,
        unsignedPrePeginTx: BASE_UNSIGNED_PRE_PEGIN,
        popSignature,
        expectedFingerprint: FINGERPRINT,
        requests: [
          {
            ...baseRequest,
            htlcVout: 0,
            depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          },
          {
            ...baseRequest,
            htlcVout: 1,
            depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX_ALT,
            hashlock: MOCK_HASHLOCK_ALT,
          },
        ],
      });

      expect(result).not.toHaveProperty("btcPopSignature");
      expect(result.vaults).toHaveLength(2);

      expect(sendTxSpy).toHaveBeenCalledTimes(1);
      const sentData = sendTxSpy.mock.calls[0][0].data as string;
      expect(sentData).toContain(popSignature.btcPopSignature.slice(2));
      // Depositor BTC pubkey comes from PopSignature, not per-request.
      expect(sentData).toContain(popSignature.depositorBtcPubkey);
    });
  });

  describe("signAndBroadcast", () => {
    it("should reject invalid transaction hex", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.signAndBroadcast({
          fundedPrePeginTxHex: "invalid-hex",
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        }),
      ).rejects.toThrow();
    });

    it("aborts before broadcast when the rebind helper rejects the wallet's PSBT", async () => {
      const { assertPsbtUnsignedTxMatches } = await import(
        "../../primitives/psbt/assertPsbtUnsignedTxMatches"
      );
      const rebind = vi.mocked(assertPsbtUnsignedTxMatches);

      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const prepared = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      // Provide localPrevouts so we don't hit the mempool. The funded tx's
      // input set is a subset of TEST_UTXOS.
      const localPrevouts = TEST_UTXOS.reduce<
        Record<string, { scriptPubKey: string; value: number }>
      >((acc, u) => {
        acc[`${u.txid}:${u.vout}`] = {
          scriptPubKey: u.scriptPubKey,
          value: u.value,
        };
        return acc;
      }, {});

      // Fail the next rebind call so signAndBroadcast aborts before
      // finalize/extract/pushTx. mockClear keeps prior preparePegin calls
      // from leaking into our assertion.
      rebind.mockClear();
      rebind.mockImplementationOnce(() => {
        throw new Error("output 0 scriptPubKey differs");
      });

      await expect(
        manager.signAndBroadcast({
          fundedPrePeginTxHex: prepared.transaction.fundedPrePeginTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          localPrevouts,
        }),
      ).rejects.toThrow(/scriptPubKey differs/);

      expect(rebind).toHaveBeenCalledTimes(1);
    });

    it("verifies the returned key-path signatures right after the rebind and aborts before broadcast when they fail", async () => {
      const { assertPsbtUnsignedTxMatches } = await import(
        "../../primitives/psbt/assertPsbtUnsignedTxMatches"
      );
      const { assertReturnedKeyPathSignatures } = await import(
        "../../primitives/psbt/verifyKeyPathSchnorrSignature"
      );
      const rebind = vi.mocked(assertPsbtUnsignedTxMatches);
      const verifyKeyPath = vi.mocked(assertReturnedKeyPathSignatures);

      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      // Return the requested PSBT unchanged so the rebind (stubbed) and the
      // verifier (stubbed) both see a parseable pair.
      vi.spyOn(btcWallet, "signPsbt").mockImplementation(
        async (psbtHex: string) => psbtHex,
      );
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const prepared = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      const localPrevouts = TEST_UTXOS.reduce<
        Record<string, { scriptPubKey: string; value: number }>
      >((acc, u) => {
        acc[`${u.txid}:${u.vout}`] = {
          scriptPubKey: u.scriptPubKey,
          value: u.value,
        };
        return acc;
      }, {});

      rebind.mockClear();
      verifyKeyPath.mockClear();
      verifyKeyPath.mockImplementationOnce(() => {
        throw new Error("key-path signature for input 0 does not verify");
      });

      await expect(
        manager.signAndBroadcast({
          fundedPrePeginTxHex: prepared.transaction.fundedPrePeginTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          localPrevouts,
        }),
      ).rejects.toThrow(/does not verify/);

      expect(rebind).toHaveBeenCalledTimes(1);
      expect(verifyKeyPath).toHaveBeenCalledTimes(1);
      const [{ requestedPsbtHex, returnedPsbtHex }] =
        verifyKeyPath.mock.calls[0];
      expect(returnedPsbtHex).toBe(requestedPsbtHex); // the spy echoed the request
    });

    it("runs the intent ceremony (derive then approve) before signing for an approval wallet", async () => {
      const { assertPsbtUnsignedTxMatches } = await import(
        "../../primitives/psbt/assertPsbtUnsignedTxMatches"
      );
      const rebind = vi.mocked(assertPsbtUnsignedTxMatches);

      // An approval-capable wallet: MockBitcoinWallet already derives; add
      // approveDepositTerms and record call order relative to signPsbt.
      const order: string[] = [];
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const deriveSpy = vi
        .spyOn(btcWallet, "deriveContextHash")
        .mockImplementation(async () => {
          order.push("derive");
          return "ab".repeat(32);
        });
      vi.spyOn(btcWallet, "signPsbt").mockImplementation(
        async (psbtHex: string) => {
          order.push("sign");
          return psbtHex;
        },
      );
      const approveSpy = vi.fn(async () => {
        order.push("approve");
      });
      const approvalCapable = btcWallet as unknown as {
        approveDepositTerms: typeof approveSpy;
        getChangeAddress: () => Promise<string>;
      };
      approvalCapable.approveDepositTerms = approveSpy;
      approvalCapable.getChangeAddress = async () => TEST_CHANGE_ADDRESS;

      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const prepared = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });
      const localPrevouts = TEST_UTXOS.reduce<
        Record<string, { scriptPubKey: string; value: number }>
      >((acc, u) => {
        acc[`${u.txid}:${u.vout}`] = {
          scriptPubKey: u.scriptPubKey,
          value: u.value,
        };
        return acc;
      }, {});

      // Terms must match this tx's txid or the ceremony rejects first.
      const fundedTxid = bitcoin.Transaction.fromHex(
        prepared.transaction.fundedPrePeginTxHex,
      ).getId();
      const depositTerms: DepositTerms = {
        vaultCoreVersion: 2,
        protocolFeeRate: 2n,
        timelockPegin: 684,
        timelockAssert: 684,
        timelockRefund: 2016,
        prepeginTxid: fundedTxid,
        prepeginMaxFee: 1500n,
        vaultKeeperBtcPubkeys: ["cc".repeat(32)],
        universalChallengerBtcPubkeys: ["dd".repeat(32)],
        vaults: [
          {
            htlcVout: 0,
            vaultProviderBtcPubkey: "ff".repeat(32),
            peginAmount: 1_000_000n,
            commissionFee: 10_000n,
            depositorClaimValue: 20_000n,
            peginMaxFee: 800n,
          },
        ],
      };

      // Abort at rebind (after signing) so we never hit the network — the
      // ceremony has already run by then, which is what we assert.
      deriveSpy.mockClear();
      order.length = 0;
      rebind.mockClear();
      rebind.mockImplementationOnce(() => {
        throw new Error("stop before broadcast");
      });

      await expect(
        manager.signAndBroadcast({
          fundedPrePeginTxHex: prepared.transaction.fundedPrePeginTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          localPrevouts,
          depositTerms,
        }),
      ).rejects.toThrow(/stop before broadcast/);

      expect(approveSpy).toHaveBeenCalledWith(depositTerms);
      // derive → approve → sign, exactly.
      expect(order).toEqual(["derive", "approve", "sign"]);
    });

    it("propagates an approval rejection unwrapped, without signing", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "deriveContextHash").mockResolvedValue(
        "ab".repeat(32),
      );
      const signSpy = vi.spyOn(btcWallet, "signPsbt");
      // preparePegin is itself a re-approval site, so approval must succeed
      // there; the rejection is injected only for the broadcast ceremony below.
      const approveSpy = vi.fn(async () => {});
      const approvalCapable = btcWallet as unknown as {
        approveDepositTerms: typeof approveSpy;
        getChangeAddress: () => Promise<string>;
      };
      approvalCapable.approveDepositTerms = approveSpy;
      approvalCapable.getChangeAddress = async () => TEST_CHANGE_ADDRESS;

      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const prepared = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });
      const localPrevouts = TEST_UTXOS.reduce<
        Record<string, { scriptPubKey: string; value: number }>
      >((acc, u) => {
        acc[`${u.txid}:${u.vout}`] = {
          scriptPubKey: u.scriptPubKey,
          value: u.value,
        };
        return acc;
      }, {});
      const fundedTxid = bitcoin.Transaction.fromHex(
        prepared.transaction.fundedPrePeginTxHex,
      ).getId();
      const depositTerms: DepositTerms = {
        vaultCoreVersion: 2,
        protocolFeeRate: 2n,
        timelockPegin: 684,
        timelockAssert: 684,
        timelockRefund: 2016,
        prepeginTxid: fundedTxid,
        prepeginMaxFee: 1500n,
        vaultKeeperBtcPubkeys: ["cc".repeat(32)],
        universalChallengerBtcPubkeys: ["dd".repeat(32)],
        vaults: [
          {
            htlcVout: 0,
            vaultProviderBtcPubkey: "ff".repeat(32),
            peginAmount: 1_000_000n,
            commissionFee: 10_000n,
            depositorClaimValue: 20_000n,
            peginMaxFee: 800n,
          },
        ],
      };

      // The manager must not swallow or re-wrap the typed rejection, and must
      // never reach signing once approval fails.
      const rejection = new DepositTermsRejectedError("declined on device");
      approveSpy.mockClear();
      approveSpy.mockRejectedValueOnce(rejection);
      signSpy.mockClear();

      await expect(
        manager.signAndBroadcast({
          fundedPrePeginTxHex: prepared.transaction.fundedPrePeginTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          localPrevouts,
          depositTerms,
        }),
      ).rejects.toBe(rejection);

      expect(signSpy).not.toHaveBeenCalled();
    });
  });

  describe("Deterministic output", () => {
    it("should produce consistent results for same inputs", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const params = {
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      };

      const result1 = await manager.preparePegin(params);
      const result2 = await manager.preparePegin(params);

      expect(result1.transaction.perVault[0].vaultScriptPubKey).toBe(
        result2.transaction.perVault[0].vaultScriptPubKey,
      );
      expect(result1.transaction.perVault[0].peginTxid).toBe(
        result2.transaction.perVault[0].peginTxid,
      );
      expect(result1.transaction.fee).toBe(result2.transaction.fee);

      // Determinism extends to derived secrets: same wallet + same inputs
      // yield the same per-vault HTLC preimage and WOTS key hash.
      expect(result1.derivedSecrets.htlcSecretHexes).toEqual(
        result2.derivedSecrets.htlcSecretHexes,
      );
      expect(result1.derivedSecrets.wotsPkHashes).toEqual(
        result2.derivedSecrets.wotsPkHashes,
      );

      // Sizing pass must pick the same UTXOs across runs — the commit
      // pass relies on this to pin funding inputs without an explicit
      // override param.
      expect(result1.transaction.selectedUTXOs).toEqual(
        result2.transaction.selectedUTXOs,
      );
    });

    it("should produce different results for different depositors", async () => {
      const btcWallet1 = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const btcWallet2 = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.VAULT_KEEPER_1,
      });
      const ethWallet = new MockEthereumWallet();

      const manager1 = new PeginManager({
        btcNetwork: "signet",
        btcWallet: btcWallet1,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const manager2 = new PeginManager({
        btcNetwork: "signet",
        btcWallet: btcWallet2,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Each wallet needs a changeAddress derived from its own pubkey to
      // satisfy the audit-#200 binding check; only the depositor key differs
      // between the two preparePegin calls.
      const baseParams = {
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_2],
      };

      const result1 = await manager1.preparePegin({
        ...baseParams,
        changeAddress: deriveTaprootAddress(TEST_KEYS.DEPOSITOR, "signet"),
      });
      const result2 = await manager2.preparePegin({
        ...baseParams,
        changeAddress: deriveTaprootAddress(TEST_KEYS.VAULT_KEEPER_1, "signet"),
      });

      expect(result1.transaction.perVault[0].vaultScriptPubKey).not.toBe(
        result2.transaction.perVault[0].vaultScriptPubKey,
      );
    });
  });

  describe("contract invariants", () => {
    it("calls getPublicKeyHex exactly once across the whole flow", async () => {
      // Regression test for the pubkey snapshot consistency contract:
      // sizing, root derivation, and commit signing must all bind to one
      // identity. A second wallet read mid-flow would re-introduce the
      // bug where secrets bind to pubkey A and the commit pass signs
      // under pubkey B.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const getPublicKeyHexSpy = vi.spyOn(btcWallet, "getPublicKeyHex");

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      expect(getPublicKeyHexSpy).toHaveBeenCalledTimes(1);
    });

    it("throws if the commit pass returns a perVault entry with a mismatched htlcVout", async () => {
      // Pin the htlcVout === array-index invariant explicitly. This
      // assertion guards downstream consumers (e.g., per-vault secret
      // lookups by index) against a future WASM output-ordering change.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Reach into the private commit pass and force a shuffled htlcVout.
      const original = (manager as any).preparePeginCommit.bind(manager);
      (manager as any).preparePeginCommit = async (args: any) => {
        const result = await original(args);
        return {
          ...result,
          // Off-by-one: vault 0 reports htlcVout=1, etc. Triggers the
          // invariant assertion in `preparePegin`.
          perVault: result.perVault.map((v: any) => ({
            ...v,
            htlcVout: v.htlcVout + 1,
          })),
        };
      };

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/htlcVout\/index mismatch/);
    });

    it("emits OP_RETURN at vout=N with SHA256(authAnchor) push payload", async () => {
      // Structural binding for the depositor bearer-token flow: the
      // broadcast Pre-PegIn must commit to the auth anchor at a fixed
      // location with a fixed encoding. A drifted layout (different
      // vout, missing OP_RETURN, swapped script-prefix bytes) would let
      // a depositor obtain a token whose on-chain witness doesn't bind
      // their preimage to this Pre-PegIn.
      const { sha256 } = await import("@noble/hashes/sha2.js");
      const bitcoin = await import("bitcoinjs-lib");

      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN, TEST_AMOUNTS.PEGIN_SMALL],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      const tx = bitcoin.Transaction.fromHex(
        result.transaction.fundedPrePeginTxHex,
      );
      const opReturnVout = 2; // vault outputs at 0, 1; OP_RETURN at vaultCount
      const script = tx.outs[opReturnVout].script;

      // OP_RETURN (0x6a) || PUSH32 (0x20) || 32-byte hash
      expect(script.length).toBe(34);
      expect(script[0]).toBe(0x6a);
      expect(script[1]).toBe(0x20);
      expect(tx.outs[opReturnVout].value).toBe(0);

      const pushedHashHex = script.slice(2).toString("hex");
      const expectedHashHex = Buffer.from(
        sha256(Buffer.from(result.derivedSecrets.authAnchorHex, "hex")),
      ).toString("hex");
      expect(pushedHashHex).toBe(expectedHashHex);
    });

    it("refuses to commit-build with sizing-pass placeholder values", async () => {
      // Defense-in-depth against an orchestrator bug where the commit
      // pass receives placeholder zeros instead of real wallet-derived
      // hashlocks or auth anchor. A placeholder-zero hashlock would
      // produce an unspendable HTLC; a placeholder auth anchor would
      // let the depositor reveal a known-public preimage. Fail before
      // signing, not after broadcast.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Force the placeholder all-zero auth-anchor hash to reach the
      // commit pass by mocking expandAuthAnchor to return 32 zero bytes.
      // SHA256(0x00..00) is not the placeholder, so we bypass that and
      // mock the sha256 call too — actually simpler: directly inject by
      // bypassing the orchestrator's substitution via a spy on the
      // private commit method.
      const placeholder = "00".repeat(32);
      const original = (manager as any).preparePeginCommit.bind(manager);
      (manager as any).preparePeginCommit = async (args: any) =>
        original({ ...args, authAnchorHash: placeholder });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/placeholder auth-anchor hash/);
    });

    it("refuses to commit-build with sizing-pass placeholder hashlock", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const placeholder = "00".repeat(32);
      const original = (manager as any).preparePeginCommit.bind(manager);
      (manager as any).preparePeginCommit = async (args: any) =>
        original({ ...args, hashlocks: [placeholder] });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/placeholder.*hashlock/);
    });

    it("zeros the wallet root if auth-anchor expansion throws mid-flow", async () => {
      // Memory-hygiene guard: `expandPerVaultSecrets` is what normally
      // wipes the root. If `expandAuthAnchor` (which runs first) throws,
      // `expandPerVaultSecrets` never runs — so `preparePegin` itself
      // must wipe the root on the throw path. This pins that contract.
      // Spy on the WASM package — `vault-secrets/index.ts` re-exports
      // `expandAuthAnchor` directly from there with no SDK-side wrapper,
      // so the WASM module owns the live binding.
      const wasmPkg = await import("@babylonlabs-io/babylon-tbv-rust-wasm");
      const expandAuthAnchorSpy = vi.spyOn(wasmPkg, "expandAuthAnchor");
      let capturedRoot: Uint8Array | null = null;
      expandAuthAnchorSpy.mockImplementationOnce(async (root) => {
        // Snapshot the root reference before throwing so the test can
        // verify it gets zeroed by the catch block.
        capturedRoot = root;
        throw new Error("simulated auth-anchor failure");
      });

      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/simulated auth-anchor failure/);

      expect(capturedRoot).not.toBeNull();
      expect(capturedRoot!.every((b) => b === 0)).toBe(true);

      expandAuthAnchorSpy.mockRestore();
    });

    it("throws when the broadcast tx is missing the OP_RETURN output", async () => {
      // Defense against a non-conformant WASM build that fails to emit
      // the OP_RETURN. Without this assertion the depositor would
      // produce a Pre-PegIn whose on-chain content lacks the auth
      // anchor commitment, but the vault flow would still try to mint
      // a bearer token bound to that anchor — the VP rejects, but only
      // after the user has burned BTC fees broadcasting.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Reach into the commit pass and surgically remove the OP_RETURN
      // from the funded tx hex. Triggers the assertion in `preparePegin`.
      const original = (manager as any).preparePeginCommit.bind(manager);
      (manager as any).preparePeginCommit = async (args: any) => {
        const result = await original(args);
        const bitcoin = await import("bitcoinjs-lib");
        const tx = bitcoin.Transaction.fromHex(result.fundedPrePeginTxHex);
        // Drop the OP_RETURN output (vout = vaultCount = 1 in this test).
        tx.outs = tx.outs.filter((_o, i) => i !== 1);
        return {
          ...result,
          fundedPrePeginTxHex: tx.toHex(),
        };
      };

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/auth-anchor OP_RETURN/);
    });
  });

  describe("audit #200: address-binding to signing pubkey", () => {
    function makeManager() {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      return { manager, btcWallet, ethWallet };
    }

    it("preparePegin rejects a changeAddress not derived from the signing pubkey", async () => {
      const { manager } = makeManager();
      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
          changeAddress: FOREIGN_BTC_ADDRESS,
        }),
      ).rejects.toThrow(
        /Pre-PegIn changeAddress .* is not derived from the connected wallet/i,
      );
    });

    it("preparePegin requires an approval wallet's own change address (its change branch, not the receive key)", async () => {
      const { manager, btcWallet } = makeManager();
      // Turn the mock into an approval wallet the same way the signAndBroadcast
      // ceremony test does: attach the capability methods.
      const approval = btcWallet as unknown as {
        approveDepositTerms: (terms: unknown) => Promise<void>;
        getChangeAddress: () => Promise<string>;
      };
      approval.approveDepositTerms = vi.fn(async () => {});
      const walletChange = deriveTaprootAddress(
        TEST_KEYS.VAULT_KEEPER_1,
        "signet",
      ); // any address ≠ the receive address
      approval.getChangeAddress = vi.fn(async () => walletChange);

      // The receive-key change address is now WRONG for an approval wallet.
      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow(/is not the approval wallet's change address/);

      // The wallet's own change address passes the gate (and the flow proceeds to sizing).
      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
          changeAddress: walletChange,
        }),
      ).resolves.toBeDefined();
      expect(approval.getChangeAddress).toHaveBeenCalled();
    });

    it("registerPeginOnChain rejects an explicit payout address not derived from the signing pubkey", async () => {
      const { manager } = makeManager();
      const popSignature = await manager.signProofOfPossession();
      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: FOREIGN_BTC_ADDRESS,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
        }),
      ).rejects.toThrow(
        /BTC payout address .* is not derived from the connected wallet/i,
      );
    });

    it("registerPeginOnChain rejects an opposite-parity P2WPKH address for the same x-only key", async () => {
      // Parity-swap regression: a P2WPKH address derived from `03|x` is a
      // *different* on-chain script than the wallet's `02|x` P2WPKH, but
      // shares the x-only key. If validation only sees the x-only form, the
      // helper tries both 02|x and 03|x and accepts the wrong-parity address
      // — opening the audit-#200 path even after the basic binding check.
      // The fix routes the raw (parity-preserving) pubkey from
      // `assertPopMatchesBtcWallet` into `resolvePayoutScriptPubKey`.
      const xOnly = TEST_KEYS.DEPOSITOR;
      const evenParity = `02${xOnly}`;
      const oddParityWrongAddress = deriveNativeSegwitAddress(
        `03${xOnly}`,
        "signet",
      );

      const btcWallet = new MockBitcoinWallet({ publicKeyHex: evenParity });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: oddParityWrongAddress,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
        }),
      ).rejects.toThrow(
        /BTC payout address .* is not derived from the connected wallet/i,
      );
    });

    it("registerPeginOnChain rejects any P2WPKH payout address when wallet exposes only an x-only key", async () => {
      // Taproot wallets return x-only per the BitcoinWallet interface
      // contract. With only an x-only key in hand, y-parity is unknowable;
      // accepting any P2WPKH derived from 02|x or 03|x would let an attacker
      // bind a script the wallet doesn't control. Both parities must be
      // rejected at the helper level (parity-swap finding follow-up). The
      // diagnostic message points integrators at the actual fix (use P2TR).
      const xOnly = TEST_KEYS.DEPOSITOR;
      const evenAddr = deriveNativeSegwitAddress(`02${xOnly}`, "signet");
      const oddAddr = deriveNativeSegwitAddress(`03${xOnly}`, "signet");

      const btcWallet = new MockBitcoinWallet({ publicKeyHex: xOnly });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      for (const addr of [evenAddr, oddAddr]) {
        await expect(
          manager.registerPeginOnChain({
            unsignedPrePeginTx: "0100000000010000000000",
            depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
            vaultProvider: TEST_CONTRACT_ADDRESS,
            hashlock: MOCK_HASHLOCK,
            htlcVout: 0,
            depositorPayoutBtcAddress: addr,
            depositorWotsPkHash: MOCK_WOTS_PK_HASH,
            popSignature,
            expectedFingerprint: FINGERPRINT,
          }),
        ).rejects.toThrow(/P2WPKH .* x-only public key.*Use a P2TR/i);
      }
    });

    it("registerPeginOnChain falls back to the generic mismatch error for an x-only key paired with a non-P2WPKH bech32 address (P2WSH)", async () => {
      // Regression guard: the diagnostic carve-out must distinguish P2WPKH
      // (witness v0, 20-byte program) from other v0 segwit shapes like
      // P2WSH (32-byte program). A misfire here would tell a user with a
      // P2WSH payout address to "use a P2TR" when the real problem is that
      // their address simply isn't derived from the connected wallet.
      const xOnly = TEST_KEYS.DEPOSITOR;
      const p2wshAddress = bitcoin.payments.p2wsh({
        hash: Buffer.alloc(32, 0xab),
        network: bitcoin.networks.testnet,
      }).address!;
      expect(p2wshAddress.startsWith("tb1q")).toBe(true);

      const btcWallet = new MockBitcoinWallet({ publicKeyHex: xOnly });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress: p2wshAddress,
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
          expectedFingerprint: FINGERPRINT,
        }),
      ).rejects.toThrow(
        /BTC payout address .* is not derived from the connected wallet/i,
      );
    });

    it("registerPeginBatchOnChain rejects when any single request has a foreign payout address", async () => {
      const { manager } = makeManager();
      const popSignature = await manager.signProofOfPossession();
      await expect(
        manager.registerPeginBatchOnChain({
          vaultProvider: TEST_CONTRACT_ADDRESS,
          unsignedPrePeginTx: "0100000000010000000000",
          popSignature,
          expectedFingerprint: FINGERPRINT,
          requests: [
            {
              depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
              hashlock: MOCK_HASHLOCK,
              htlcVout: 0,
              depositorPayoutBtcAddress: TEST_PAYOUT_ADDRESS,
              depositorWotsPkHash: MOCK_WOTS_PK_HASH,
            },
            {
              depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX_ALT,
              hashlock: `0x${"ef".repeat(32)}` as `0x${string}`,
              htlcVout: 1,
              depositorPayoutBtcAddress: FOREIGN_BTC_ADDRESS,
              depositorWotsPkHash: MOCK_WOTS_PK_HASH,
            },
          ],
        }),
      ).rejects.toThrow(
        /BTC payout address .* is not derived from the connected wallet/i,
      );
    });
  });
});
