import Transport from "@ledgerhq/hw-transport";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { Transaction } from "@scure/btc-signer";
import AppClient, { DefaultWalletPolicy, signMessage, signPsbt } from "@tomo-inc/ledger-bitcoin-babylon";
import { Buffer } from "buffer";

import type { BTCConfig, InscriptionIdentifier, SignPsbtOptions } from "@/core/types";
import { IBTCProvider, Network } from "@/core/types";
import { getPublicKeyFromXpub, toNetwork } from "@/core/utils/wallet";

import logo from "./logo.svg";
import { getPolicyForTransaction } from "./policy";

type LedgerWalletInfo = {
  app: AppClient;
  policy: DefaultWalletPolicy;
  mfp: string | undefined;
  extendedPublicKey: string | undefined;
  address: string | undefined;
  path: string | undefined;
  publicKeyHex: string | undefined;
};

export const WALLET_PROVIDER_NAME = "Ledger";

export class LedgerProvider implements IBTCProvider {
  private ledgerWalletInfo: LedgerWalletInfo | undefined;
  private config: BTCConfig;

  constructor(_wallet: any, config: BTCConfig) {
    this.config = config;
  }

  // Create a transport instance for Ledger devices
  // It first tries to create a WebUSB transport
  // and if that fails, it falls back to WebHID
  private async createTransport(): Promise<Transport> {
    try {
      return await TransportWebUSB.create();
    } catch (usbError: Error | any) {
      try {
        return await TransportWebHID.create();
      } catch (hidError: Error | any) {
        throw new Error(
          `Could not connect to Ledger device: ${usbError.message || usbError}, ${hidError.message || hidError}`,
        );
      }
    }
  }

  // Get the network derivation index based on the network
  // 0 for MAINNET, 1 for TESTNET
  private getNetworkDerivationIndex(): number {
    return this.config.network === Network.MAINNET ? 0 : 1;
  }

  private getDerivationPath(): string {
    const networkDerivationIndex = this.getNetworkDerivationIndex();
    return `m/86'/${networkDerivationIndex}'/0'`;
  }

  // Create a new AppClient instance using the transport
  private async createAppClient(): Promise<AppClient> {
    const transport = await this.createTransport();
    return new AppClient(transport);
  }

  private async getWalletPolicy(app: AppClient, fpr: string, derivationPath: string): Promise<DefaultWalletPolicy> {
    const extendedPubKey = await app.getExtendedPubkey(derivationPath);
    if (!extendedPubKey) {
      throw new Error("Could not retrieve the extended public key for policy");
    }
    const networkDerivationIndex = this.getNetworkDerivationIndex();
    const policy = new DefaultWalletPolicy("tr(@0/**)", `[${fpr}/86'/${networkDerivationIndex}'/0']${extendedPubKey}`);
    if (!policy) {
      throw new Error("Could not create the wallet policy");
    }
    return policy;
  }

  private async getTaprootAccount(
    app: AppClient,
    policy: DefaultWalletPolicy,
    extendedPublicKey: string,
  ): Promise<{ address: string; publicKeyHex: string }> {
    const address = await app.getWalletAddress(
      policy,
      null,
      0, // 0 - normal, 1 - change
      0, // address index
      true, // show address on the wallet's screen
    );

    const currentNetwork = await this.getNetwork();
    const publicKeyBuffer = getPublicKeyFromXpub(extendedPublicKey, "M/0/0", toNetwork(currentNetwork));

    return { address, publicKeyHex: publicKeyBuffer.toString("hex") };
  }

  connectWallet = async (): Promise<void> => {
    const app = await this.createAppClient();

    // Get the master key fingerprint
    const fpr = await app.getMasterFingerprint();

    const taprootPath = this.getDerivationPath();

    // Get and display on the screen the first taproot address
    const firstTaprootAccountExtendedPubkey = await app.getExtendedPubkey(taprootPath);

    const firstTaprootAccountPolicy = await this.getWalletPolicy(app, fpr, taprootPath);

    if (!firstTaprootAccountPolicy) throw new Error("Could not retrieve the policy");

    const { address, publicKeyHex } = await this.getTaprootAccount(
      app,
      firstTaprootAccountPolicy,
      firstTaprootAccountExtendedPubkey,
    );

    this.ledgerWalletInfo = {
      app,
      policy: firstTaprootAccountPolicy,
      mfp: fpr,
      extendedPublicKey: firstTaprootAccountExtendedPubkey,
      path: taprootPath,
      address,
      publicKeyHex,
    };
  };

