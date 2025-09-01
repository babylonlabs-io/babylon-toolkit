import { Psbt, address as btcAddress, networks } from "bitcoinjs-lib";

import type { BTCConfig, IBTCProvider, InscriptionIdentifier, SignPsbtOptions, WalletInfo } from "@/core/types";
import { Network } from "@/core/types";
import { initBTCCurve } from "@/core/utils/initBTCCurve";
import { ERROR_CODES, WalletError } from "@/error";

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
    let accounts;
    try {
      accounts = await this.provider.requestAccounts();
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
      const defaultOptions = this.getSignPsbtDefaultOptions(psbtHex, network);
      const signOptions = {
        ...defaultOptions,
        ...options,
      };
      const signedHex = await this.provider.signPsbt(psbtHex, signOptions);
      return signedHex;
    } catch (error: Error | any) {
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
      const defaultOptions = psbtsHexes.map((psbtHex) => this.getSignPsbtDefaultOptions(psbtHex, network));
      const signOptions = options?.map((option, index) => ({
        ...defaultOptions[index],
        ...option,
      }));
      return await this.provider.signPsbts(psbtsHexes, signOptions);
    } catch (error: Error | any) {
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

    // subscribe to account change event: `accountChanged` -> `accountsChanged`
    if (eventName === "accountChanged") {
      return this.provider.on("accountsChanged", callBack);
    }
  };

  off = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Unisat Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // unsubscribe from account change event: `accountChanged` -> `accountsChanged`
    if (eventName === "accountChanged") {
      return this.provider.removeListener("accountsChanged", callBack);
    }
  };

  getWalletProviderName = async (): Promise<string> => {
    return WALLET_PROVIDER_NAME;
  };

  getWalletProviderIcon = async (): Promise<string> => {
    return logo;
  };
}
