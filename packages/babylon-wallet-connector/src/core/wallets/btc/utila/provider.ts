import { isAccountChangeEvent, DISCONNECT_EVENT, removeProviderListener } from "@/constants/walletEvents";
import type { IBTCProvider, InscriptionIdentifier, SignPsbtOptions, WalletInfo } from "@/core/types";
import { Network } from "@/core/types";
import { withTimeout } from "@/core/utils/withTimeout";
import { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";

import logo from "./logo.svg";

export const WALLET_PROVIDER_NAME = "Utila";

// Budget for non-interactive reads (address, pubkey). An MPC wallet does remote
// co-signer round-trips, so bound them to keep a stalled provider from hanging
// the connect flow.
const UTILA_RPC_TIMEOUT_MS = 10_000;

// Budget for the interactive connect approval (waits on the user).
const UTILA_PROMPT_TIMEOUT_MS = 60_000;

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

  // Maps a user-cancelled wallet prompt to a typed CONNECTION_REJECTED so
  // callers can treat cancellation as an expected action; already-typed
  // WalletErrors and other errors are rethrown unchanged.
  private mapPromptRejection = (error: unknown, action: string): never => {
    if (error instanceof WalletError) throw error;
    if (isUserRejectionMessage((error as Error | undefined)?.message)) {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_REJECTED,
        message: `Utila Wallet rejected the ${action}`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    throw error;
  };

  // Builds the rejection used when a Utila call exceeds its timeout budget.
  private timeoutError = (operation: string): WalletError =>
    new WalletError({
      code: ERROR_CODES.CONNECTION_FAILED,
      message: `Utila Wallet did not respond while ${operation}. Open the extension to confirm it is unlocked, then try again.`,
      wallet: WALLET_PROVIDER_NAME,
    });

  connectWallet = async (): Promise<void> => {
    try {
      await withTimeout(this.provider.connectWallet(), UTILA_PROMPT_TIMEOUT_MS, () =>
        this.timeoutError("connecting"),
      );
    } catch (error) {
      if (error instanceof WalletError) throw error;
      if (isUserRejectionMessage((error as Error | undefined)?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "Connection to Utila Wallet was rejected",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: (error as Error | undefined)?.message || "Failed to connect to Utila Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    const address = await withTimeout<string>(this.provider.getAddress(), UTILA_RPC_TIMEOUT_MS, () =>
      this.timeoutError("reading the address"),
    );
    const publicKeyHex = await withTimeout<string>(this.provider.getPublicKeyHex(), UTILA_RPC_TIMEOUT_MS, () =>
      this.timeoutError("reading the public key"),
    );

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

    try {
      return await this.provider.signPsbt(psbtHex, options);
    } catch (error) {
      return this.mapPromptRejection(error, "PSBT signing request");
    }
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

    try {
      return await this.provider.signPsbts(psbtsHexes, options);
    } catch (error) {
      return this.mapPromptRejection(error, "PSBT signing request");
    }
  };

  getNetwork = async (): Promise<Network> => {
    const network = await this.provider.getNetwork();

    // Validate the value from the wallet rather than casting it into Network —
    // an unexpected return must fail at the boundary, not flow silently into
    // network-dependent PSBT signing.
    if (!Object.values(Network).includes(network)) {
      throw new WalletError({
        code: ERROR_CODES.UNSUPPORTED_NETWORK,
        message: `Unsupported network from Utila Wallet: "${network}"`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    return network;
  };

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    try {
      return await this.provider.signMessage(message, type);
    } catch (error) {
      return this.mapPromptRejection(error, "message signing request");
    }
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
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (isAccountChangeEvent(eventName)) {
      return this.provider.on("accountsChanged", callBack);
    }
    if (eventName === DISCONNECT_EVENT) {
      return this.provider.on(DISCONNECT_EVENT, callBack);
    }
  };

  off = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Utila Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
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
      return this.mapPromptRejection(error, "deriveContextHash approval");
    }
  };
}
