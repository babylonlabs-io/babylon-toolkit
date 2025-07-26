import type { BTCConfig, InscriptionIdentifier, WalletInfo } from "@/core/types";
import { IBTCProvider, Network } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

import logo from "./logo.svg";

const PROVIDER_NAMES = {
  [Network.MAINNET]: "bitcoin",
  [Network.TESTNET]: "bitcoinTestnet",
  [Network.SIGNET]: "bitcoinSignet",
};

export const WALLET_PROVIDER_NAME = "OKX";

export class OKXProvider implements IBTCProvider {
  private provider: any;
  private walletInfo: WalletInfo | undefined;
  private config: BTCConfig;

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
    } else {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: "Could not connect to OKX Wallet",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
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

  signPsbt = async (psbtHex: string): Promise<string> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    return await this.provider.signPsbt(psbtHex);
  };

  signPsbts = async (psbtsHexes: string[]): Promise<string[]> => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

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

    // subscribe to account change event
    if (eventName === "accountChanged") {
      return this.provider.on(eventName, callBack);
    }
  };

  off = (eventName: string, callBack: () => void) => {
    if (!this.walletInfo)
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "OKX Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });

    // unsubscribe from account change event
    if (eventName === "accountChanged") {
      return this.provider.off(eventName, callBack);
    }
  };

  getWalletProviderName = async (): Promise<string> => {
    return WALLET_PROVIDER_NAME;
  };

  getWalletProviderIcon = async (): Promise<string> => {
    return logo;
  };
}
