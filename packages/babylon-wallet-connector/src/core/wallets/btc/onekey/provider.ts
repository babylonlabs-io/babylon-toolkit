import { isAccountChangeEvent, DISCONNECT_EVENT, removeProviderListener } from "@/constants/walletEvents";
import type { BTCConfig, IBTCProvider, InscriptionIdentifier, SignPsbtOptions, WalletInfo } from "@/core/types";
import { Network } from "@/core/types";
import { mapSignInputsToToSignInputs } from "@/core/utils/psbtOptionsMapper";
import { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";

import logo from "./logo.svg";
import { mapOneKeyNetwork } from "./network";
import { MIN_ONEKEY_VERSION, checkOneKeyVersion } from "./version";

export const WALLET_PROVIDER_NAME = "OneKey";

// EIP-1193 code OneKey returns from `deriveContextHash` for non-HD accounts
// (hardware / imported / watch-only) — its `rpc.methodNotSupported`, source:
// OneKeyHQ/cross-inpage-provider packages/errors/src/error-constants.ts.
const ONEKEY_METHOD_NOT_SUPPORTED_CODE = -32004;

export class OneKeyProvider implements IBTCProvider {
  private provider: any;
  // The `$onekey` injection hub (parent of `btcwallet`); carries `$walletInfo`
  // and `$private`, the only reliable source of the OneKey app version.
  private hub: any;
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

    this.hub = wallet;
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

    // Gate on the OneKey app version: deriveContextHash (required for vault
    // deposits) only exists in >= 6.3.0. Surfaced as a terminal "update"
    // prompt in the connect UI rather than failing later mid-deposit.
    await this.ensureSupportedVersion();

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

  // Reads the OneKey app/extension version from `$onekey.$walletInfo.version`.
  // OneKey populates `$walletInfo` asynchronously on injection; if it isn't
  // ready yet, call OneKey's own `$private.getConnectWalletInfo()` — the same
  // method ProviderPrivate runs on injection — which repopulates `$walletInfo`.
  // Returns `unknown`: external data validated by `checkOneKeyVersion`.
  private getAppVersion = async (): Promise<unknown> => {
    if (typeof this.hub?.$walletInfo?.version !== "string") {
      try {
        await this.hub?.$private?.getConnectWalletInfo?.();
      } catch {
        // Ignore — a missing version is handled as "unparseable" downstream.
      }
    }
    return this.hub?.$walletInfo?.version;
  };

  private ensureSupportedVersion = async (): Promise<void> => {
    const raw = await this.getAppVersion();
    const result = checkOneKeyVersion(raw);
    if (result === "ok") return;

    if (result === "below") {
      throw new WalletError({
        code: ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
        message: `Your OneKey Wallet is out of date (${raw}). Please update to version ${MIN_ONEKEY_VERSION} or later and try again.`,
        wallet: WALLET_PROVIDER_NAME,
        version: raw as string,
      });
    }

    // Missing/non-canonical version ($walletInfo cache not ready, or a fork
    // build): fail closed without claiming "out of date".
    throw new WalletError({
      code: ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
      message: `Unable to verify your OneKey Wallet version${
        typeof raw === "string" ? ` (got "${raw}")` : ""
      }. Please update to OneKey ${MIN_ONEKEY_VERSION} or later and try again.`,
      wallet: WALLET_PROVIDER_NAME,
    });
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

    const mapped = mapOneKeyNetwork(internalNetwork);
    if (mapped !== null) {
      return mapped;
    }

    throw new WalletError({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      message: `Unsupported network from OneKey Wallet: "${internalNetwork}"`,
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

    // OneKey exposes deriveContextHash on the injected `$onekey.btcwallet`
    // per docs/specs/derive-context-hash.md §2.1, shipped in OneKey >= 6.3.0.
    // Older builds omit the method, so surface a typed
    // WALLET_METHOD_NOT_SUPPORTED instead of an opaque "X is not a function".
    if (typeof this.provider.deriveContextHash !== "function") {
      throw new WalletError({
        code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
        message:
          "OneKey Wallet version does not support deriveContextHash. Update to a version that implements the deriveContextHash specification.",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      return await this.provider.deriveContextHash(appName, context);
    } catch (error) {
      // User rejection surfaces as EIP-1193 4001 "User rejected the request."
      // (OneKeyHQ/app-monorepo useDappApproveAction -> userRejectedRequest),
      // matched by isUserRejectionMessage. Map to a typed rejection so callers
      // can distinguish "user said no" from spec-validation failures.
      if (isUserRejectionMessage((error as Error | undefined)?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "OneKey Wallet rejected the deriveContextHash approval",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      // OneKey implements deriveContextHash for HD (app) wallets only; hardware,
      // imported, and watch-only accounts reject before the approval dialog with
      // methodNotSupported. Surface the typed capability error so callers branch
      // on it deterministically instead of the raw "Method not supported." string.
      if (
        (error as { code?: number } | undefined)?.code ===
        ONEKEY_METHOD_NOT_SUPPORTED_CODE
      ) {
        throw new WalletError({
          code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
          message:
            "This OneKey account does not support deriveContextHash. Connect a OneKey app (HD) wallet account.",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      // Everything else (appName charset, context hex format, length bounds,
      // unsupported-network) is rethrown unwrapped to preserve the wallet's
      // spec-validation diagnostics.
      throw error;
    }
  };
}
