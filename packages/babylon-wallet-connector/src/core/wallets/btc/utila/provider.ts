import { isAccountChangeEvent, DISCONNECT_EVENT, removeProviderListener } from "@/constants/walletEvents";
import type { IBTCProvider, InscriptionIdentifier, SignPsbtOptions, WalletInfo } from "@/core/types";
import { Network } from "@/core/types";
import { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";

import logo from "./logo.svg";

export const WALLET_PROVIDER_NAME = "Utila";

/**
 * Utila is an MPC wallet that injects an `IBTCProvider`-compatible object at
 * `window.utila.bitcoin` (see docs/vault-integration-guide.md — it implements
 * the documented Bitcoin Wallet Interface directly). Unlike the UniSat/OneKey
 * adapters there is no request-shape translation; this adapter forwards each
 * method through and adds the connection guards + deriveContextHash error
 * mapping the dApp expects.
 *
 * Its `deriveContextHash` is MPC-based, not HD/HKDF — cross-wallet portability
 * is not provided, which the spec permits for non-HD wallets (the dApp only
 * needs a deterministic, domain-separated 32-byte value).
 */
export class UtilaProvider implements IBTCProvider {
  private provider: any;
  private walletInfo: WalletInfo | undefined;

  constructor(wallet: any) {
    // The injected object may be absent if the extension isn't installed.
    if (!wallet?.bitcoin) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Utila Wallet extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    this.provider = wallet.bitcoin;
  }

  connectWallet = async (): Promise<void> => {
    await this.provider.connectWallet();

    const address = await this.provider.getAddress();
    const publicKeyHex = await this.provider.getPublicKeyHex();

    if (publicKeyHex && address) {
      this.walletInfo = {
        publicKeyHex,
        address,
      };
    } else {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: "Could not connect to Utila Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  getAddress = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.address;
  };

  getPublicKeyHex = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.publicKeyHex;
  };

  signPsbt = async (psbtHex: string, options?: SignPsbtOptions): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!psbtHex)
      throw new WalletError({
        code: ERROR_CODES.PSBT_HEX_REQUIRED,
        message: "psbt hex is required",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.provider.signPsbt(psbtHex, options);
  };

  signPsbts = async (psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!psbtsHexes || !Array.isArray(psbtsHexes) || psbtsHexes.length === 0) {
      throw new WalletError({
        code: ERROR_CODES.PSBTS_HEXES_REQUIRED,
        message: "psbts hexes are required and must be a non-empty array",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    return this.provider.signPsbts(psbtsHexes, options);
  };

  getNetwork = async (): Promise<Network> => {
    return this.provider.getNetwork();
  };

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.provider.signMessage(message, type);
  };

  getInscriptions = async (): Promise<InscriptionIdentifier[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.provider.getInscriptions();
  };

  on = (eventName: string, callBack: () => void) => {
    if (isAccountChangeEvent(eventName)) {
      return this.provider.on("accountsChanged", callBack);
    }
    if (eventName === DISCONNECT_EVENT) {
      return this.provider.on(DISCONNECT_EVENT, callBack);
    }
  };

  off = (eventName: string, callBack: () => void) => {
    if (isAccountChangeEvent(eventName)) {
      return removeProviderListener(this.provider, "accountsChanged", callBack);
    }
    if (eventName === DISCONNECT_EVENT) {
      return removeProviderListener(this.provider, DISCONNECT_EVENT, callBack);
    }
  };

  getWalletProviderName = async (): Promise<string> => {
    return WALLET_PROVIDER_NAME;
  };

  getWalletProviderIcon = async (): Promise<string> => {
    return logo;
  };

  deriveContextHash = async (appName: string, context: string): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    if (typeof this.provider.deriveContextHash !== "function") {
      throw new WalletError({
        code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
        message:
          "Utila Wallet does not support deriveContextHash. Update Utila to a version that implements the deriveContextHash specification.",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      return await this.provider.deriveContextHash(appName, context);
    } catch (error) {
      // Map user rejection to a typed rejection so callers can distinguish
      // "user said no" from spec-validation failures; everything else is
      // rethrown unwrapped to preserve the wallet's diagnostics.
      if (isUserRejectionMessage((error as Error | undefined)?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "Utila Wallet rejected the deriveContextHash approval",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      throw error;
    }
  };
}
