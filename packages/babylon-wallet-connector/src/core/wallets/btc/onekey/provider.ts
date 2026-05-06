import { isAccountChangeEvent, DISCONNECT_EVENT, removeProviderListener } from "@/constants/walletEvents";
import type { BTCConfig, IBTCProvider, InscriptionIdentifier, SignPsbtOptions, WalletInfo } from "@/core/types";
import { Network } from "@/core/types";
import { mapSignInputsToToSignInputs } from "@/core/utils/psbtOptionsMapper";
import { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";

import logo from "./logo.svg";

const INTERNAL_NETWORK_NAMES = {
  [Network.MAINNET]: "livenet",
  [Network.TESTNET]: "testnet",
  [Network.SIGNET]: "signet",
};

export const WALLET_PROVIDER_NAME = "OneKey";

export class OneKeyProvider implements IBTCProvider {
  private provider: any;
  // The injected OneKey root (`window.$onekey`). Held so we can
  // lazily resolve sibling sub-providers like `wallet.btc` (which
  // hosts the `deriveContextHash` spec method via its `_request`
  // proxy) — the OneKey extension can populate sub-providers
  // asynchronously after the constructor runs, so capturing them
  // upfront would lock in stale `undefined` references.
  private wallet: any;
  private walletInfo: WalletInfo | undefined;
  private config: BTCConfig;

  constructor(wallet: any, config: BTCConfig) {
    this.config = config;

    // check whether there is an OneKey extension
    if (!wallet?.btcwallet) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "OneKey Wallet extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    this.wallet = wallet;
    this.provider = wallet.btcwallet;
  }

  connectWallet = async (): Promise<void> => {
    try {
      await this.provider.connectWallet();
    } catch (error) {
      const errorMessage = (error as Error)?.message || "";

      if (errorMessage.includes("single address mode") || errorMessage.includes("multiple addresses")) {
        throw new WalletError({
          code: ERROR_CODES.WALLET_CONFIG_REQUIRED,
          message:
            "OneKey Wallet requires single address mode. Please disable multiple addresses in your wallet settings and try again.",
          wallet: WALLET_PROVIDER_NAME,
        });
      } else if (errorMessage.includes("rejected")) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "Connection to OneKey Wallet was rejected",
          wallet: WALLET_PROVIDER_NAME,
        });
      } else {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_FAILED,
          message: errorMessage || "Failed to connect to OneKey Wallet",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
    }

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
        message: "Could not connect to OneKey Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  getAddress = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.address;
  };

  getPublicKeyHex = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.publicKeyHex;
  };

  signPsbt = async (psbtHex: string, options?: SignPsbtOptions): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!psbtHex)
      throw new WalletError({
        code: ERROR_CODES.PSBT_HEX_REQUIRED,
        message: "psbt hex is required",
        wallet: WALLET_PROVIDER_NAME,
      });

    // OneKey supports options with toSignInputs similar to UniSat
    if (options?.signInputs && options.signInputs.length > 0) {
      const oneKeyOptions = {
        autoFinalized: options.autoFinalized ?? false,
        toSignInputs: mapSignInputsToToSignInputs(options.signInputs),
      };
      return await this.provider.signPsbt(psbtHex, oneKeyOptions);
    }

    return this.provider.signPsbt(psbtHex);
  };

  signPsbts = async (psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!psbtsHexes || !Array.isArray(psbtsHexes) || psbtsHexes.length === 0) {
      throw new WalletError({
        code: ERROR_CODES.PSBTS_HEXES_REQUIRED,
        message: "psbts hexes are required and must be a non-empty array",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    // If options provided, map them to OneKey format
    if (options && options.length > 0) {
      const onekeyOptions = options.map((opt) => {
        if (opt?.signInputs && opt.signInputs.length > 0) {
          return {
            autoFinalized: opt.autoFinalized ?? false,
            toSignInputs: mapSignInputsToToSignInputs(opt.signInputs),
          };
        }
        return undefined;
      });
      return this.provider.signPsbts(psbtsHexes, onekeyOptions);
    }

    return this.provider.signPsbts(psbtsHexes);
  };

  getNetwork = async (): Promise<Network> => {
    const internalNetwork = await this.provider.getNetwork();

    for (const [key, value] of Object.entries(INTERNAL_NETWORK_NAMES)) {
      // TODO remove as soon as OneKey implements
      if (value === "testnet") {
        // in case of testnet return signet
        return Network.SIGNET;
      } else if (value === internalNetwork) {
        return key as Network;
      }
    }

    throw new WalletError({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      message: "Unsupported network from OneKey Wallet",
      wallet: WALLET_PROVIDER_NAME,
    });
  };

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return await this.provider.signMessage(message, type);
  };

  // Inscriptions are only available on OneKey Wallet BTC mainnet
  getInscriptions = async (): Promise<InscriptionIdentifier[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (this.config.network !== Network.MAINNET) {
      throw new WalletError({
        code: ERROR_CODES.INSCRIPTIONS_UNSUPPORTED_NETWORK,
        message: "Inscriptions are only available on OneKey Wallet BTC Mainnet",
        wallet: WALLET_PROVIDER_NAME,
        chainId: this.config.network,
      });
    }

    // max num of iterations to prevent infinite loop
    const MAX_ITERATIONS = 100;
    // Fetch inscriptions in batches of 100
    const limit = 100;
    const inscriptionIdentifiers: InscriptionIdentifier[] = [];
    let cursor = 0;
    let iterations = 0;
    try {
      while (iterations < MAX_ITERATIONS) {
        const { list } = await this.provider.getInscriptions(cursor, limit);
        const identifiers = list.map((i: { output: string }) => {
          const [txid, vout] = i.output.split(":");
          return {
            txid,
            vout,
          };
        });
        inscriptionIdentifiers.push(...identifiers);
        if (list.length < limit) {
          break;
        }
        cursor += limit;
        iterations++;
        if (iterations >= MAX_ITERATIONS) {
          throw new WalletError({
            code: ERROR_CODES.MAX_ITERATION_EXCEEDED,
            message: "Exceeded maximum iterations when fetching inscriptions",
            wallet: WALLET_PROVIDER_NAME,
          });
        }
      }
    } catch {
      throw new WalletError({
        code: ERROR_CODES.INSCRIPTION_FETCH_ERROR,
        message: "Failed to get inscriptions from OneKey Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    return inscriptionIdentifiers;
  };

  on = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // OneKey uses "accountsChanged" for account change events
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
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // OneKey uses "accountsChanged" for account change events
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
        message: "OneKey Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // OneKey routes spec methods through the generic `_request` proxy
    // on its `btc` sub-provider, rather than exposing
    // deriveContextHash as a top-level field. Resolve `btc` lazily
    // here because the OneKey extension can populate it after the
    // adapter constructor runs. Prefer the top-level
    // `deriveContextHash` if a future OneKey version surfaces it
    // directly; fall back to the `_request` proxy that the current
    // version supports per docs/specs/derive-context-hash.md §2.1.
    const btc = this.wallet?.btc;
    const directFn = btc?.deriveContextHash;
    if (typeof directFn === "function") {
      try {
        return await directFn.call(btc, appName, context);
      } catch (error) {
        if (isUserRejectionMessage((error as Error | undefined)?.message)) {
          throw new WalletError({
            code: ERROR_CODES.CONNECTION_REJECTED,
            message: "OneKey Wallet rejected the deriveContextHash approval",
            wallet: WALLET_PROVIDER_NAME,
          });
        }
        throw error;
      }
    }

    if (typeof btc?._request !== "function") {
      throw new WalletError({
        code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
        message:
          "OneKey Wallet version does not support deriveContextHash. Update to a version that implements the deriveContextHash specification.",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      return await btc._request({
        method: "deriveContextHash",
        params: { appName, context },
      });
    } catch (error) {
      if (isUserRejectionMessage((error as Error | undefined)?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "OneKey Wallet rejected the deriveContextHash approval",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      throw error;
    }
  };
}
