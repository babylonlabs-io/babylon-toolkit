/**
 * Tests for buildPrePeginPsbt and buildPeginTxFromFundedPrePegin primitives
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { beforeAll, describe, expect, it } from "vitest";

import * as bitcoin from "bitcoinjs-lib";

import {
  buildPrePeginPsbt,
  buildPeginTxFromFundedPrePegin,
  SINGLE_DEPOSIT_HTLC_VOUT,
  type PrePeginParams,
} from "../pegin";
import { fundPeginTransaction } from "../../../utils/transaction/fundPeginTransaction";
import { TEST_AMOUNTS, TEST_KEYS, initializeWasmForTests } from "./helpers";

// Deterministic SHA256 hash commitment (64 hex chars = 32 bytes)
const TEST_HASH_H = "ab".repeat(32);

const TEST_TIMELOCK_REFUND = 50;
const TEST_TIMELOCK_PEGIN = 100;
const TEST_COUNCIL_QUORUM = 2;
const TEST_COUNCIL_SIZE = 3;

function makePrePeginParams(overrides?: Partial<PrePeginParams>): PrePeginParams {
  return {
    depositorPubkey: TEST_KEYS.DEPOSITOR,
    vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
    vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
    universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
    hashlocks: [TEST_HASH_H],
    timelockRefund: TEST_TIMELOCK_REFUND,
    pegInAmount: TEST_AMOUNTS.PEGIN,
    feeRate: 10n,
    numLocalChallengers: 1,
    councilQuorum: TEST_COUNCIL_QUORUM,
    councilSize: TEST_COUNCIL_SIZE,
    network: "signet" as Network,
    ...overrides,
  };
}

describe("buildPrePeginPsbt", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Basic functionality", () => {
    it("should build a valid unfunded Pre-PegIn transaction for signet", async () => {
      const result = await buildPrePeginPsbt(makePrePeginParams());

      expect(result).toHaveProperty("psbtHex");
      expect(result).toHaveProperty("htlcValue");
      expect(result).toHaveProperty("htlcScriptPubKey");
      expect(result).toHaveProperty("htlcAddress");
      expect(result).toHaveProperty("peginAmount");
      expect(result).toHaveProperty("depositorClaimValue");

      expect(typeof result.psbtHex).toBe("string");
      expect(typeof result.htlcValue).toBe("bigint");
      expect(typeof result.htlcScriptPubKey).toBe("string");
      expect(typeof result.htlcAddress).toBe("string");
      expect(typeof result.peginAmount).toBe("bigint");
      expect(typeof result.depositorClaimValue).toBe("bigint");

      expect(result.psbtHex.length).toBeGreaterThan(0);
      expect(result.htlcValue).toBeGreaterThan(0n);
      expect(result.htlcScriptPubKey.length).toBeGreaterThan(0);
      expect(result.htlcAddress.length).toBeGreaterThan(0);
      expect(result.peginAmount).toBe(TEST_AMOUNTS.PEGIN);
      expect(result.depositorClaimValue).toBeGreaterThan(0n);
    });

    it("should set htlcValue >= pegInAmount + depositorClaimValue", async () => {
      const result = await buildPrePeginPsbt(makePrePeginParams());

      // htlcValue covers pegInAmount + depositorClaimValue + internal fees
      expect(result.htlcValue).toBeGreaterThanOrEqual(
        result.peginAmount + result.depositorClaimValue,
      );
    });

    it("should handle different networks", async () => {
      const networks: Network[] = ["bitcoin", "testnet", "regtest", "signet"];

      for (const network of networks) {
        const result = await buildPrePeginPsbt(makePrePeginParams({ network }));

        expect(result.psbtHex.length).toBeGreaterThan(0);
        expect(result.htlcValue).toBeGreaterThan(0n);
        expect(result.peginAmount).toBe(TEST_AMOUNTS.PEGIN);
      }
    });

    it("should handle different peg-in amounts", async () => {
      const amounts = [
        TEST_AMOUNTS.PEGIN_SMALL,
        TEST_AMOUNTS.PEGIN_MEDIUM,
        TEST_AMOUNTS.PEGIN_LARGE,
        TEST_AMOUNTS.ONE_BTC,
      ];

      for (const pegInAmount of amounts) {
        const result = await buildPrePeginPsbt(makePrePeginParams({ pegInAmount }));

        expect(result.peginAmount).toBe(pegInAmount);
        expect(result.htlcValue).toBeGreaterThanOrEqual(pegInAmount);
      }
    });

    it("should handle multiple vault keepers", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({
          vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1, TEST_KEYS.VAULT_KEEPER_2],
          numLocalChallengers: 2,
        }),
      );

      expect(result.psbtHex.length).toBeGreaterThan(0);
      expect(result.htlcValue).toBeGreaterThan(0n);
    });

    it("should handle multiple universal challengers", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({
          universalChallengerPubkeys: [
            TEST_KEYS.UNIVERSAL_CHALLENGER_1,
            TEST_KEYS.UNIVERSAL_CHALLENGER_2,
          ],
        }),
      );

      expect(result.psbtHex.length).toBeGreaterThan(0);
      expect(result.htlcValue).toBeGreaterThan(0n);
    });
  });

  describe("Deterministic output", () => {
    it("should produce the same result for the same inputs", async () => {
      const params = makePrePeginParams();

      const result1 = await buildPrePeginPsbt(params);
      const result2 = await buildPrePeginPsbt(params);

      expect(result1.psbtHex).toBe(result2.psbtHex);
      expect(result1.htlcValue).toBe(result2.htlcValue);
      expect(result1.htlcScriptPubKey).toBe(result2.htlcScriptPubKey);
      expect(result1.htlcAddress).toBe(result2.htlcAddress);
    });

    it("should produce different output for different depositor keys", async () => {
      const result1 = await buildPrePeginPsbt(makePrePeginParams());
      const result2 = await buildPrePeginPsbt(
        makePrePeginParams({ depositorPubkey: TEST_KEYS.VAULT_PROVIDER }),
      );

      expect(result1.psbtHex).not.toBe(result2.psbtHex);
      expect(result1.htlcScriptPubKey).not.toBe(result2.htlcScriptPubKey);
      expect(result1.htlcAddress).not.toBe(result2.htlcAddress);
    });

    it("should produce different output for different hashlocks values", async () => {
      const result1 = await buildPrePeginPsbt(
        makePrePeginParams({ hashlocks: ["ab".repeat(32)] }),
      );
      const result2 = await buildPrePeginPsbt(
        makePrePeginParams({ hashlocks: ["cd".repeat(32)] }),
      );

      expect(result1.htlcScriptPubKey).not.toBe(result2.htlcScriptPubKey);
      expect(result1.htlcAddress).not.toBe(result2.htlcAddress);
    });

    it("should produce different output for different vault keepers", async () => {
      const result1 = await buildPrePeginPsbt(
        makePrePeginParams({ vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1] }),
      );
      const result2 = await buildPrePeginPsbt(
        makePrePeginParams({ vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_2] }),
      );

      expect(result1.htlcScriptPubKey).not.toBe(result2.htlcScriptPubKey);
    });
  });

  describe("Error handling", () => {
    it("should reject invalid depositor pubkey", async () => {
      await expect(
        buildPrePeginPsbt(makePrePeginParams({ depositorPubkey: "invalid-pubkey" })),
      ).rejects.toThrow();
    });

    it("should reject depositor pubkey with incorrect length", async () => {
      await expect(
        buildPrePeginPsbt(makePrePeginParams({ depositorPubkey: "abcd1234" })),
      ).rejects.toThrow();
    });

    it("should reject invalid vault provider pubkey", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ vaultProviderPubkey: "not-a-valid-hex-key" }),
        ),
      ).rejects.toThrow();
    });

    it("should reject invalid vault keeper pubkey in array", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ vaultKeeperPubkeys: ["zzzzinvalidhexzzzz"] }),
        ),
      ).rejects.toThrow();
    });

    it("should reject invalid network string", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ network: "invalid-network" as Network }),
        ),
      ).rejects.toThrow();
    });
  });
});

describe("buildPeginTxFromFundedPrePegin", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  // Helper: build an unfunded Pre-PegIn tx, then fund it with a fake UTXO
  // so fromFundedTransaction gets a valid tx with at least one input.
  async function buildFundedPrePeginTxHex(overrides?: Partial<PrePeginParams>) {
    const params = makePrePeginParams(overrides);
    const result = await buildPrePeginPsbt(params);

    // Fund the unfunded tx with a fake UTXO that covers totalOutputValue
    const fundedTxHex = fundPeginTransaction({
      unfundedTxHex: result.psbtHex,
      selectedUTXOs: [
        {
          txid: "aa".repeat(32),
          vout: 0,
          value: Number(result.totalOutputValue + 10_000n),
          scriptPubKey: "0014" + "bb".repeat(20),
        },
      ],
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 10_000n,
      network: bitcoin.networks.testnet,
    });

    return { txHex: fundedTxHex, params };
  }

  describe("Basic functionality", () => {
    it("should build a valid PegIn transaction from a funded Pre-PegIn tx hex", async () => {
      const { txHex, params } = await buildFundedPrePeginTxHex();

      const result = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      expect(result).toHaveProperty("txHex");
      expect(result).toHaveProperty("txid");
      expect(result).toHaveProperty("vaultScriptPubKey");
      expect(result).toHaveProperty("vaultValue");

      expect(typeof result.txHex).toBe("string");
      expect(typeof result.txid).toBe("string");
      expect(typeof result.vaultScriptPubKey).toBe("string");
      expect(typeof result.vaultValue).toBe("bigint");

      expect(result.txHex.length).toBeGreaterThan(0);
      expect(result.txid).toMatch(/^[0-9a-f]{64}$/);
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(result.vaultValue).toBeGreaterThan(0n);
    });

    it("should embed fundedPrePeginTxHex as the input reference", async () => {
      const { txHex: txHex1, params: params1 } = await buildFundedPrePeginTxHex();
      const { txHex: txHex2, params: params2 } = await buildFundedPrePeginTxHex({
        hashlocks: ["cd".repeat(32)],
      });

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params1,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex1,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params2,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex2,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      // Different Pre-PegIn transactions produce different PegIn txids
      expect(result1.txid).not.toBe(result2.txid);
      expect(result1.txHex).not.toBe(result2.txHex);
    });

    it("should produce the same vaultScriptPubKey for same depositor and keepers", async () => {
      const { txHex, params } = await buildFundedPrePeginTxHex();

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      expect(result1.txid).toBe(result2.txid);
      expect(result1.vaultScriptPubKey).toBe(result2.vaultScriptPubKey);
      expect(result1.vaultValue).toBe(result2.vaultValue);
    });

    it("should produce different vaultScriptPubKey for different depositors", async () => {
      const { txHex: txHex1, params: params1 } = await buildFundedPrePeginTxHex();
      const { txHex: txHex2, params: params2 } = await buildFundedPrePeginTxHex({
        depositorPubkey: TEST_KEYS.VAULT_PROVIDER,
      });

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params1,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex1,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params2,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex2,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
      expect(result1.txid).not.toBe(result2.txid);
    });

    it("should produce different results for different timelockPegin", async () => {
      const { txHex, params } = await buildFundedPrePeginTxHex();

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: 100,
        fundedPrePeginTxHex: txHex,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: 200,
        fundedPrePeginTxHex: txHex,
        htlcVout: SINGLE_DEPOSIT_HTLC_VOUT,
      });

      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
    });
  });
});
