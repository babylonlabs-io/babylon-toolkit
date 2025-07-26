import { OfflineAminoSigner, OfflineDirectSigner } from "@keplr-wallet/types/src/cosmjs";
import { Buffer } from "buffer";

import { BBNConfig, IBBNProvider, WalletInfo } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

import logo from "./logo.svg";

export const WALLET_PROVIDER_NAME = "Leap";

export class LeapProvider implements IBBNProvider {
  private walletInfo: WalletInfo | undefined;
  private chainId: string | undefined;
  private rpc: string | undefined;
  private chainData: BBNConfig["chainData"];

  constructor(
    private wallet: any,
    config: BBNConfig,
  ) {
    if (!wallet) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Leap extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    this.chainId = config.chainId;
    this.rpc = config.rpc;
    this.chainData = config.chainData;
  }

  async connectWallet(): Promise<void> {
    if (!this.chainId)
      throw new WalletError({
        code: ERROR_CODES.CHAIN_ID_NOT_INITIALIZED,
        message: "Chain ID is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!this.rpc)
      throw new WalletError({
        code: ERROR_CODES.RPC_URL_NOT_INITIALIZED,
        message: "RPC URL is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!this.wallet)
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Leap extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      await this.wallet.enable(this.chainId);
    } catch (error: Error | any) {
      if (error?.message.includes(this.chainId) || error?.message.includes("chain id")) {
        try {
          // User has no BBN chain in their wallet
          await this.wallet.experimentalSuggestChain(this.chainData);
          await this.wallet.enable(this.chainId);
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
            message: "Leap wallet connection request rejected",
            wallet: WALLET_PROVIDER_NAME,
          });
        } else if (error?.message.includes("context invalidated")) {
          throw new WalletError({
            code: ERROR_CODES.EXTENSION_CONTEXT_INVALIDATED,
            message: "Leap extension context invalidated",
            wallet: WALLET_PROVIDER_NAME,
          });
        } else {
          throw new WalletError({
            code: ERROR_CODES.CONNECTION_FAILED,
            message: error?.message || "Failed to connect to Leap",
            wallet: WALLET_PROVIDER_NAME,
          });
        }
      }
    }
    const key = await this.wallet.getKey(this.chainId);

    if (!key)
      throw new WalletError({
        code: ERROR_CODES.FAILED_TO_GET_KEY,
        message: "Failed to get Leap key",
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
        message: "Could not connect to Leap",
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
    if (!this.wallet)
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Leap extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!this.chainId)
      throw new WalletError({
        code: ERROR_CODES.CHAIN_ID_NOT_INITIALIZED,
        message: "Chain ID is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      return this.wallet.getOfflineSigner(this.chainId);
    } catch {
      throw new WalletError({
        code: ERROR_CODES.UNKNOWN_ERROR,
        message: "Failed to get offline signer",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  }

  async getOfflineSignerAuto(): Promise<OfflineAminoSigner | OfflineDirectSigner> {
    if (!this.wallet)
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Leap extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!this.chainId)
      throw new WalletError({
        code: ERROR_CODES.CHAIN_ID_NOT_INITIALIZED,
        message: "Chain ID is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      return this.wallet.getOfflineSignerAuto(this.chainId);
    } catch {
      throw new WalletError({
        code: ERROR_CODES.UNKNOWN_ERROR,
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
      window.addEventListener("leap_keystorechange", callBack);
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
      window.removeEventListener("leap_keystorechange", callBack);
    }
  };
}
