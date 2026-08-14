/**
 * Cross-path golden for the resume rebuild (#2220 Part 2): the funded tx and
 * DepositTerms are produced by the PRODUCTION build path
 * (`PeginManager.preparePegin` → `createPrePeginTransaction` WASM entry point),
 * then fed through `rebuildDepositTermsCore` (which recomputes sizing and
 * scripts via the STANDALONE WASM entry points). The deep-equality assertion is
 * the only JS-side proof that the two WASM paths agree byte-for-byte — the
 * in-file golden in `rebuildDepositTermsCore.test.ts` builds its fixture from
 * the same calls the core makes, so it cannot see cross-entry-point drift.
 */

import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { zeroAddress, type Address, type Chain, type PublicClient } from "viem";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MockBitcoinWallet, MockEthereumWallet } from "../../../../testing";
import { MEMPOOL_API_URLS } from "../../clients/mempool";
import {
  capMaxAcceptableCommissionBps,
  rebuildDepositTermsCore,
} from "../../deposit-terms";
import { deriveTaprootAddress } from "../../primitives";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import {
  ensureHexPrefix,
  stripHexPrefix,
} from "../../primitives/utils/bitcoin";
import { computeHashlock } from "../../services/htlc";
import type { UTXO } from "../../utils";
import { PeginManager } from "../PeginManager";

// Same mock set as PeginManager.test.ts (the mock wallet cannot produce real
// PSBT signatures) — EXCEPT `btcTxHash`, which stays real: Gate 0 must hash
// the genuine funded tx or the cross-path comparison proves nothing.
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
vi.mock(
  "../../primitives/psbt/assertPsbtUnsignedTxMatches",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../primitives/psbt/assertPsbtUnsignedTxMatches")
      >();
    return { ...actual, assertPsbtUnsignedTxMatches: vi.fn() };
  },
);
vi.mock("../../primitives/psbt/verifyScriptPathSchnorrSignature", () => ({
  assertScriptPathSchnorrSignature: vi.fn(),
}));

const TEST_CHAIN: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.org"] } },
};

const TEST_PUBLIC_CLIENT = {
  estimateGas: vi.fn().mockResolvedValue(100000n),
  getCode: vi.fn().mockResolvedValue("0x"),
  waitForTransactionReceipt: vi.fn().mockResolvedValue({
    status: "success",
    transactionHash: "0x" + "ab".repeat(32),
  }),
  readContract: vi
    .fn()
    .mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "getPegInFee") return Promise.resolve(0n);
      if (functionName === "getVaultProviderCommission")
        return Promise.resolve(0);
      return Promise.resolve({ depositor: zeroAddress });
    }),
} as unknown as PublicClient;

const TEST_KEYS = {
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

const TEST_UTXOS: UTXO[] = [
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000001",
    vout: 0,
    value: 800_000,
    scriptPubKey: `5120${TEST_KEYS.DEPOSITOR}`,
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000002",
    vout: 0,
    value: 800_000,
    scriptPubKey: `5120${TEST_KEYS.VAULT_PROVIDER}`,
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000003",
    vout: 1,
    value: 800_000,
    scriptPubKey: `5120${TEST_KEYS.VAULT_KEEPER_1}`,
  },
];

const TEST_CONTRACT_ADDRESS =
  "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address;

const AMOUNTS = [90_000n, 120_000n];

// Asymmetric counts + fully distinct scalars: identical values would blind the
// deep-compare to swapped arguments or transposed fields on either path.
const PARAMS = {
  vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
  vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1, TEST_KEYS.VAULT_KEEPER_2],
  universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
  timelockPegin: 100,
  timelockAssert: 150,
  timelockRefund: 144,
  protocolFeeRate: 3n,
  minPeginFeeRate: 7n,
  mempoolFeeRate: 10,
  councilQuorum: 2,
  councilSize: 3,
  availableUTXOs: TEST_UTXOS,
  changeAddress: deriveTaprootAddress(TEST_KEYS.DEPOSITOR, "signet"),
  commissionBps: 250,
} as const;

// Fresh path applies `capMaxAcceptableCommissionBps`: quote + 25 bps headroom.
const EXPECTED_MAX_ACCEPTABLE_BPS = capMaxAcceptableCommissionBps(
  PARAMS.commissionBps,
);

const PREVOUT_VALUES = new Map(
  TEST_UTXOS.map((u) => [`${u.txid}:${u.vout}`, BigInt(u.value)]),
);

function sumPrevouts(ins: bitcoin.Transaction["ins"]): bigint {
  let sum = 0n;
  for (const input of ins) {
    const txid = Buffer.from(input.hash).reverse().toString("hex");
    const value = PREVOUT_VALUES.get(`${txid}:${input.index}`);
    if (value === undefined) {
      throw new Error(`Unexpected prevout ${txid}:${input.index}`);
    }
    sum += value;
  }
  return sum;
}

describe("rebuildDepositTermsCore reproduces the production build's DepositTerms", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  it.each([1, 2])(
    "rebuilds terms deep-equal to preparePegin's for vaultCoreVersion %d",
    async (vaultCoreVersion) => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as never,
        ethChain: TEST_CHAIN,
        publicClient: TEST_PUBLIC_CLIENT,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const prepared = await manager.preparePegin({
        amounts: AMOUNTS,
        vaultCoreVersion,
        ...PARAMS,
      });

      // Resume-side sibling data: hashlock = SHA-256(secret), the exact
      // mapping expandPerVaultSecrets committed into the HTLC scripts.
      const siblings = prepared.derivedSecrets.htlcSecretHexes.map(
        (secretHex, i) => ({
          hashlock: stripHexPrefix(computeHashlock(ensureHexPrefix(secretHex))),
          amount: AMOUNTS[i],
        }),
      );

      // Resume-side fee: Σ prevouts − Σ outputs of the funded tx — must equal
      // the fresh path's published sizing fee (PeginManager asserts this
      // invariant internally before returning).
      const tx = bitcoin.Transaction.fromHex(
        stripHexPrefix(prepared.transaction.fundedPrePeginTxHex),
      );
      const fundedTxFee =
        sumPrevouts(tx.ins) -
        tx.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
      expect(fundedTxFee).toBe(prepared.transaction.fee);

      const rebuilt = await rebuildDepositTermsCore({
        vaultCoreVersion,
        siblings,
        fundedPrePeginTxHex: prepared.transaction.fundedPrePeginTxHex,
        depositorBtcPubkey: prepared.depositorBtcPubkey,
        vaultProviderBtcPubkey: PARAMS.vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys: PARAMS.vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys: PARAMS.universalChallengerBtcPubkeys,
        protocolFeeRate: PARAMS.protocolFeeRate,
        minPeginFeeRate: PARAMS.minPeginFeeRate,
        councilQuorum: PARAMS.councilQuorum,
        councilSize: PARAMS.councilSize,
        timelockPegin: PARAMS.timelockPegin,
        timelockAssert: PARAMS.timelockAssert,
        timelockRefund: PARAMS.timelockRefund,
        prepeginTxid: prepared.transaction.prePeginTxid,
        prepeginMaxFee: fundedTxFee,
        maxAcceptableCommissionBps: EXPECTED_MAX_ACCEPTABLE_BPS,
        network: "signet",
      });

      // Full deep-compare, zero exclusions: any drift between the standalone
      // WASM recompute and the production builder shows up here.
      expect(rebuilt).toEqual(prepared.depositTerms);
    },
  );
});
