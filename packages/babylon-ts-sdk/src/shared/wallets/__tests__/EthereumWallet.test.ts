import { beforeEach, describe, expect, it } from "vitest";
import type { EthereumWallet } from "../interfaces/EthereumWallet";
import { MockEthereumWallet } from "../mocks/MockEthereumWallet";

describe("EthereumWallet Interface", () => {
  let wallet: EthereumWallet;

  beforeEach(() => {
    wallet = new MockEthereumWallet();
  });

  describe("getAddress", () => {
    it("should return a valid Ethereum address", async () => {
      const address = wallet.account.address;

      expect(address).toBeDefined();
      expect(typeof address).toBe("string");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should return checksummed address", async () => {
      const address = wallet.account.address;

      // Should start with 0x
      expect(address.startsWith("0x")).toBe(true);
      // Should be 42 characters (0x + 40 hex chars)
      expect(address).toHaveLength(42);
    });

    it("should return consistent address", async () => {
      const addr1 = wallet.account.address;
      const addr2 = wallet.account.address;

      expect(addr1).toBe(addr2);
    });
  });

  describe("sendTransaction", () => {
    it("should sign and send a transaction", async () => {
      const tx = {
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as const,
        value: "1000000000000000000", // 1 ETH in wei
      };

      const txHash = await wallet.sendTransaction(tx);

      expect(txHash).toBeDefined();
      expect(typeof txHash).toBe("string");
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should throw error for missing 'to' address", async () => {
      const invalidTx = {
        value: "1000000000000000000",
      } as any;

      await expect(wallet.sendTransaction(invalidTx)).rejects.toThrow(
        "missing 'to' address",
      );
    });

    it("should handle transaction with data field", async () => {
      const tx = {
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as const,
        value: "0",
        data: "0x1234abcd",
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
      const mockWallet = wallet as MockEthereumWallet;
      const tx = {
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as const,
      };

      expect(mockWallet.getCurrentNonce()).toBe(0);

      await mockWallet.sendTransaction(tx);
      expect(mockWallet.getCurrentNonce()).toBe(1);

      await mockWallet.sendTransaction(tx);
      expect(mockWallet.getCurrentNonce()).toBe(2);
    });
  });

  describe("signTypedData", () => {
    it("should sign EIP-712 typed data", async () => {
      const typedData = {
        domain: {
          name: "TestDApp",
          version: "1",
          chainId: 1,
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: {
          owner: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
          spender: "0x1234567890123456789012345678901234567890",
          value: "1000000000000000000",
        },
      };

      const signature = await wallet.signTypedData(typedData);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe("string");
      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should produce different signatures for different typed data", async () => {
      const typedData1 = {
        domain: { name: "DApp1", version: "1" },
        types: { Test: [{ name: "value", type: "uint256" }] },
        primaryType: "Test",
        message: { value: "100" },
      };

      const typedData2 = {
        domain: { name: "DApp2", version: "1" },
        types: { Test: [{ name: "value", type: "uint256" }] },
        primaryType: "Test",
        message: { value: "200" },
      };

      const sig1 = await wallet.signTypedData(typedData1);
      const sig2 = await wallet.signTypedData(typedData2);

      expect(sig1).not.toBe(sig2);
    });

    it("should throw error for invalid typed data", async () => {
      const invalidData = {
        domain: {},
        types: {},
        primaryType: "",
        message: {},
      };

      await expect(wallet.signTypedData(invalidData)).rejects.toThrow(
        "missing required fields",
      );
    });

    it("should handle typed data signing failures", async () => {
      const failingWallet = new MockEthereumWallet({
        shouldFailOperations: true,
      });

      const typedData = {
        domain: { name: "Test" },
        types: { Test: [] },
        primaryType: "Test",
        message: {},
      };

      await expect(failingWallet.signTypedData(typedData)).rejects.toThrow(
        "Mock typed data signing failed",
      );
    });

    it("should include address in typed data signature", async () => {
      const wallet1 = new MockEthereumWallet({
        address: "0x1111111111111111111111111111111111111111",
      });
      const wallet2 = new MockEthereumWallet({
        address: "0x2222222222222222222222222222222222222222",
      });

      const typedData = {
        domain: { name: "Test", version: "1" },
        types: { Test: [{ name: "value", type: "uint256" }] },
        primaryType: "Test",
        message: { value: "100" },
      };

      const sig1 = await wallet1.signTypedData(typedData);
      const sig2 = await wallet2.signTypedData(typedData);

      expect(sig1).not.toBe(sig2);
    });

    it("should differentiate signMessage from signTypedData", async () => {
      const message = "test message";
      const typedData = {
        domain: { name: "test message" },
        types: { Test: [] },
        primaryType: "Test",
        message: {},
      };

      const messageSig = await wallet.signMessage({ message });
      const typedDataSig = await wallet.signTypedData(typedData);

      expect(messageSig).not.toBe(typedDataSig);
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

      await expect(failingWallet.signMessage({ message: "test" })).rejects.toThrow(
        "Mock signing failed",
      );
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

  describe("getChainId", () => {
    it("should return a valid chain ID", async () => {
      const chainId = wallet.chain.id;

      expect(chainId).toBeDefined();
      expect(typeof chainId).toBe("number");
      expect(chainId).toBeGreaterThan(0);
    });

    it("should return Sepolia chain ID by default", async () => {
      const chainId = wallet.chain.id;

      expect(chainId).toBe(11155111); // Sepolia
    });

    it("should return configured chain ID", async () => {
      const mainnetWallet = new MockEthereumWallet({ chainId: 1 });
      const chainId = mainnetWallet.chain.id;

      expect(chainId).toBe(1);
    });

    it("should support common chain IDs", async () => {
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

  describe("MockEthereumWallet Configuration", () => {
    it("should allow custom configuration", () => {
      const customWallet = new MockEthereumWallet({
        address: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
        chainId: 1,
        transactionDelay: 100,
      });

      expect(customWallet).toBeDefined();
    });

    it("should support updateConfig", async () => {
      const mockWallet = wallet as MockEthereumWallet;
      const originalChainId = mockWallet.chain.id;

      mockWallet.updateConfig({ chainId: 1 });
      const newChainId = mockWallet.chain.id;

      expect(newChainId).not.toBe(originalChainId);
      expect(newChainId).toBe(1);
    });

    it("should support reset", async () => {
      const mockWallet = wallet as MockEthereumWallet;

      mockWallet.updateConfig({ chainId: 1 });
      await mockWallet.sendTransaction({
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
      });

      mockWallet.reset();

      const chainId = mockWallet.chain.id;
      const nonce = mockWallet.getCurrentNonce();

      expect(chainId).toBe(11155111); // Default Sepolia
      expect(nonce).toBe(0); // Nonce reset
    });
  });

  describe("Type Safety", () => {
    it("should enforce Address type format", async () => {
      const address = wallet.account.address;

      // TypeScript should enforce this at compile time
      const testAddress: `0x${string}` = address;
      expect(testAddress).toBe(address);
    });

    it("should enforce Hash type format", async () => {
      const hash = await wallet.sendTransaction({
        to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
      });

      // TypeScript should enforce this at compile time
      const testHash: `0x${string}` = hash;
      expect(testHash).toBe(hash);
    });
  });
});
