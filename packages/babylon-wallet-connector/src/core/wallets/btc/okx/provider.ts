import {
  DISCONNECT_EVENT,
  NETWORK_CHANGE_EVENT,
  isAccountChangeEvent,
  removeProviderListener,
  trackProviderIdentityChanges,
} from "@/constants/walletEvents";
import type { BTCConfig, InscriptionIdentifier, SignPsbtOptions, WalletInfo } from "@/core/types";
import { IBTCProvider, Network } from "@/core/types";
import { mapSignInputsToToSignInputs } from "@/core/utils/psbtOptionsMapper";
import { withTimeout } from "@/core/utils/withTimeout";
import logo from "@/core/wallets/icons/okx.svg";
import { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";

import { MIN_OKX_VERSION, checkOKXVersion } from "./version";

const PROVIDER_NAMES = {
  [Network.MAINNET]: "bitcoin",
  [Network.TESTNET]: "bitcoinTestnet",
  [Network.SIGNET]: "bitcoinSignet",
};

export const WALLET_PROVIDER_NAME = "OKX";

interface OkxSignPsbtOptions {
  autoFinalized: boolean;
  toSignInputs: ReturnType<typeof mapSignInputsToToSignInputs> | undefined;
}

// Seam options → OKX `{ autoFinalized, toSignInputs }`: explicit inputs default to non-finalized
// (script-path signing needs tapScriptSig), a bare `autoFinalized: false` is kept, else wallet defaults.
function toOkxSignOptions(options?: SignPsbtOptions): OkxSignPsbtOptions | undefined {
  if (options?.signInputs && options.signInputs.length > 0) {
    return {
      autoFinalized: options.autoFinalized ?? false,
      toSignInputs: mapSignInputsToToSignInputs(options.signInputs),
    };
  }
  if (options?.autoFinalized === false) {
    return { autoFinalized: false, toSignInputs: undefined };
  }
  return undefined;
}

// What `signPsbts` returned, for the malformed-response error: shape only, never the payload.
function describeSignPsbtsResponse(signed: unknown): string {
  if (!Array.isArray(signed)) return typeof signed;
  if (signed.length !== 1) return `an array of ${signed.length}`;
  return typeof signed[0] === "string" ? "an array holding an empty string" : `an array holding ${typeof signed[0]}`;
}

// Bound the version read so a locked/asleep extension fails recoverably, not hangs.
const OKX_RPC_TIMEOUT_MS = 10_000;

export class OKXProvider implements IBTCProvider {
  private provider: any;
  // Root `okxwallet` (getVersion lives here); `this.provider` is the per-chain provider.
  private wallet: any;
  private walletInfo: WalletInfo | undefined;
  private config: BTCConfig;
  private identityVersion = 0;
  private walletInfoIdentityVersion = -1;
  private tracksIdentityChanges = false;
  private identityEventsTracked = false;

  constructor(wallet: any, config: BTCConfig) {
    this.config = config;

    // check whether there is an OKX Wallet extension
    if (!wallet) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "OKX Wallet extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    this.wallet = wallet;

    const providerName = PROVIDER_NAMES[config.network];

    if (!providerName) {
      throw new WalletError({
        code: ERROR_CODES.UNSUPPORTED_NETWORK,
        message: "Unsupported network",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    this.provider = wallet[providerName];
  }

  connectWallet = async (): Promise<void> => {
    // Fail fast on an out-of-date OKX here, not at deposit time.
    await this.ensureSupportedVersion();

    this.trackIdentityChanges();
    const identityVersion = this.identityVersion;
    let result;
    try {
      result = await this.provider.connect();
    } catch (error) {
      if ((error as Error)?.message?.includes("rejected")) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "Connection to OKX Wallet was rejected",
          wallet: WALLET_PROVIDER_NAME,
        });
      }

      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: (error as Error)?.message || "Failed to connect to OKX Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    const { address, compressedPublicKey } = result;

    if (compressedPublicKey && address) {
      this.walletInfo = {
        publicKeyHex: compressedPublicKey,
        address,
      };
      this.walletInfoIdentityVersion = identityVersion;
    } else {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: "Could not connect to OKX Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  isIdentityCurrent = (): boolean =>
    this.identityEventsTracked && this.walletInfoIdentityVersion === this.identityVersion;

  private trackIdentityChanges = (): void => {
    if (this.tracksIdentityChanges) return;
    this.identityEventsTracked = trackProviderIdentityChanges(this.provider, () => {
      this.identityVersion += 1;
    });
    this.tracksIdentityChanges = this.identityEventsTracked;
  };

  private timeoutError = (operation: string): WalletError =>
    new WalletError({
      code: ERROR_CODES.CONNECTION_FAILED,
      message: `OKX Wallet did not respond while ${operation}. Open the extension to confirm it is unlocked, then try again.`,
      wallet: WALLET_PROVIDER_NAME,
    });

  // Gate connect on OKX >= MIN_OKX_VERSION (deriveContextHash support).
  // Fail closed on a missing / unreadable / non-canonical version.
  private ensureSupportedVersion = async (): Promise<void> => {
    if (typeof this.wallet.getVersion !== "function") {
      throw new WalletError({
        code: ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
        message: `Your OKX Wallet extension is out of date. Please update to version ${MIN_OKX_VERSION} or later and try again.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    let raw: unknown;
    try {
      raw = await withTimeout(this.wallet.getVersion(), OKX_RPC_TIMEOUT_MS, () =>
        this.timeoutError("reading its version"),
      );
    } catch (error) {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: (error as Error)?.message || "Failed to read OKX Wallet version",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    const result = checkOKXVersion(raw);
    if (result === "ok") return;

    if (result === "below") {
      throw new WalletError({
        code: ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
        message: `Your OKX Wallet extension is out of date (${raw}). Please update to version ${MIN_OKX_VERSION} or later and try again.`,
        wallet: WALLET_PROVIDER_NAME,
        version: raw as string,
      });
    }

    // Non-canonical version (fork/canary): fail closed without claiming "out of date".
    throw new WalletError({
      code: ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
      message: `Unable to verify your OKX Wallet version${typeof raw === "string" ? ` (got "${raw}")` : ""}. Please install the official OKX Wallet ${MIN_OKX_VERSION} or later and try again.`,
      wallet: WALLET_PROVIDER_NAME,
    });
  };

  getAddress = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.address;
  };

  getPublicKeyHex = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.publicKeyHex;
  };

  // `getAccounts` is intentionally omitted: OKX's BTC provider is closed-source
  // and its locked-wallet behavior for a non-interactive accounts read is
  // unspecified, so an empty-array read can't be trusted as a silent-lock
  // signal. Omitting it makes the lock poll feature-detect OKX out (see
  // BTCWalletProvider) instead of risking a banner that never fires (or one
  // that fires wrongly). Re-add only alongside a verified lock signal.

  signPsbt = async (psbtHex: string, options?: SignPsbtOptions): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    const okxOptions = toOkxSignOptions(options);

    // OKX extension 4.17.11 drops `autoFinalized: false` on `signPsbt` (its handler copies the flag
    // only when truthy) but forwards it on `signPsbts`, so a lone PSBT takes the batch endpoint.
    if (okxOptions?.autoFinalized === false) {
      const signed: unknown = await this.provider.signPsbts([psbtHex], [okxOptions]);
      if (!Array.isArray(signed) || signed.length !== 1 || typeof signed[0] !== "string" || signed[0].length === 0) {
        throw new WalletError({
          code: ERROR_CODES.SIGNATURE_EXTRACT_ERROR,
          message: `OKX Wallet returned a malformed response to a single-PSBT batch signing request: expected an array holding exactly one non-empty signed PSBT hex, got ${describeSignPsbtsResponse(signed)}`,
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      return signed[0];
    }

    if (okxOptions) {
      return await this.provider.signPsbt(psbtHex, okxOptions);
    }

    return await this.provider.signPsbt(psbtHex);
  };

  signPsbts = async (psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // Same seam → OKX conversion as `signPsbt`, so one PSBT and a batch never disagree about an option.
    if (options && options.length > 0) {
      return await this.provider.signPsbts(
        psbtsHexes,
        options.map((opt) => toOkxSignOptions(opt)),
      );
    }

    return await this.provider.signPsbts(psbtsHexes);
  };

  getNetwork = async (): Promise<Network> => {
    // OKX does not provide a way to get the network for Signet and Testnet
    // So we pass the check on connection and return the environment network
    if (!this.config.network)
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS, // Or a new code like CONFIG_ERROR
        message: "Network not set in config",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.config.network;
  };

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return await this.provider.signMessage(message, type);
  };

  // Inscriptions are only available on OKX Wallet BTC mainnet (i.e okxWallet.bitcoin)
  getInscriptions = async (): Promise<InscriptionIdentifier[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (this.config.network !== Network.MAINNET) {
      throw new WalletError({
        code: ERROR_CODES.INSCRIPTIONS_UNSUPPORTED_NETWORK,
        message: "Inscriptions are only available on OKX Wallet BTC mainnet",
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
        message: "Failed to get inscriptions from OKX Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    return inscriptionIdentifiers;
  };

  on = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // OKX uses "accountsChanged" for account change events
    if (isAccountChangeEvent(eventName)) {
      return this.provider.on("accountsChanged", callBack);
    }

    if (eventName === NETWORK_CHANGE_EVENT) {
      return this.provider.on(NETWORK_CHANGE_EVENT, callBack);
    }

    if (eventName === DISCONNECT_EVENT) {
      return this.provider.on(DISCONNECT_EVENT, callBack);
    }
  };

  off = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // OKX uses "accountsChanged" for account change events
    if (isAccountChangeEvent(eventName)) {
      return removeProviderListener(this.provider, "accountsChanged", callBack);
    }

    if (eventName === NETWORK_CHANGE_EVENT) {
      return removeProviderListener(this.provider, NETWORK_CHANGE_EVENT, callBack);
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
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    if (typeof this.provider.deriveContextHash !== "function") {
      throw new WalletError({
        code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
        message:
          "OKX Wallet version does not support deriveContextHash. Update to a version that implements the deriveContextHash specification.",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      return await this.provider.deriveContextHash(appName, context);
    } catch (error) {
      if (isUserRejectionMessage((error as Error | undefined)?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "OKX Wallet rejected the deriveContextHash approval",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      throw error;
    }
  };
}
