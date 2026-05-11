import { Psbt, address as btcAddress, networks } from "bitcoinjs-lib";

import { isAccountChangeEvent, DISCONNECT_EVENT, removeProviderListener } from "@/constants/walletEvents";
import type { BTCConfig, IBTCProvider, InscriptionIdentifier, SignPsbtOptions, WalletInfo } from "@/core/types";
import { Network } from "@/core/types";
import { initBTCCurve } from "@/core/utils/initBTCCurve";
import { resolveUseTweakedSigner } from "@/core/utils/psbtOptionsMapper";
import { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";

import logo from "./logo.svg";

enum UnisatChainEnum {
  BITCOIN_SIGNET = "BITCOIN_SIGNET",
  BITCOIN_MAINNET = "BITCOIN_MAINNET",
  BITCOIN_TESTNET = "BITCOIN_TESTNET",
}

interface UnisatChainResponse {
  enum: UnisatChainEnum;
  name: string;
  network: "testnet" | "livenet";
}

export const WALLET_PROVIDER_NAME = "Unisat";

const mapUnisatChainToNetwork = (chain: UnisatChainEnum): Network | null => {
  switch (chain) {
    case UnisatChainEnum.BITCOIN_MAINNET:
      return Network.MAINNET;
    case UnisatChainEnum.BITCOIN_SIGNET:
      return Network.SIGNET;
    case UnisatChainEnum.BITCOIN_TESTNET:
      return Network.TESTNET;
    default:
      return null;
  }
};

const mapNetworkToUnisatChain = (network: Network): UnisatChainEnum => {
  switch (network) {
    case Network.MAINNET:
      return UnisatChainEnum.BITCOIN_MAINNET;
    case Network.SIGNET:
      return UnisatChainEnum.BITCOIN_SIGNET;
    case Network.TESTNET:
      return UnisatChainEnum.BITCOIN_TESTNET;
  }
};

// Unisat derivation path for BTC Signet
// Taproot: `m/86'/1'/0'/0`
// Native Segwit: `m/84'/1'/0'/0`
export class UnisatProvider implements IBTCProvider {
  private provider: any;
  private walletInfo: WalletInfo | undefined;
  private config: BTCConfig;

  constructor(wallet: any, config: BTCConfig) {
    this.config = config;

    // check whether there is an Unisat extension
    if (!wallet) {
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Unisat Wallet extension not found",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    this.provider = wallet;
  }

  connectWallet = async (): Promise<void> => {
    try {
      await this.provider.requestAccounts();
    } catch (error) {
      if ((error as Error)?.message?.includes("rejected")) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "Connection to Unisat Wallet was rejected",
          wallet: WALLET_PROVIDER_NAME,
        });
      } else {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_FAILED,
          message: (error as Error)?.message || "Failed to request accounts from Unisat Wallet",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
    }

    // Unisat silently returns a wrong-network (or empty) account if the wallet
    // is on a chain the dApp does not target. Align the wallet to the configured
    // network before reading the address/pubkey so the connection cannot succeed
    // with a stale mainnet account when signet is required (and vice-versa).
    await this.ensureExpectedChain();

    // Use requestAccounts (not getAccounts) so per-chain dApp approval is
    // re-established after a chain switch. requestAccounts is idempotent on
    // already-authorized chains, so this does not produce an extra prompt.
    const accounts: string[] = await this.provider.requestAccounts();
    const address = accounts[0];
    const publicKeyHex = await this.provider.getPublicKey();

    if (publicKeyHex && address) {
      this.walletInfo = {
        publicKeyHex,
        address,
      };
    } else {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: "Could not connect to Unisat Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  private ensureExpectedChain = async (): Promise<void> => {
    let currentChain: UnisatChainResponse;
    try {
      currentChain = await this.provider.getChain();
    } catch (error) {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: (error as Error)?.message || "Failed to read Unisat Wallet network",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    if (mapUnisatChainToNetwork(currentChain.enum) === this.config.network) return;

    const expectedChain = mapNetworkToUnisatChain(this.config.network);
    const targetLabel = this.config.networkName || this.config.network;

    if (typeof this.provider.switchChain !== "function") {
      throw new WalletError({
        code: ERROR_CODES.UNSUPPORTED_NETWORK,
        message: `Unisat Wallet is on ${currentChain.name}, but ${targetLabel} is required. Switch networks in your Unisat extension and try again.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      await this.provider.switchChain(expectedChain);
    } catch (error) {
      const errorMessage = (error as Error)?.message || "";
      if (isUserRejectionMessage(errorMessage)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: `Switching Unisat Wallet to ${targetLabel} was rejected`,
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      throw new WalletError({
        code: ERROR_CODES.UNSUPPORTED_NETWORK,
        message: errorMessage || `Failed to switch Unisat Wallet to ${targetLabel}`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  getAddress = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.address;
  };

  getPublicKeyHex = async (): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.walletInfo.publicKeyHex;
  };

  signPsbt = async (psbtHex: string, options?: SignPsbtOptions): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!psbtHex)
      throw new WalletError({
        code: ERROR_CODES.PSBT_HEX_REQUIRED,
        message: "psbt hex is required",
        wallet: WALLET_PROVIDER_NAME,
      });

    const network = await this.getNetwork();
    try {
      let signOptions: { autoFinalized: boolean; toSignInputs: any[] };

      // If signInputs is provided, use it directly instead of auto-generating
      // This allows callers to specify exactly which inputs to sign
      if (options?.signInputs && options.signInputs.length > 0) {
        // UniSat's native field is `useTweakedSigner`; unlike OKX/OneKey/AppKit we
        // intentionally do NOT forward `disableTweakSigner`. `mapSignInputsToToSignInputs`
        // forwards both fields to cover older OKX versions that only understood the
        // legacy field — UniSat has always understood `useTweakedSigner`, so the
        // legacy field would be noise here.
        signOptions = {
          autoFinalized: options.autoFinalized ?? false,
          toSignInputs: options.signInputs.map((input) => {
            const useTweakedSigner = resolveUseTweakedSigner(input);
            return {
              index: input.index,
              publicKey: input.publicKey,
              address: input.address,
              sighashTypes: input.sighashTypes,
              ...(useTweakedSigner !== undefined && { useTweakedSigner }),
            };
          }),
        };
      } else {
        // Default behavior: auto-generate toSignInputs for all unsigned inputs
        const defaultOptions = this.getSignPsbtDefaultOptions(psbtHex, network);
        signOptions = {
          ...defaultOptions,
          autoFinalized: options?.autoFinalized ?? defaultOptions.autoFinalized,
        };
      }

      const signedHex = await this.provider.signPsbt(psbtHex, signOptions);
      return signedHex;
    } catch (error: Error | any) {
      if (isUserRejectionMessage(error?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "User rejected the PSBT signing request in Unisat Wallet",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      throw new WalletError({
        code: ERROR_CODES.SIGNATURE_EXTRACT_ERROR,
        message: error?.message || "Failed to sign PSBT with Unisat Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  // Order of PSBTs in the array must be the same as the order of options
  signPsbts = async (psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (!psbtsHexes || !Array.isArray(psbtsHexes) || psbtsHexes.length === 0)
      throw new WalletError({
        code: ERROR_CODES.PSBTS_HEXES_REQUIRED,
        message: "psbts hexes are required and must be a non-empty array",
        wallet: WALLET_PROVIDER_NAME,
      });

    const network = await this.getNetwork();
    try {
      const signOptions = psbtsHexes.map((psbtHex, index) => {
        const option = options?.[index];

        // If signInputs is provided, convert to toSignInputs format (like signPsbt does).
        // Forwards only `useTweakedSigner` — see the note in signPsbt above.
        if (option?.signInputs && option.signInputs.length > 0) {
          return {
            autoFinalized: option.autoFinalized ?? false,
            toSignInputs: option.signInputs.map((input) => {
              const useTweakedSigner = resolveUseTweakedSigner(input);
              return {
                index: input.index,
                publicKey: input.publicKey,
                address: input.address,
                sighashTypes: input.sighashTypes,
                ...(useTweakedSigner !== undefined && { useTweakedSigner }),
              };
            }),
          };
        }

        // Otherwise use default options
        return this.getSignPsbtDefaultOptions(psbtHex, network);
      });

      return await this.provider.signPsbts(psbtsHexes, signOptions);
    } catch (error: Error | any) {
      if (isUserRejectionMessage(error?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "User rejected the PSBT signing request in Unisat Wallet",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      throw new WalletError({
        code: ERROR_CODES.SIGNATURE_EXTRACT_ERROR,
        message: error?.message || "Failed to sign PSBTs with Unisat Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  private getSignPsbtDefaultOptions(psbtHex: string, network: Network) {
    const toSignInputs: any[] = [];
    const psbt = Psbt.fromHex(psbtHex);
    psbt.data.inputs.forEach((input, index) => {
      let useTweakedSigner = false;
      if (input.witnessUtxo && input.witnessUtxo.script) {
        let btcNetwork = networks.bitcoin;

        if (network === Network.TESTNET || network === Network.SIGNET) {
          btcNetwork = networks.testnet;
        }

        let addressToBeSigned;
        try {
          addressToBeSigned = btcAddress.fromOutputScript(input.witnessUtxo.script, btcNetwork);
        } catch (error: Error | any) {
          if (error instanceof Error && error.message.toLowerCase().includes("has no matching address")) {
            // initialize the BTC curve if not already initialized
            initBTCCurve();
            addressToBeSigned = btcAddress.fromOutputScript(input.witnessUtxo.script, btcNetwork);
          } else {
            throw new WalletError({
              code: ERROR_CODES.UNKNOWN_ERROR, // Or a more specific address generation error
              message: (error as Error)?.message || "Failed to determine address from output script",
              wallet: WALLET_PROVIDER_NAME,
            });
          }
        }
        // check if the address is a taproot address
        const isTaproot = addressToBeSigned.indexOf("tb1p") === 0 || addressToBeSigned.indexOf("bc1p") === 0;
        // check if the address is the same as the wallet address
        const isWalletAddress = addressToBeSigned === this.walletInfo?.address;
        // tweak the signer if needed
        if (isTaproot && isWalletAddress) {
          useTweakedSigner = true;
        }
      }

      const signed = input.finalScriptSig || input.finalScriptWitness;

      if (!signed) {
        toSignInputs.push({
          index,
          publicKey: this.walletInfo?.publicKeyHex,
          sighashTypes: undefined,
          useTweakedSigner,
        });
      }
    });

    return {
      autoFinalized: true,
      toSignInputs,
    };
  }

  getNetwork = async (): Promise<Network> => {
    const chainInfo: UnisatChainResponse = await this.provider.getChain();

    switch (chainInfo.enum) {
      case UnisatChainEnum.BITCOIN_MAINNET:
        return Network.MAINNET;
      case UnisatChainEnum.BITCOIN_SIGNET:
        return Network.SIGNET;
      case UnisatChainEnum.BITCOIN_TESTNET:
        // For testnet, we return Signet
        return Network.SIGNET;
      default:
        throw new WalletError({
          code: ERROR_CODES.UNSUPPORTED_NETWORK,
          message: "Unsupported network from Unisat Wallet",
          wallet: WALLET_PROVIDER_NAME,
        });
    }
  };

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return await this.provider.signMessage(message, type);
  };

  getInscriptions = async (): Promise<InscriptionIdentifier[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    if (this.config.network !== Network.MAINNET) {
      throw new WalletError({
        code: ERROR_CODES.INSCRIPTIONS_UNSUPPORTED_NETWORK,
        message: "Inscriptions are only available on Unisat Wallet BTC Mainnet",
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
        message: "Failed to get inscriptions from Unisat Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    return inscriptionIdentifiers;
  };

  on = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // Unisat uses "accountsChanged" for account change events
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
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // Unisat uses "accountsChanged" for account change events
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
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // UniSat exposes deriveContextHash on `window.unisat` per the spec
    // at docs/specs/derive-context-hash.md §2.1. If the installed
    // version is older than the one that shipped this method, we
    // surface a typed `WALLET_METHOD_NOT_SUPPORTED` so the caller can
    // gate on capability rather than receiving an opaque "X is not a
    // function" runtime error.
    if (typeof this.provider.deriveContextHash !== "function") {
      throw new WalletError({
        code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
        message:
          "Unisat Wallet version does not support deriveContextHash. Update to a version that implements the deriveContextHash specification.",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    try {
      return await this.provider.deriveContextHash(appName, context);
    } catch (error) {
      // Pass through user-rejection as a typed connection-rejected
      // error so callers can distinguish "user said no" from other
      // failures. isUserRejectionMessage matches the specific phrasings
      // wallets use ("user rejected", "user denied", ...) — not the bare
      // word "rejected", since wallet-side validation errors (e.g.
      // "context format rejected by wallet") also contain "rejected"
      // but should keep their original diagnostic shape.
      if (isUserRejectionMessage((error as Error | undefined)?.message)) {
        throw new WalletError({
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: "Unisat Wallet rejected the deriveContextHash approval",
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      // Everything else is rethrown unwrapped so the underlying
      // message and stack are preserved — collapsing wallet errors
      // would hide spec-validation failures the wallet must surface
      // (`appName` charset, `context` hex format, length bounds).
      throw error;
    }
  };
}
