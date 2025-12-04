/**
 * Tests for PayoutManager
 *
 * Tests the manager's ability to orchestrate payout signing operations
 * using primitives and mock wallets.
 */

import { Buffer } from "buffer";

import { Psbt, Transaction } from "bitcoinjs-lib";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MockBitcoinWallet } from "../../../../shared/wallets/mocks";
import type { BitcoinWallet } from "../../../../shared/wallets/interfaces/BitcoinWallet";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import {
  DUMMY_TXID_1,
  NULL_TXID,
  SEQUENCE_MAX,
  TEST_CLAIM_VALUE,
  TEST_COMBINED_VALUE,
  TEST_PAYOUT_VALUE,
  TEST_PEGIN_VALUE,
  createDummyP2TR,
  createDummyP2WPKH,
} from "../../primitives/psbt/__tests__/constants";
import { PayoutManager, type PayoutManagerConfig } from "../PayoutManager";

// Test constants
const TEST_KEYS = {
  DEPOSITOR:
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  CLAIMER: "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  LIQUIDATOR_1:
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
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

  /**
   * Creates a deterministic claim transaction used for payout inputs.
   */
  function createTestClaimTransaction(): string {
    const tx = new Transaction();
    tx.addInput(DUMMY_TXID_1, 0xffffffff, SEQUENCE_MAX);
    tx.addOutput(createDummyP2WPKH("b"), Number(TEST_CLAIM_VALUE));
    return tx.toHex();
  }

  /**
   * Creates a deterministic payout transaction that spends the peg-in output.
   */
  function createTestPayoutTransaction(
    peginTxHex: string,
    claimTxHex?: string,
  ): string {
    const peginTx = Transaction.fromHex(peginTxHex);
    const tx = new Transaction();

    tx.addInput(Buffer.from(peginTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);

    if (claimTxHex) {
      const claimTx = Transaction.fromHex(claimTxHex);
      tx.addInput(
        Buffer.from(claimTx.getId(), "hex").reverse(),
        0,
        SEQUENCE_MAX,
      );
    }

    const outputValue = claimTxHex ? TEST_COMBINED_VALUE : TEST_PAYOUT_VALUE;
    tx.addOutput(createDummyP2WPKH("a"), Number(outputValue));

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

  describe("signPayoutTransaction", () => {
    it("should sign payout tx and return signature plus depositor pubkey", async () => {
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex);
      const deterministicSignature = "11".repeat(64);

      const getPublicKeyHex = vi
        .fn<() => Promise<string>>()
        .mockResolvedValue(TEST_KEYS.DEPOSITOR);
      const signPsbt = vi
        .fn<(psbtHex: string) => Promise<string>>()
        .mockImplementation(async (psbtHex: string) => {
          const psbt = Psbt.fromHex(psbtHex);
          psbt.data.inputs[0].tapScriptSig = [
            {
              pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
              signature: Buffer.from(deterministicSignature, "hex"),
              leafHash: Buffer.alloc(32, 0),
            },
          ];
          return psbt.toHex();
        });

      const wallet: BitcoinWallet = {
        getPublicKeyHex,
        signPsbt,
        getAddress: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn().mockResolvedValue("signet"),
      };

      const manager = new PayoutManager({
        network: "signet",
        btcWallet: wallet,
      });

      const result = await manager.signPayoutTransaction({
        payoutTxHex,
        peginTxHex,
        claimTxHex,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
      });

      expect(result.signature).toBe(deterministicSignature);
      expect(result.signature).toHaveLength(128);
      expect(result.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
      expect(getPublicKeyHex).toHaveBeenCalledTimes(1);
      expect(signPsbt).toHaveBeenCalledTimes(1);
    });

    it("should throw error when wallet fails to sign", async () => {
      const btcWallet = new MockBitcoinWallet({
        shouldFailSigning: true,
      });

      const manager = new PayoutManager({
        network: "signet",
        btcWallet,
      });

      await expect(
        manager.signPayoutTransaction({
          payoutTxHex: "0200000001...",
          peginTxHex: "0200000001...",
          claimTxHex: "0200000001...",
          vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
          liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        }),
      ).rejects.toThrow();
    });

  });
});

