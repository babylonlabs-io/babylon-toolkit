import { OfflineAminoSigner, OfflineDirectSigner } from "@keplr-wallet/types/src/cosmjs";
import { Buffer } from "buffer";

import { BBNConfig, IBBNProvider, WalletInfo } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

import logo from "./logo.svg";

export const WALLET_PROVIDER_NAME = "OKX";

export class OKXBabylonProvider implements IBBNProvider {
  private walletInfo: WalletInfo | undefined;
  private chainId: string | undefined;
  private rpc: string | undefined;
  private chainData: BBNConfig["chainData"];

  constructor(
    private wallet: any,
    config: BBNConfig,
  ) {
    if (!wallet || !wallet.keplr) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "OKX Wallet extension not found",
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
    if (!this.wallet.keplr) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "OKX Wallet extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      await this.wallet.keplr.enable(this.chainId);
    } catch (error: Error | any) {
      if (error?.message.includes(this.chainId)) {
        try {
          // User has no BBN chain in their wallet
          await this.wallet.keplr.experimentalSuggestChain(this.chainData);
          await this.wallet.keplr.enable(this.chainId);
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
            message: "OKX Wallet connection request rejected",
            wallet: WALLET_PROVIDER_NAME,
          });
        } else if (error?.message.includes("context invalidated")) {
          throw new WalletError({
            code: ERROR_CODES.EXTENSION_CONTEXT_INVALIDATED,
            message: "OKX Wallet extension context invalidated",
            wallet: WALLET_PROVIDER_NAME,
          });
        } else {
          throw new WalletError({
            code: ERROR_CODES.CONNECTION_FAILED,
            message: error?.message || "Failed to connect to OKX Wallet",
            wallet: WALLET_PROVIDER_NAME,
          });
        }
      }
    }
    const key = await this.wallet.keplr.getKey(this.chainId);

    if (!key)
      throw new WalletError({
        code: ERROR_CODES.FAILED_TO_GET_KEY,
        message: "Failed to get OKX Wallet key",
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
        message: "Could not connect to OKX Wallet",
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
    if (!this.wallet.keplr)
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "OKX Wallet extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!this.chainId)
      throw new WalletError({
        code: ERROR_CODES.CHAIN_ID_NOT_INITIALIZED,
        message: "Chain ID is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      return this.wallet.keplr.getOfflineSigner(this.chainId);
    } catch {
      throw new WalletError({
        code: ERROR_CODES.UNKNOWN_ERROR,
        message: "Failed to get offline signer",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  }

  async getOfflineSignerAuto(): Promise<OfflineAminoSigner | OfflineDirectSigner> {
    if (!this.wallet.keplr)
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "OKX Wallet extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!this.chainId)
      throw new WalletError({
        code: ERROR_CODES.CHAIN_ID_NOT_INITIALIZED,
        message: "Chain ID is not initialized",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      return this.wallet.keplr.getOfflineSignerAuto(this.chainId);
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
      // currently the event is not implemented
      window.addEventListener("okx_keystorechange", callBack);
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
      // currently the event is not implemented
      window.removeEventListener("okx_keystorechange", callBack);
    }
  };

  getVersion(): Promise<string> {
    return this.wallet.getVersion();
  }
}
