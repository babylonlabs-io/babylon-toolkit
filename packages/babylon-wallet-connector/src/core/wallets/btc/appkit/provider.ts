import type { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { Psbt } from "bitcoinjs-lib";

import type { BTCConfig, IBTCProvider, InscriptionIdentifier, SignPsbtOptions } from "@/core/types";
import { resolveUseTweakedSigner } from "@/core/utils/psbtOptionsMapper";
import { APPKIT_OPEN_EVENT } from "@/core/wallets/appkit/constants";
import { unsupportedDeriveContextHash } from "@/core/wallets/btc/unsupportedDeriveContextHash";

import { APPKIT_BTC_CONNECTED_EVENT } from "./constants";
import icon from "./icon.svg";
import { getSharedBtcAppKitConfig, hasSharedBtcAppKitConfig } from "./sharedConfig";

interface BtcConnectedEvent extends Event {
  detail?: { address?: string; publicKey?: string };
}

interface AppKitSignInput {
  address: string;
  index: number;
  sighashTypes: number[];
  publicKey?: string;
  useTweakedSigner?: boolean;
  /** @deprecated Forwarded in sync with `useTweakedSigner` for older wallets only. */
  disableTweakSigner?: boolean;
}

interface AppKitBtcWalletProvider {
  signPSBT?: (params: {
    psbt: string;
    signInputs?: AppKitSignInput[];
    broadcast: boolean;
  }) => Promise<{ psbt: string; txid?: string }>;
  signMessage?: (params: {
    message: string;
    address: string;
    protocol: string;
  }) => Promise<string>;
}

interface AdapterConnection {
  account?: { address?: string; publicKey?: string };
}

function getAdapterConnections(adapter: BitcoinAdapter): AdapterConnection[] {
  return (adapter as unknown as { connections?: AdapterConnection[] }).connections ?? [];
}

export class AppKitBTCProvider implements IBTCProvider {
  private config: BTCConfig;
  private address?: string;
  private publicKey?: string;
  private eventHandlers: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private listeningForChanges = false;
  private boundHandleAccountChange: ((event: Event) => void) | null = null;

  constructor(config: BTCConfig) {
    this.config = config;
  }

  /**
   * Emit an event to all registered handlers for the given event name.
   */
  private emit(eventName: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(eventName);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (error) {
        console.error(`[AppKit Provider] Error in ${eventName} handler:`, error);
      }
    }
  }

  /**
   * Start listening for account changes from the bridge hook.
   * Sets up a persistent window listener for APPKIT_BTC_CONNECTED_EVENT
   * so account switches are propagated to BTCWalletProvider via event handlers.
   */
  private startListeningForAccountChanges(): void {
    if (this.listeningForChanges || typeof window === "undefined") return;

    this.boundHandleAccountChange = (event: Event) => {
      const detail = (event as BtcConnectedEvent).detail;

      if (!detail?.address) {
        // No address means disconnect — notify handlers with empty accounts array
        this.emit("accountsChanged", []);
        return;
      }

      if (detail.address === this.address) {
        return;
      }

      this.address = detail.address;
      this.publicKey = detail.publicKey;

      // Emit only accountsChanged (not both) because BTCWalletProvider registers
      // the same handler for both events — emitting both would cause double execution.
      this.emit("accountsChanged", [detail.address]);
    };

    window.addEventListener(APPKIT_BTC_CONNECTED_EVENT, this.boundHandleAccountChange);
    this.listeningForChanges = true;
  }

  private stopListeningForAccountChanges(): void {
    if (!this.listeningForChanges || typeof window === "undefined" || !this.boundHandleAccountChange) {
      return;
    }

    window.removeEventListener(APPKIT_BTC_CONNECTED_EVENT, this.boundHandleAccountChange);
    this.boundHandleAccountChange = null;
    this.listeningForChanges = false;
  }

  /**
   * Get the shared AppKit config
   */
  private getAppKitConfig() {
    if (!hasSharedBtcAppKitConfig()) {
      throw new Error(
        "AppKit BTC not initialized. Ensure AppKit modal is initialized at application startup " +
        "by calling initializeAppKitModal() with btc config in your app's entry point."
      );
    }
    return getSharedBtcAppKitConfig();
  }

  async connectWallet(): Promise<void> {
    try {
      // Open AppKit modal for Bitcoin wallet connection
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(APPKIT_OPEN_EVENT));

        // Wait for connection to complete
        const waitForConnection = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error("[AppKit Provider] Connection timeout after 60 seconds");
            cleanup();
            reject(new Error("Connection timeout"));
          }, 60000);

          const handleAccountChange = (event: Event) => {
            const detail = (event as BtcConnectedEvent).detail;
            if (detail?.address) {
              cleanup();
              this.address = detail.address;
              this.publicKey = detail.publicKey;
              resolve();
            } else {
              console.warn("[AppKit Provider] Event received but no address in detail");
            }
          };

          const cleanup = () => {
            clearTimeout(timeout);
            window.removeEventListener(APPKIT_BTC_CONNECTED_EVENT, handleAccountChange);
          };

          window.addEventListener(APPKIT_BTC_CONNECTED_EVENT, handleAccountChange);
        });

        await waitForConnection;
        this.startListeningForAccountChanges();
        return;
      }

      throw new Error("Window not available for AppKit modal");
    } catch (error) {
      console.error("[AppKit Provider] Failed to connect Bitcoin wallet:", error instanceof Error ? error.message : "Unknown error");
      throw new Error(`Failed to connect Bitcoin wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      const { modal } = this.getAppKitConfig();
      await modal.disconnect();
    } finally {
      this.stopListeningForAccountChanges();
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
      const connections = getAdapterConnections(adapter);
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

    if (hasSharedBtcAppKitConfig()) {
      const { adapter } = this.getAppKitConfig();
      const connections = getAdapterConnections(adapter);
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

      const walletProvider = modal.getProvider("bip122") as AppKitBtcWalletProvider | undefined;

      if (!walletProvider) {
        throw new Error("No wallet provider found for bip122 namespace");
      }

      if (!walletProvider.signPSBT) {
        throw new Error("Connected wallet does not support PSBT signing");
      }

      const psbtBase64 = Psbt.fromHex(psbtHex).toBase64();

      const signInputs: AppKitSignInput[] | undefined =
        options?.autoFinalized || !options?.signInputs
          ? undefined
          : options.signInputs.map((input) => {
              const useTweakedSigner = resolveUseTweakedSigner(input);
              return {
                address: input.address ?? address,
                index: input.index,
                sighashTypes: input.sighashTypes ?? [],
                ...(input.publicKey && { publicKey: input.publicKey }),
                ...(useTweakedSigner !== undefined && {
                  useTweakedSigner,
                  disableTweakSigner: !useTweakedSigner,
                }),
              };
            });

      const result = await walletProvider.signPSBT({
        psbt: psbtBase64,
        broadcast: false,
        ...(signInputs && { signInputs }),
      });

      if (!result.psbt) {
        throw new Error("Unexpected signPSBT response: missing psbt field");
      }

      return Psbt.fromBase64(result.psbt).toHex();
    } catch (error) {
      console.error("[AppKit Provider] signPsbt failed:", error instanceof Error ? error.message : "Unknown error");
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

      const walletProvider = modal.getProvider("bip122") as AppKitBtcWalletProvider | undefined;

      if (!walletProvider) {
        throw new Error("No wallet provider found for bip122 namespace");
      }

      if (!walletProvider.signMessage) {
        throw new Error("Connected wallet does not support message signing");
      }

      const protocol = type === "bip322-simple" ? "bip322" : "ecdsa";

      const signature = await walletProvider.signMessage({
        message,
        address,
        protocol,
      });

      return signature;
    } catch (error) {
      console.error("[AppKit Provider] signMessage failed:", error instanceof Error ? error.message : "Unknown error");
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

  deriveContextHash = unsupportedDeriveContextHash("AppKit Bitcoin");

  destroy(): void {
    this.stopListeningForAccountChanges();
    this.eventHandlers.clear();
  }
}
