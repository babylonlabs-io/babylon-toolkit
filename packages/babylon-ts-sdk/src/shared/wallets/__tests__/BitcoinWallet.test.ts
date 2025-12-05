import { beforeEach, describe, expect, it } from "vitest";
import { BitcoinNetworks } from "../interfaces";
import type { BitcoinWallet } from "../interfaces/BitcoinWallet";
import { MockBitcoinWallet } from "../mocks/MockBitcoinWallet";

describe("BitcoinWallet Interface", () => {
  let wallet: BitcoinWallet;

  beforeEach(() => {
    wallet = new MockBitcoinWallet();
  });

  describe("getPublicKeyHex", () => {
    it("should return a valid public key hex string", async () => {
      const publicKey = await wallet.getPublicKeyHex();

      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe("string");
      expect(publicKey).toHaveLength(64); // x-only key is 32 bytes = 64 hex chars
      expect(publicKey).toMatch(/^[a-f0-9]+$/i);
    });

    it("should return consistent public key", async () => {
      const pubKey1 = await wallet.getPublicKeyHex();
      const pubKey2 = await wallet.getPublicKeyHex();

      expect(pubKey1).toBe(pubKey2);
    });
  });

  describe("getAddress", () => {
    it("should return a valid Bitcoin address", async () => {
      const address = await wallet.getAddress();

      expect(address).toBeDefined();
      expect(typeof address).toBe("string");
      expect(address.length).toBeGreaterThan(0);
    });

    it("should return Taproot address format for testnet/signet", async () => {
      const address = await wallet.getAddress();

      // Testnet/Signet Taproot addresses start with "tb1p"
      expect(address).toMatch(/^tb1p/);
    });

    it("should return consistent address", async () => {
      const addr1 = await wallet.getAddress();
      const addr2 = await wallet.getAddress();

      expect(addr1).toBe(addr2);
    });
  });

  describe("signPsbt", () => {
    it("should sign a PSBT and return signed hex", async () => {
      const psbtHex = "70736274ff01007d0200000001";
      const signedPsbt = await wallet.signPsbt(psbtHex);

      expect(signedPsbt).toBeDefined();
      expect(typeof signedPsbt).toBe("string");
      expect(signedPsbt.length).toBeGreaterThan(psbtHex.length);
    });

    it("should throw error for empty PSBT", async () => {
      await expect(wallet.signPsbt("")).rejects.toThrow();
    });

    it("should handle signing failures", async () => {
      const failingWallet = new MockBitcoinWallet({
        shouldFailSigning: true,
      });

      await expect(
        failingWallet.signPsbt("70736274ff01007d0200000001"),
      ).rejects.toThrow("Mock signing failed");
    });
  });

  describe("signMessage", () => {
    it("should sign a message and return signature", async () => {
      const message = "Hello, Bitcoin!";
      const signature = await wallet.signMessage(message, "ecdsa");

      expect(signature).toBeDefined();
      expect(typeof signature).toBe("string");
      expect(signature.length).toBeGreaterThan(0);
    });

    it("should produce different signatures for different messages", async () => {
      const sig1 = await wallet.signMessage("Message 1", "ecdsa");
      const sig2 = await wallet.signMessage("Message 2", "ecdsa");

      expect(sig1).not.toBe(sig2);
    });

    it("should throw error for empty message", async () => {
      await expect(wallet.signMessage("", "ecdsa")).rejects.toThrow();
    });

    it("should handle signing failures", async () => {
      const failingWallet = new MockBitcoinWallet({
        shouldFailSigning: true,
      });

      await expect(failingWallet.signMessage("test", "ecdsa")).rejects.toThrow(
        "Mock signing failed",
      );
    });
  });

  describe("getNetwork", () => {
    it("should return a valid network", async () => {
      const network = await wallet.getNetwork();

      expect(network).toBeDefined();
      expect([BitcoinNetworks.MAINNET, BitcoinNetworks.TESTNET, BitcoinNetworks.SIGNET]).toContain(network);
    });

    it("should return signet by default", async () => {
      const network = await wallet.getNetwork();

      expect(network).toBe(BitcoinNetworks.SIGNET);
    });

    it("should return configured network", async () => {
      const mainnetWallet = new MockBitcoinWallet({ network: BitcoinNetworks.MAINNET });
      const network = await mainnetWallet.getNetwork();

      expect(network).toBe(BitcoinNetworks.MAINNET);
    });
  });

  describe("MockBitcoinWallet Configuration", () => {
    it("should allow custom configuration", () => {
      const customWallet = new MockBitcoinWallet({
        address: "tb1pCustomAddress",
        publicKeyHex: "deadbeef".repeat(8),
        network: BitcoinNetworks.TESTNET,
      });

      expect(customWallet).toBeDefined();
    });

    it("should support updateConfig", async () => {
      const mockWallet = wallet as MockBitcoinWallet;
      const originalAddress = await mockWallet.getAddress();

      mockWallet.updateConfig({ address: "tb1pNewAddress" });
      const newAddress = await mockWallet.getAddress();

      expect(newAddress).not.toBe(originalAddress);
      expect(newAddress).toBe("tb1pNewAddress");
    });

    it("should support reset", async () => {
      const mockWallet = wallet as MockBitcoinWallet;

      mockWallet.updateConfig({ address: "tb1pCustom" });
      mockWallet.reset();

      const address = await mockWallet.getAddress();
      expect(address).toBe(
        "tb1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx6jks",
      );
    });
  });
});
