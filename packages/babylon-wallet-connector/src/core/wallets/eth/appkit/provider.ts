import { parseEther } from "viem";
import {
  getAccount,
  getTransactionCount,
  estimateGas as wagmiEstimateGas,
  getBalance as wagmiGetBalance,
  sendTransaction as wagmiSendTransaction,
  signMessage as wagmiSignMessage,
  signTypedData as wagmiSignTypedData,
  switchChain as wagmiSwitchChain,
  watchAccount,
  watchChainId,
  connect,
} from "wagmi/actions";
import { injected, walletConnect } from "wagmi/connectors";

import type { ETHConfig, ETHTransactionRequest, ETHTypedData, IETHProvider, NetworkInfo } from "@/core/types";

import { wagmiConfig } from "./config";

/**
 * AppKitProvider - ETH wallet provider using AppKit/Wagmi
 *
 * This provider integrates with Reown's AppKit to provide:
 * - Connection to 600+ ETH wallets (MetaMask, Rainbow, WalletConnect, etc.)
 * - Message signing (personal_sign)
 * - Typed data signing (eth_signTypedData_v4)
 * - Transaction sending and gas estimation
 * - Network switching and information
 */
export class AppKitProvider implements IETHProvider {
  private config: ETHConfig;
  private address?: string;
  private chainId?: number;
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private unwatchFunctions: (() => void)[] = [];

  constructor(config: ETHConfig) {
    this.config = config;
    this.setupEventWatchers();
  }

  private setupEventWatchers(): void {
    // Watch for account changes
    const unwatchAccount = watchAccount(wagmiConfig, {
      onChange: (account) => {
        this.address = account.address;
        this.chainId = account.chainId;
        this.emit("accountsChanged", account.address ? [account.address] : []);
      },
    });

    // Watch for chain changes
    const unwatchChain = watchChainId(wagmiConfig, {
      onChange: (chainId) => {
        this.chainId = chainId;
        this.emit("chainChanged", `0x${chainId.toString(16)}`);
      },
    });

    this.unwatchFunctions.push(unwatchAccount, unwatchChain);
  }

