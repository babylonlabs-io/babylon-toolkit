import { Window as KeplrWindow } from "@keplr-wallet/types";
import { OfflineAminoSigner, OfflineDirectSigner } from "@keplr-wallet/types/src/cosmjs";
import { Buffer } from "buffer";

import { BBNConfig, IBBNProvider, WalletInfo } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

import logo from "./logo.svg";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Window extends KeplrWindow {}
}

export const WALLET_PROVIDER_NAME = "Keplr";

export class KeplrProvider implements IBBNProvider {
  private walletInfo: WalletInfo | undefined;
  private chainId: string | undefined;
  private rpc: string | undefined;
  private chainData: BBNConfig["chainData"];

  constructor(
    private keplr: Window["keplr"],
    config: BBNConfig,
  ) {
    if (!keplr) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Keplr extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    this.chainId = config.chainId;
    this.rpc = config.rpc;
    this.chainData = config.chainData;
  }

  async connectWallet(): Promise<void> {
    if (!this.chainId || !this.rpc || !this.keplr) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_INITIALIZATION_FAILED,
        message: `Keplr provider initialization failed: Missing ${!this.chainId ? "Chain ID" : !this.rpc ? "RPC URL" : "Keplr extension"}`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      await this.keplr.enable(this.chainId);
    } catch (error: Error | any) {
      if (error?.message.includes(this.chainId)) {
        try {
          // User has no BBN chain in their wallet
          await this.keplr.experimentalSuggestChain(this.chainData);
          await this.keplr.enable(this.chainId);
        } catch {
          throw new WalletError({
            code: ERROR_CODES.FAILED_TO_ADD_CHAIN,
            message: "Failed to add BBN chain",
            wallet: WALLET_PROVIDER_NAME,
          });
        }
      } else {
        if (error?.message.includes("rejected")) {
          throw new WalletError({
            code: ERROR_CODES.CONNECTION_REJECTED,
            message: "Keplr wallet connection request rejected",
            wallet: WALLET_PROVIDER_NAME,
          });
        } else if (error?.message.includes("context invalidated")) {
          throw new WalletError({
            code: ERROR_CODES.EXTENSION_CONTEXT_INVALIDATED,
            message: "Keplr extension context invalidated",
            wallet: WALLET_PROVIDER_NAME,
          });
        } else {
          throw new WalletError({
            code: ERROR_CODES.CONNECTION_FAILED,
            message: error?.message || "Failed to connect to Keplr",
            wallet: WALLET_PROVIDER_NAME,
          });
        }
      }
    }
    const key = await this.keplr.getKey(this.chainId);

    if (!key)
      throw new WalletError({
        code: ERROR_CODES.WALLET_INITIALIZATION_FAILED,
        message: "Failed to get Keplr key",
        wallet: WALLET_PROVIDER_NAME,
      });

    const { bech32Address, pubKey } = key;

    if (bech32Address && pubKey) {
      this.walletInfo = {
        publicKeyHex: Buffer.from(key.pubKey).toString("hex"),
        address: bech32Address,
      };
    } else {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: "Could not connect to Keplr",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  }

  async getAddress(): Promise<string> {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    return this.walletInfo.address;
  }

  async getPublicKeyHex(): Promise<string> {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    return this.walletInfo.publicKeyHex;
  }

  async getWalletProviderName(): Promise<string> {
    return WALLET_PROVIDER_NAME;
  }

  async getWalletProviderIcon(): Promise<string> {
    return logo;
  }

  async getOfflineSigner(): Promise<OfflineAminoSigner & OfflineDirectSigner> {
    if (!this.keplr || !this.chainId)
      throw new WalletError({
        code: ERROR_CODES.WALLET_INITIALIZATION_FAILED,
        message: !this.keplr ? "Keplr extension not found" : "Chain ID is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      return this.keplr.getOfflineSigner(this.chainId);
    } catch {
      throw new WalletError({
        code: ERROR_CODES.WALLET_INITIALIZATION_FAILED,
        message: "Failed to get offline signer",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  }

  async getOfflineSignerAuto(): Promise<OfflineAminoSigner | OfflineDirectSigner> {
    if (!this.keplr || !this.chainId)
      throw new WalletError({
        code: ERROR_CODES.WALLET_INITIALIZATION_FAILED,
        message: !this.keplr ? "Keplr extension not found" : "Chain ID is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      return this.keplr.getOfflineSignerAuto(this.chainId);
    } catch {
      throw new WalletError({
        code: ERROR_CODES.UNKNOWN_ERROR, // Or a more specific one if available
        message: "Failed to get offline signer auto",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  }

  on = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (eventName === "accountChanged") {
      window.addEventListener("keplr_keystorechange", callBack);
    }
  };

  off = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (eventName === "accountChanged") {
      window.removeEventListener("keplr_keystorechange", callBack);
    }
  };
}
