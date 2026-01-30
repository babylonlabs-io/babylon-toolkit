import { beforeEach, describe, expect, it } from "vitest";
import { MockEthereumWallet } from "../mocks/MockEthereumWallet";

describe("MockEthereumWallet", () => {
  let wallet: MockEthereumWallet;

  beforeEach(() => {
    wallet = new MockEthereumWallet();
  });

  describe("account.address", () => {
    it("should return a valid Ethereum address", () => {
      const address = wallet.account.address;

      expect(address).toBeDefined();
      expect(typeof address).toBe("string");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should return consistent address", () => {
      const addr1 = wallet.account.address;
      const addr2 = wallet.account.address;

      expect(addr1).toBe(addr2);
    });
  });

  describe("sendTransaction", () => {
    it("should sign and send a transaction", async () => {
      const tx = {
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as const,
        value: 1000000000000000000n, // 1 ETH in wei
      };

      const txHash = await wallet.sendTransaction(tx);

      expect(txHash).toBeDefined();
      expect(typeof txHash).toBe("string");
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should throw error for missing 'to' address", async () => {
      const invalidTx = {
        value: 1000000000000000000n,
      } as any;

      await expect(wallet.sendTransaction(invalidTx)).rejects.toThrow(
        "missing 'to' address",
      );
    });

    it("should handle transaction with data field", async () => {
      const tx = {
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as const,
        value: 0n,
        data: "0x1234abcd" as const,
      };

      const txHash = await wallet.sendTransaction(tx);
      expect(txHash).toBeDefined();
    });

    it("should handle transaction failures", async () => {
      const failingWallet = new MockEthereumWallet({
        shouldFailOperations: true,
      });

      await expect(
        failingWallet.sendTransaction({
          to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
        }),
      ).rejects.toThrow("Mock transaction failed");
    });

    it("should increment nonce with each transaction", async () => {
      const tx = {
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as const,
      };

      expect(wallet.getCurrentNonce()).toBe(0);

      await wallet.sendTransaction(tx);
      expect(wallet.getCurrentNonce()).toBe(1);

      await wallet.sendTransaction(tx);
      expect(wallet.getCurrentNonce()).toBe(2);
    });
  });

  describe("signMessage", () => {
    it("should sign a message and return signature", async () => {
      const message = "Hello, Ethereum!";
      const signature = await wallet.signMessage({ message });

      expect(signature).toBeDefined();
      expect(typeof signature).toBe("string");
      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should produce different signatures for different messages", async () => {
      const sig1 = await wallet.signMessage({ message: "Message 1" });
      const sig2 = await wallet.signMessage({ message: "Message 2" });

      expect(sig1).not.toBe(sig2);
    });

    it("should throw error for empty message", async () => {
      await expect(wallet.signMessage({ message: "" })).rejects.toThrow();
    });

    it("should handle signing failures", async () => {
      const failingWallet = new MockEthereumWallet({
        shouldFailOperations: true,
      });

      await expect(
        failingWallet.signMessage({ message: "test" }),
      ).rejects.toThrow("Mock signing failed");
    });

    it("should include address in signature computation", async () => {
      const wallet1 = new MockEthereumWallet({
        address: "0x1111111111111111111111111111111111111111",
      });
      const wallet2 = new MockEthereumWallet({
        address: "0x2222222222222222222222222222222222222222",
      });

      const sig1 = await wallet1.signMessage({ message: "same message" });
      const sig2 = await wallet2.signMessage({ message: "same message" });

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("chain.id", () => {
    it("should return a valid chain ID", () => {
      const chainId = wallet.chain.id;

      expect(chainId).toBeDefined();
      expect(typeof chainId).toBe("number");
      expect(chainId).toBeGreaterThan(0);
    });

    it("should return Sepolia chain ID by default", () => {
      const chainId = wallet.chain.id;

      expect(chainId).toBe(11155111); // Sepolia
    });

    it("should return configured chain ID", () => {
      const mainnetWallet = new MockEthereumWallet({ chainId: 1 });
      const chainId = mainnetWallet.chain.id;

      expect(chainId).toBe(1);
    });

    it("should support common chain IDs", () => {
      const chains = [
        { name: "Mainnet", id: 1 },
        { name: "Sepolia", id: 11155111 },
        { name: "Anvil", id: 31337 },
      ];

      for (const chain of chains) {
        const testWallet = new MockEthereumWallet({ chainId: chain.id });
        const chainId = testWallet.chain.id;
        expect(chainId).toBe(chain.id);
      }
    });
  });

  describe("Configuration", () => {
    it("should allow custom configuration", () => {
      const customWallet = new MockEthereumWallet({
        address: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
        chainId: 1,
        transactionDelay: 100,
      });

      expect(customWallet).toBeDefined();
    });

    it("should support updateConfig", () => {
      const originalChainId = wallet.chain.id;

      wallet.updateConfig({ chainId: 1 });
      const newChainId = wallet.chain.id;

      expect(newChainId).not.toBe(originalChainId);
      expect(newChainId).toBe(1);
    });

    it("should support reset", async () => {
      wallet.updateConfig({ chainId: 1 });
      await wallet.sendTransaction({
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
      });

      wallet.reset();

      const chainId = wallet.chain.id;
      const nonce = wallet.getCurrentNonce();

      expect(chainId).toBe(11155111); // Default Sepolia
      expect(nonce).toBe(0); // Nonce reset
    });
  });

  describe("Type Safety", () => {
    it("should enforce Address type format", () => {
      const address = wallet.account.address;

      // TypeScript should enforce this at compile time
      const testAddress: `0x${string}` = address;
      expect(testAddress).toBe(address);
    });

    it("should enforce Hex type format for transaction hash", async () => {
      const hash = await wallet.sendTransaction({
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
      });

      // TypeScript should enforce this at compile time
      const testHash: `0x${string}` = hash;
      expect(testHash).toBe(hash);
    });
  });
});
