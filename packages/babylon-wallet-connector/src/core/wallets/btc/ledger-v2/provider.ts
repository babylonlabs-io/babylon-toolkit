import Transport from "@ledgerhq/hw-transport";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { Transaction } from "@scure/btc-signer";
import { Buffer } from "buffer";
import AppClient, { DefaultWalletPolicy, getBbnVersion, signMessage, signPsbt } from "ledger-bitcoin-babylon-boilerplate";

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

/**
 * Derivation configuration for Ledger wallet
 * - purpose 84: Native SegWit (wpkh) addresses - BIP84
 * - purpose 86: Taproot (tr) addresses - BIP86
 */
interface DerivationConfig {
  purpose: 84 | 86;
  addressIndex: number;
}

export const WALLET_PROVIDER_NAME = "Ledger";

export class LedgerProviderV2 implements IBTCProvider {
  private ledgerWalletInfo: LedgerWalletInfo | undefined;
  private config: BTCConfig;
  private derivationConfig: DerivationConfig;

  constructor(_wallet: any, config: BTCConfig) {
    this.config = config;
    this.derivationConfig = {
      purpose: 84,
      addressIndex: 0,
    };
  }

  /**
   * Set the derivation configuration for address generation
   * @param config - Partial derivation config to merge with current settings
   */
  setDerivationConfig(config: Partial<DerivationConfig>): void {
    this.derivationConfig = {
      ...this.derivationConfig,
      ...config,
    };
  }

  /**
   * Get the current derivation configuration
   * @returns A copy of the current derivation config
   */
  getDerivationConfig(): DerivationConfig {
    return { ...this.derivationConfig };
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
    return `m/${this.derivationConfig.purpose}'/${networkDerivationIndex}'/0'`;
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
    const purpose = this.derivationConfig.purpose;

    // Select policy template based on purpose
    // purpose 86: Taproot (tr)
    // purpose 84: Native SegWit (wpkh)
    let policyTemplate: string;
    if (purpose === 86) {
      policyTemplate = "tr(@0/**)";
    } else if (purpose === 84) {
      policyTemplate = "wpkh(@0/**)";
    } else {
      throw new Error(`Unsupported purpose ${purpose}. Only 84 (wpkh) and 86 (tr) are supported.`);
    }

    const policyDescriptor = `[${fpr}/${purpose}'/${networkDerivationIndex}'/0']${extendedPubKey}`;
    const policy = new DefaultWalletPolicy(policyTemplate as any, policyDescriptor);

    if (!policy) {
      throw new Error("Could not create the wallet policy");
    }
    return policy;
  }

  private async getLedgerAccount(
    app: AppClient,
    policy: DefaultWalletPolicy,
    extendedPublicKey: string,
  ): Promise<{ address: string; publicKeyHex: string }> {
    const address = await app.getWalletAddress(
      policy,
      null,
      0, // 0 - normal, 1 - change
      this.derivationConfig.addressIndex,
      true, // show address on the wallet's screen
    );

    const currentNetwork = await this.getNetwork();
    const publicKeyBuffer = getPublicKeyFromXpub(
      extendedPublicKey,
      `M/0/${this.derivationConfig.addressIndex}`,
      toNetwork(currentNetwork),
    );

    return { address, publicKeyHex: publicKeyBuffer.toString("hex") };
  }

  connectWallet = async (): Promise<void> => {
    const app = await this.createAppClient();

    // Detect firmware version - v2 required
    const firmwareVersion = await getBbnVersion(app.transport);

    if (firmwareVersion < 2) {
      throw new Error(`Ledger firmware version too low. Required: v2 or higher, Found: v${firmwareVersion}`);
    }

    // Get the master key fingerprint
    const fpr = await app.getMasterFingerprint();

    const accountDerivationPath = this.getDerivationPath();

    // Get the extended public key for the derivation path
    const extendedPubkey = await app.getExtendedPubkey(accountDerivationPath);

    const accountPolicy = await this.getWalletPolicy(app, fpr, accountDerivationPath);

    if (!accountPolicy) throw new Error("Could not retrieve the policy");

    const { address, publicKeyHex } = await this.getLedgerAccount(app, accountPolicy, extendedPubkey);

    this.ledgerWalletInfo = {
      app,
      policy: accountPolicy,
      mfp: fpr,
      extendedPublicKey: extendedPubkey,
      path: accountDerivationPath,
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
    const policy = await getPolicyForTransaction(transport, this.ledgerWalletInfo.path, {
      contracts: options.contracts,
      action: options.action,
      addressIndex: this.derivationConfig.addressIndex,
    });

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

  signMessage = async (message: string): Promise<string> => {
    if (!this.ledgerWalletInfo?.app.transport || !this.ledgerWalletInfo?.path) {
      throw new Error("Ledger is not connected");
    }

    const fullDerivationPath = `${this.ledgerWalletInfo.path}/0/${this.derivationConfig.addressIndex}`;

    const signedMessage = await signMessage({
      transport: this.ledgerWalletInfo?.app.transport,
      message,
      derivationPath: fullDerivationPath,
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
