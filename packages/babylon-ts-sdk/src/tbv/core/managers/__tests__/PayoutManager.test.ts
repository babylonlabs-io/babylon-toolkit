/**
 * Tests for PayoutManager
 *
 * Tests the manager's ability to orchestrate payout signing operations
 * using primitives and mock wallets.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MockBitcoinWallet } from "../../../../shared/wallets/mocks";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
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

  describe("Constructor", () => {
    it("should create a manager with valid config", () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
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