  getAddress = async (): Promise<string> => {
    if (!this.ledgerWalletInfo?.address) throw new Error("Could not retrieve the address");

    return this.ledgerWalletInfo.address;
  };

  getPublicKeyHex = async (): Promise<string> => {
    if (!this.ledgerWalletInfo?.publicKeyHex) throw new Error("Could not retrieve the BTC public key");

    return this.ledgerWalletInfo.publicKeyHex;
  };

  signPsbt = async (psbtHex: string, options?: SignPsbtOptions): Promise<string> => {
    if (!this.ledgerWalletInfo?.address || !this.ledgerWalletInfo?.publicKeyHex) {
      throw new Error("Ledger is not connected");
    }
    if (!psbtHex) throw new Error("psbt hex is required");
    const psbtBase64 = Buffer.from(psbtHex, "hex").toString("base64");
    const transport = this.ledgerWalletInfo.app.transport;
    if (!transport || !(transport instanceof Transport)) {
      throw new Error("Transport is required to sign psbt");
    }
    if (!this.ledgerWalletInfo.path) {
      throw new Error("Derivation path is required to sign psbt");
    }

    if (!options?.contracts || options?.contracts.length === 0) {
      throw new Error("Contracts are required to sign psbt in ledger");
    } else if (!options?.action?.name) {
      throw new Error("Action name is required to sign psbt in ledger");
    }

    // Get the appropriate policy based on transaction type
    const policy = await getPolicyForTransaction(
      transport,
      this.config.network,
      this.ledgerWalletInfo.path,
      psbtBase64,
      {
        contracts: options.contracts,
        action: options.action,
      },
    );

    const deviceTransaction = await signPsbt({
      transport,
      psbt: psbtBase64,
      policy,
    });
    const tx = Transaction.fromPSBT(deviceTransaction.toPSBT(), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
    });
    tx.finalize();
    const signedPsbtHex = Buffer.from(tx.toPSBT()).toString("hex");

    return signedPsbtHex;
  };

  signPsbts = async (psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> => {
    if (!this.ledgerWalletInfo?.address || !this.ledgerWalletInfo?.publicKeyHex || !this.ledgerWalletInfo?.policy) {
      throw new Error("Ledger is not connected");
    }
    if (!psbtsHexes || !Array.isArray(psbtsHexes) || psbtsHexes.length === 0) {
      throw new Error("psbts hexes are required");
    }

    const result = [];

    // Sign each psbt with corresponding options
    for (let i = 0; i < psbtsHexes.length; i++) {
      const psbt = psbtsHexes[i];
      const optionsForPsbt = options ? options[i] : undefined;
      if (!psbt) {
        throw new Error(`psbt hex at index ${i} is required`);
      }
      if (typeof psbt !== "string") {
        throw new Error(`psbt hex at index ${i} must be a string`);
      }
      const signedPsbtHex = await this.signPsbt(psbt, optionsForPsbt);
      result.push(signedPsbtHex);
    }

    return result;
  };

  getNetwork = async (): Promise<Network> => {
    return this.config.network;
  };

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> => {
    if (!this.ledgerWalletInfo?.app.transport || !this.ledgerWalletInfo?.path) {
      throw new Error("Ledger is not connected");
    }
    const isTestnet = this.config.network !== Network.MAINNET;

    const signedMessage = await signMessage({
      transport: this.ledgerWalletInfo?.app.transport,
      message,
      type,
      isTestnet,
      derivationPath: this.ledgerWalletInfo.path,
    });

    return signedMessage.signature;
  };

  getInscriptions = async (): Promise<InscriptionIdentifier[]> => {
    throw new Error("Method not implemented.");
  };

  // Not implemented because of the hardware wallet nature
  on = (): void => {};
  off = (): void => {};

  getWalletProviderName = async (): Promise<string> => {
    return WALLET_PROVIDER_NAME;
  };

  getWalletProviderIcon = async (): Promise<string> => {
    return logo;
  };
}
