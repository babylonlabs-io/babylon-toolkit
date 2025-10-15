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
  disconnect as wagmiDisconnect,
} from "wagmi/actions";
import { walletConnect } from "wagmi/connectors";

import type { ETHConfig, ETHTransactionRequest, ETHTypedData, IETHProvider, NetworkInfo } from "@/core/types";

import { wagmiConfig as fallbackWagmiConfig } from "./config";
import { getSharedWagmiConfig, hasSharedWagmiConfig } from "./sharedConfig";

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

  /**
   * Get the current wagmi config (shared if available, otherwise fallback)
   */
  private getWagmiConfig() {
    return hasSharedWagmiConfig() ? getSharedWagmiConfig() : fallbackWagmiConfig;
  }

  private setupEventWatchers(): void {
    const config = this.getWagmiConfig();

    // Watch for account changes
    const unwatchAccount = watchAccount(config, {
      onChange: (account) => {
        const previousAddress = this.address;
        this.address = account.address;
        this.chainId = account.chainId;

        if (previousAddress !== account.address) {
          this.emit("accountsChanged", account.address ? [account.address] : []);
        }
      },
    });

    const unwatchChain = watchChainId(config, {
      onChange: (chainId) => {
        const previousChainId = this.chainId;
        this.chainId = chainId;

        if (previousChainId !== chainId) {
          this.emit("chainChanged", `0x${chainId.toString(16)}`);
        }
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
      const config = this.getWagmiConfig();

      // First check if already connected (from previous session)
      const currentAccount = getAccount(config);
      if (currentAccount.address) {
        this.address = currentAccount.address;
        this.chainId = currentAccount.chainId;
        return;
      }

      // Open AppKit modal for manual connection
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("babylon:open-appkit"));

        const waitForConnection = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unwatch();
            reject(new Error("Connection timeout"));
          }, 60000);

          const unwatch = watchAccount(config, {
            onChange: (account) => {
              if (account.address) {
                clearTimeout(timeout);
                unwatch();
                this.address = account.address;
                this.chainId = account.chainId;
                resolve();
              }
            },
          });
        });

        await waitForConnection;
        return;
      }

      // Fallback to direct WalletConnect connection if event system not available
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

      const result = await connect(config, { connector: wcConnector });
      this.address = result.accounts[0];
      this.chainId = result.chainId;
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      throw new Error(`Failed to connect wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async disconnect(): Promise<void> {
    const config = this.getWagmiConfig();
    try {
      await wagmiDisconnect(config);
    } finally {
      this.address = undefined;
      this.chainId = undefined;
    }
  }

  async getAddress(): Promise<string> {
    const config = this.getWagmiConfig();
    const account = getAccount(config);
    if (account.address) {
      this.address = account.address;
      this.chainId = account.chainId;
      return this.address;
    }

    if (this.address) {
      return this.address;
    }

    throw new Error("Wallet not connected");
  }

  async getPublicKeyHex(): Promise<string> {
    // ETH doesn't expose public keys directly like BTC
    // We return the address as the public identifier
    return this.getAddress();
  }

  async signMessage(message: string): Promise<string> {
    try {
      const config = this.getWagmiConfig();
      const address = await this.getAddress();
      const signature = await wagmiSignMessage(config, {
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
      const config = this.getWagmiConfig();
      const address = await this.getAddress();
      const signature = await wagmiSignTypedData(config, {
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
      const config = this.getWagmiConfig();
      const address = await this.getAddress();
      const hash = await wagmiSendTransaction(config, {
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
      const config = this.getWagmiConfig();
      const address = await this.getAddress();
      const gas = await wagmiEstimateGas(config, {
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

    const config = this.getWagmiConfig();
    const account = getAccount(config);
    if (account.chainId) {
      this.chainId = account.chainId;
      return this.chainId;
    }

    return this.config.chainId;
  }

  async switchChain(chainId: number): Promise<void> {
    try {
      const config = this.getWagmiConfig();
      // Only allow switching to supported chains
      const supportedChains = [1, 11155111, 31337]; // Mainnet, Sepolia, and Anvil
      if (!supportedChains.includes(chainId)) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
      }

      await wagmiSwitchChain(config, { chainId: chainId as 1 | 11155111 | 31337 });
      this.chainId = chainId;
    } catch (error) {
      throw new Error(`Failed to switch chain: ${error}`);
    }
  }

  async getBalance(): Promise<bigint> {
    try {
      const config = this.getWagmiConfig();
      const address = await this.getAddress();
      const balance = await wagmiGetBalance(config, {
        address: address as `0x${string}`,
      });
      return balance.value;
    } catch (error) {
      throw new Error(`Failed to get balance: ${error}`);
    }
  }

  async getNonce(): Promise<number> {
    try {
      const config = this.getWagmiConfig();
      const address = await this.getAddress();
      const nonce = await getTransactionCount(config, {
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