  private emit(eventName: string, data?: any): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  async connectWallet(): Promise<void> {
    try {
      // First check if already connected
      const currentAccount = getAccount(wagmiConfig);
      if (currentAccount.address) {
        this.address = currentAccount.address;
        this.chainId = currentAccount.chainId;
        return;
      }

      // Try to connect using injected provider (MetaMask, etc.) first
      try {
        const result = await connect(wagmiConfig, { connector: injected() });
        this.address = result.accounts[0];
        this.chainId = result.chainId;
        return;
      } catch {
        // If injected connection fails, fall back to WalletConnect
        console.log("Injected connection failed, trying WalletConnect...");
      }

      // Fall back to WalletConnect
      const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "e3a2b903ffa3e74e8d1ce1c2a16e4e27";
      const wcConnector = walletConnect({
        projectId,
        metadata: {
          name: "Babylon Vault",
          description: "",
          url: "",
          icons: [""],
        },
      });

      const result = await connect(wagmiConfig, { connector: wcConnector });
      this.address = result.accounts[0];
      this.chainId = result.chainId;
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      throw new Error(`Failed to connect wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async getAddress(): Promise<string> {
    if (!this.address) {
      // Try to get account from wagmi
      const account = getAccount(wagmiConfig);
      if (account.address) {
        this.address = account.address;
        return this.address;
      }
      throw new Error("Wallet not connected");
    }
    return this.address;
  }

  async getPublicKeyHex(): Promise<string> {
    // ETH doesn't expose public keys directly like BTC
    // We return the address as the public identifier
    return this.getAddress();
  }

  async signMessage(message: string): Promise<string> {
    try {
      const address = await this.getAddress();
      const signature = await wagmiSignMessage(wagmiConfig, {
        message,
        account: address as `0x${string}`,
      });
      return signature;
    } catch (error) {
      throw new Error(`Failed to sign message: ${error}`);
    }
  }

  async signTypedData(typedData: ETHTypedData): Promise<string> {
    try {
      const address = await this.getAddress();
      const signature = await wagmiSignTypedData(wagmiConfig, {
        account: address as `0x${string}`,
        domain: {
          ...typedData.domain,
          salt: typedData.domain.salt as `0x${string}` | undefined,
          verifyingContract: typedData.domain.verifyingContract as `0x${string}` | undefined,
        },
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      return signature;
    } catch (error) {
      throw new Error(`Failed to sign typed data: ${error}`);
    }
  }

  async sendTransaction(tx: ETHTransactionRequest): Promise<string> {
    try {
      const address = await this.getAddress();
      const hash = await wagmiSendTransaction(wagmiConfig, {
        account: address as `0x${string}`,
        to: tx.to as `0x${string}`,
        value: tx.value ? parseEther(tx.value) : undefined,
        data: tx.data as `0x${string}` | undefined,
        gas: tx.gasLimit,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        nonce: tx.nonce,
      });
      return hash;
    } catch (error) {
      throw new Error(`Failed to send transaction: ${error}`);
    }
  }

  async estimateGas(tx: ETHTransactionRequest): Promise<bigint> {
    try {
      const address = await this.getAddress();
      const gas = await wagmiEstimateGas(wagmiConfig, {
        account: address as `0x${string}`,
        to: tx.to as `0x${string}`,
        value: tx.value ? parseEther(tx.value) : undefined,
        data: tx.data as `0x${string}` | undefined,
      });
      return gas;
    } catch (error) {
      throw new Error(`Failed to estimate gas: ${error}`);
    }
  }

  async getChainId(): Promise<number> {
    if (this.chainId) {
      return this.chainId;
    }

    const account = getAccount(wagmiConfig);
    if (account.chainId) {
      this.chainId = account.chainId;
      return this.chainId;
    }

    return this.config.chainId;
  }

  async switchChain(chainId: number): Promise<void> {
    try {
      // Only allow switching to supported chains
      const supportedChains = [1, 11155111]; // Mainnet and Sepolia
      if (!supportedChains.includes(chainId)) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
      }

      await wagmiSwitchChain(wagmiConfig, { chainId: chainId as 1 | 11155111 });
      this.chainId = chainId;
    } catch (error) {
      throw new Error(`Failed to switch chain: ${error}`);
    }
  }

  async getBalance(): Promise<bigint> {
    try {
      const address = await this.getAddress();
      const balance = await wagmiGetBalance(wagmiConfig, {
        address: address as `0x${string}`,
      });
      return balance.value;
    } catch (error) {
      throw new Error(`Failed to get balance: ${error}`);
    }
  }

  async getNonce(): Promise<number> {
    try {
      const address = await this.getAddress();
      const nonce = await getTransactionCount(wagmiConfig, {
        address: address as `0x${string}`,
      });
      return nonce;
    } catch (error) {
      throw new Error(`Failed to get nonce: ${error}`);
    }
  }

  async getNetworkInfo(): Promise<NetworkInfo> {
    const chainId = await this.getChainId();
    return {
      name: this.config.chainName || "Ethereum",
      chainId: chainId.toString(),
    };
  }

  getWalletProviderName(): string {
    return "AppKit";
  }

  getWalletProviderIcon(): string {
    // Ethereum logo as base64 data URL
    return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzYyN0VFQSIvPgogIDxwYXRoIGQ9Ik0xNiA0TDcuNSAxNi4yNUwxNiAyMkwyNC41IDE2LjI1TDE2IDR6IiBmaWxsPSJ3aGl0ZSIvPgogIDxwYXRoIGQ9Ik0xNiAyMi43NUw3LjUgMTdMMTYgMjhMMjQuNSAxN0wxNiAyMi43NXoiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNiIvPgo8L3N2Zz4=";
  }

  on(eventName: string, handler: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    this.eventHandlers.get(eventName)!.add(handler);
  }

  off(eventName: string, handler: (...args: any[]) => void): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  // Cleanup method for proper resource management
  destroy(): void {
    this.unwatchFunctions.forEach((unwatch) => unwatch());
    this.eventHandlers.clear();
  }
}
