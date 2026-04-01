/**
 * Tests for PayoutManager
 *
 * Tests the manager's ability to orchestrate payout signing operations
 * using primitives and mock wallets.
 */

import { Buffer } from "buffer";

import { Psbt, Transaction } from "bitcoinjs-lib";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces/BitcoinWallet";
import { MockBitcoinWallet } from "../../../../testing";
import {
  DUMMY_TXID_1,
  NULL_TXID,
  SEQUENCE_MAX,
  TEST_CLAIM_VALUE,
  TEST_COMBINED_VALUE,
  TEST_PEGIN_VALUE,
  createDummyP2TR,
  createDummyP2WPKH,
} from "../../primitives/psbt/__tests__/constants";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import { PayoutManager, type PayoutManagerConfig } from "../PayoutManager";

// Test constants - use valid secp256k1 x-only public keys
const TEST_KEYS = {
  DEPOSITOR: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  VAULT_PROVIDER:
    "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  VAULT_KEEPER_1:
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  UNIVERSAL_CHALLENGER_1:
    "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
} as const;

describe("PayoutManager", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  /**
   * Creates a deterministic peg-in transaction with a single Taproot output.
   */
  function createTestPeginTransaction(): string {
    const tx = new Transaction();
    tx.addInput(NULL_TXID, 0xffffffff, SEQUENCE_MAX);
    tx.addOutput(createDummyP2TR(), Number(TEST_PEGIN_VALUE));
    return tx.toHex();
  }

  describe("Constructor", () => {
    it("should create a manager with valid config", () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });

      const config: PayoutManagerConfig = {
        network: "signet",
        btcWallet,
      };

      const manager = new PayoutManager(config);

      expect(manager).toBeInstanceOf(PayoutManager);
      expect(manager.getNetwork()).toBe("signet");
    });

    it("should support different networks", () => {
      const btcWallet = new MockBitcoinWallet();

      const networks = ["bitcoin", "testnet", "signet", "regtest"] as const;

      for (const network of networks) {
        const manager = new PayoutManager({
          network,
          btcWallet,
        });
        expect(manager.getNetwork()).toBe(network);
      }
    });
  });

  describe("supportsBatchSigning", () => {
    it("should return true when wallet has signPsbts method", () => {
      const btcWallet = new MockBitcoinWallet();

      const manager = new PayoutManager({
        network: "signet",
        btcWallet,
      });

      expect(manager.supportsBatchSigning()).toBe(true);
    });

    it("should return false when wallet does not have signPsbts method", () => {
      // Create a wallet without signPsbts method
      const btcWallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      const manager = new PayoutManager({
        network: "signet",
        btcWallet: btcWallet as any,
      });

      expect(manager.supportsBatchSigning()).toBe(false);
    });
  });

  describe("signPayoutTransactionsBatch", () => {
    /**
     * Creates a deterministic assert transaction used for payout inputs.
     */
    function createTestAssertTransaction(): string {
      const tx = new Transaction();
      tx.addInput(DUMMY_TXID_1, 0xffffffff, SEQUENCE_MAX);
      tx.addOutput(createDummyP2WPKH("c"), Number(TEST_CLAIM_VALUE));
      return tx.toHex();
    }

    /**
     * Creates a deterministic Payout transaction that spends the peg-in output + assert output.
     */
    function createTestPayoutTransaction(
      peginTxHex: string,
      assertTxHex: string,
    ): string {
      const peginTx = Transaction.fromHex(peginTxHex);
      const assertTx = Transaction.fromHex(assertTxHex);
      const tx = new Transaction();

      tx.addInput(
        Buffer.from(peginTx.getId(), "hex").reverse(),
        0,
        SEQUENCE_MAX,
      );
      tx.addInput(
        Buffer.from(assertTx.getId(), "hex").reverse(),
        0,
        SEQUENCE_MAX,
      );
      tx.addOutput(createDummyP2WPKH("d"), Number(TEST_COMBINED_VALUE));

      return tx.toHex();
    }

    it("should batch sign multiple payout transactions", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();
      const payoutTxHex1 = createTestPayoutTransaction(peginTxHex, assertTxHex);
      const payoutTxHex2 = createTestPayoutTransaction(peginTxHex, assertTxHex);

      const payoutSignature1 = "bb".repeat(64);
      const payoutSignature2 = "dd".repeat(64);

      const getPublicKeyHex = vi
        .fn<() => Promise<string>>()
        .mockResolvedValue(TEST_KEYS.DEPOSITOR);

      const signPsbts = vi
        .fn<(psbtsHexes: string[]) => Promise<string[]>>()
        .mockImplementation(async (psbtsHexes: string[]) => {
          // Should receive 2 PSBTs: 1 per claimer
          expect(psbtsHexes).toHaveLength(2);

          return psbtsHexes.map((psbtHex, index) => {
            const psbt = Psbt.fromHex(psbtHex);
            const signature =
              index === 0 ? payoutSignature1 : payoutSignature2;

            psbt.data.inputs[0].tapScriptSig = [
              {
                pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
                signature: Buffer.from(signature, "hex"),
                leafHash: Buffer.alloc(32, 0),
              },
            ];
            return psbt.toHex();
          });
        });

      const wallet: BitcoinWallet = {
        getPublicKeyHex,
        signPsbt: vi.fn(),
        signPsbts,
        getAddress: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn().mockResolvedValue("signet"),
      };

      const manager = new PayoutManager({
        network: "signet",
        btcWallet: wallet,
      });

      const results = await manager.signPayoutTransactionsBatch([
        {
          payoutTxHex: payoutTxHex1,
          peginTxHex,
          assertTxHex,
          vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
          universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
          timelockPegin: 100,
        },
        {
          payoutTxHex: payoutTxHex2,
          peginTxHex,
          assertTxHex,
          vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
          universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
          timelockPegin: 100,
        },
      ]);

      // Verify results length and structure
      expect(results).toHaveLength(2);

      // Verify first transaction signature
      expect(results[0].payoutSignature).toBe(payoutSignature1);
      expect(results[0].depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);

      // Verify second transaction signature
      expect(results[1].payoutSignature).toBe(payoutSignature2);
      expect(results[1].depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);

      // Verify wallet calls
      expect(getPublicKeyHex).toHaveBeenCalledTimes(1);
      expect(signPsbts).toHaveBeenCalledTimes(1);
    });

    it("should throw error when wallet does not support batch signing", async () => {
      // Create a wallet without signPsbts method
      const btcWallet = {
        getPublicKeyHex: vi.fn().mockResolvedValue(TEST_KEYS.DEPOSITOR),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      const manager = new PayoutManager({
        network: "signet",
        btcWallet: btcWallet as any,
      });

      await expect(
        manager.signPayoutTransactionsBatch([
          {
            payoutTxHex: "0200000001...",
            peginTxHex: "0200000001...",
            assertTxHex: "0200000001...",
            vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
            vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
            universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
            timelockPegin: 100,
          },
        ]),
      ).rejects.toThrow(
        "Wallet does not support batch signing (signPsbts method not available)",
      );
    });

    it("should throw error when batch signing fails", async () => {
      const getPublicKeyHex = vi
        .fn<() => Promise<string>>()
        .mockResolvedValue(TEST_KEYS.DEPOSITOR);

      const signPsbts = vi
        .fn<(psbtsHexes: string[]) => Promise<string[]>>()
        .mockRejectedValue(new Error("Batch signing failed"));

      const wallet: BitcoinWallet = {
        getPublicKeyHex,
        signPsbt: vi.fn(),
        signPsbts,
        getAddress: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn().mockResolvedValue("signet"),
      };

      const manager = new PayoutManager({
        network: "signet",
        btcWallet: wallet,
      });

      await expect(
        manager.signPayoutTransactionsBatch([
          {
            payoutTxHex: "0200000001...",
            peginTxHex: "0200000001...",
            assertTxHex: "0200000001...",
            vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
            vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
            universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
            timelockPegin: 100,
          },
        ]),
      ).rejects.toThrow();
    });

    it("should throw error when wallet returns fewer PSBTs than expected", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();

      const getPublicKeyHex = vi
        .fn<() => Promise<string>>()
        .mockResolvedValue(TEST_KEYS.DEPOSITOR);

      // Mock wallet to return only 1 PSBT when 2 are expected
      const signPsbts = vi
        .fn<(psbtsHexes: string[]) => Promise<string[]>>()
        .mockImplementation(async (psbtsHexes: string[]) => {
          const signedPsbts = psbtsHexes.slice(0, 1).map((psbtHex) => {
            const psbt = Psbt.fromHex(psbtHex);
            psbt.data.inputs[0].tapScriptSig = [
              {
                pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
                signature: Buffer.from("aa".repeat(64), "hex"),
                leafHash: Buffer.alloc(32, 0),
              },
            ];
            return psbt.toHex();
          });
          return signedPsbts;
        });

      const wallet: BitcoinWallet = {
        getPublicKeyHex,
        signPsbt: vi.fn(),
        signPsbts,
        getAddress: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn().mockResolvedValue("signet"),
      };

      const manager = new PayoutManager({
        network: "signet",
        btcWallet: wallet,
      });

      await expect(
        manager.signPayoutTransactionsBatch([
          {
            payoutTxHex: createTestPayoutTransaction(peginTxHex, assertTxHex),
            peginTxHex,
            assertTxHex,
            vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
            vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
            universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
            timelockPegin: 100,
          },
          {
            payoutTxHex: createTestPayoutTransaction(peginTxHex, assertTxHex),
            peginTxHex,
            assertTxHex,
            vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
            vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
            universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
            timelockPegin: 100,
          },
        ]),
      ).rejects.toThrow(
        "Expected 2 signed PSBTs but received 1",
      );
    });

    it("should throw error when wallet returns more PSBTs than expected", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();

      const getPublicKeyHex = vi
        .fn<() => Promise<string>>()
        .mockResolvedValue(TEST_KEYS.DEPOSITOR);

      // Mock wallet to return 3 PSBTs when 2 are expected
      const signPsbts = vi
        .fn<(psbtsHexes: string[]) => Promise<string[]>>()
        .mockImplementation(async (psbtsHexes: string[]) => {
          const signedPsbts = psbtsHexes.map((psbtHex) => {
            const psbt = Psbt.fromHex(psbtHex);
            psbt.data.inputs[0].tapScriptSig = [
              {
                pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
                signature: Buffer.from("aa".repeat(64), "hex"),
                leafHash: Buffer.alloc(32, 0),
              },
            ];
            return psbt.toHex();
          });
          // Add an extra PSBT
          signedPsbts.push(signedPsbts[0]);
          return signedPsbts;
        });

      const wallet: BitcoinWallet = {
        getPublicKeyHex,
        signPsbt: vi.fn(),
        signPsbts,
        getAddress: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn().mockResolvedValue("signet"),
      };

      const manager = new PayoutManager({
        network: "signet",
        btcWallet: wallet,
      });

      await expect(
        manager.signPayoutTransactionsBatch([
          {
            payoutTxHex: createTestPayoutTransaction(peginTxHex, assertTxHex),
            peginTxHex,
            assertTxHex,
            vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
            vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
            universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
            timelockPegin: 100,
          },
          {
            payoutTxHex: createTestPayoutTransaction(peginTxHex, assertTxHex),
            peginTxHex,
            assertTxHex,
            vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
            vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
            universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
            timelockPegin: 100,
          },
        ]),
      ).rejects.toThrow(
        "Expected 2 signed PSBTs but received 3",
      );
    });
  });
});
