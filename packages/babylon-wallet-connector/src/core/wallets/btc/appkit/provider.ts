import { Psbt } from "bitcoinjs-lib";

import type { BTCConfig, IBTCProvider, InscriptionIdentifier, SignPsbtOptions } from "@/core/types";

import icon from "./icon.svg";
import { getSharedBtcAppKitConfig, hasSharedBtcAppKitConfig } from "./sharedConfig";

/**
 * AppKitBTCProvider - BTC wallet provider using AppKit/BitcoinAdapter
 */
export class AppKitBTCProvider implements IBTCProvider {
  private config: BTCConfig;
  private address?: string;
  private publicKey?: string;
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();

  constructor(config: BTCConfig) {
    this.config = config;
  }

  /**
   * Get the shared AppKit config
   */
  private getAppKitConfig() {
    if (!hasSharedBtcAppKitConfig()) {
      throw new Error("AppKit BTC not initialized. Make sure to call initializeAppKitBtcModal() before connecting.");
    }
    return getSharedBtcAppKitConfig();
  }

  async connectWallet(): Promise<void> {
    try {
      // Open AppKit modal for Bitcoin wallet connection
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("babylon:open-appkit-btc"));

        // Wait for connection to complete
        const waitForConnection = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error("[AppKit Provider] Connection timeout after 60 seconds");
            cleanup();
            reject(new Error("Connection timeout"));
          }, 60000);

          const handleAccountChange = (event: any) => {
            if (event.detail?.address) {
              cleanup();
              this.address = event.detail.address;
              this.publicKey = event.detail.publicKey;
              resolve();
            } else {
              console.warn("[AppKit Provider] Event received but no address in detail");
            }
          };

          const cleanup = () => {
            clearTimeout(timeout);
            window.removeEventListener("babylon:appkit-btc-connected", handleAccountChange as any);
          };

          window.addEventListener("babylon:appkit-btc-connected", handleAccountChange as any);
        });

        await waitForConnection;
        return;
      }

      throw new Error("Window not available for AppKit modal");
    } catch (error) {
      console.error("[AppKit Provider] Failed to connect Bitcoin wallet:", error);
      throw new Error(`Failed to connect Bitcoin wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      const { modal } = this.getAppKitConfig();
      await modal.disconnect();
    } finally {
      this.address = undefined;
      this.publicKey = undefined;
    }
  }

  async getAddress(): Promise<string> {
    if (this.address) {
      return this.address;
    }

    // Try to get address from AppKit state
    if (hasSharedBtcAppKitConfig()) {
      const { adapter } = this.getAppKitConfig();
      // Get connected address from adapter connections
      const connections = (adapter as any).connections || [];
      if (connections.length > 0 && connections[0].account?.address) {
        this.address = connections[0].account.address;
        if (this.address) {
          return this.address;
        }
      }
    }

    throw new Error("Bitcoin wallet not connected");
  }

  async getPublicKeyHex(): Promise<string> {
    if (this.publicKey) {
      return this.publicKey;
    }

    // Try to get public key from AppKit state
    if (hasSharedBtcAppKitConfig()) {
      const { adapter } = this.getAppKitConfig();
      const connections = (adapter as any).connections || [];
      if (connections.length > 0 && connections[0].account?.publicKey) {
        this.publicKey = connections[0].account.publicKey;
        if (this.publicKey) {
          return this.publicKey;
        }
      }
    }

    throw new Error("Bitcoin wallet not connected or public key not available");
  }

  async signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string> {
    try {
      const { modal } = this.getAppKitConfig();
      const address = await this.getAddress();

      // Get the wallet provider using modal.getProvider() - the correct AppKit API
      const walletProvider = modal.getProvider<any>("bip122");

      if (!walletProvider) {
        throw new Error("No wallet provider found for bip122 namespace");
      }

      // Check for signPSBT (capital PSBT) method
      if (!(walletProvider as any).signPSBT) {
        throw new Error("Connected wallet does not support PSBT signing");
      }

      // Convert hex PSBT to Base64 format for AppKit wallets
      // AppKit wallets expect Base64 format, while native wallets use hex
      const psbtBase64 = Psbt.fromHex(psbtHex).toBase64();

      const params = {
        psbt: psbtBase64, // ✅ Base64 format for AppKit
        signInputs: options?.autoFinalized
          ? undefined
          : {
              address,
              signingIndexes: [0], // Sign all inputs by default
            },
        broadcast: false,
      };

      // Call walletProvider.signPSBT
      const result = await (walletProvider as any).signPSBT(params);

      // Handle different return formats - some wallets return { psbt: string }, others return string directly
      const signedPsbtBase64 = typeof result === "string" ? result : (result as any)?.psbt || result;

      // Convert Base64 back to hex format for consistency with Babylon code
      const signedPsbtHex = Psbt.fromBase64(signedPsbtBase64).toHex();

      return signedPsbtHex;
    } catch (error) {
      console.error("[AppKit Provider] signPsbt failed:", error);
      throw new Error(`Failed to sign PSBT: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async signPsbts(psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> {
    // Sign each PSBT sequentially
    const signedPsbts: string[] = [];
    for (let i = 0; i < psbtsHexes.length; i++) {
      const signed = await this.signPsbt(psbtsHexes[i], options?.[i]);
      signedPsbts.push(signed);
    }
    return signedPsbts;
  }

  async getNetwork(): Promise<import("@/core/types").Network> {
    // Return the configured network
    return this.config.network;
  }

  async signMessage(message: string, type: "bip322-simple" | "ecdsa"): Promise<string> {
    try {
      const { modal } = this.getAppKitConfig();
      const address = await this.getAddress();

      // Get the wallet provider using modal.getProvider() - the correct AppKit API
      const walletProvider = modal.getProvider<any>("bip122");

      if (!walletProvider) {
        throw new Error("No wallet provider found for bip122 namespace");
      }

      if (!(walletProvider as any).signMessage) {
        throw new Error("Connected wallet does not support message signing");
      }

      // Map "bip322-simple" to "bip322" for wallet compatibility
      const protocol = type === "bip322-simple" ? "bip322" : "ecdsa";

      const params = {
        message,
        address,
        protocol,
      };

      const signature = await (walletProvider as any).signMessage(params);

      return signature;
    } catch (error) {
      console.error("[AppKit Provider] signMessage failed:", error);
      throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  on(eventName: string, callBack: () => void): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    this.eventHandlers.get(eventName)!.add(callBack);
  }

  off(eventName: string, callBack: () => void): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.delete(callBack);
    }
  }

  async getWalletProviderName(): Promise<string> {
    return "AppKit Bitcoin";
  }

  async getWalletProviderIcon(): Promise<string> {
    return icon;
  }

  async getInscriptions(): Promise<InscriptionIdentifier[]> {
    return [];
  }

  // Cleanup method for proper resource management
  destroy(): void {
    this.eventHandlers.clear();
  }
}
