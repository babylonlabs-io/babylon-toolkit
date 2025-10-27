import Transport from "@ledgerhq/hw-transport";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { Transaction } from "@scure/btc-signer";
import { Buffer } from "buffer";
import AppClient, { DefaultWalletPolicy, signMessage, signPsbt } from "ledger-bitcoin-babylon-boilerplate";

import type { BTCConfig, InscriptionIdentifier, SignPsbtOptions } from "@/core/types";
import { IBTCProvider, Network } from "@/core/types";
import { getPublicKeyFromXpub, toNetwork } from "@/core/utils/wallet";

import logo from "./logo.svg";
import { getPolicyForTransaction } from "./policy";


const USE_SIMULATOR = true; // true: emulator, false: real device
const SIMULATOR_URL = "http://localhost:5000";

// Simple browser-compatible Speculos transport
class BrowserSpeculosTransport extends Transport {
  private baseURL: string;

  constructor(baseURL: string = "http://localhost:5000") {
    super();
    this.baseURL = baseURL;
  }

  static async open(baseURL: string = "http://localhost:5000"): Promise<BrowserSpeculosTransport> {
    const transport = new BrowserSpeculosTransport(baseURL);
    return transport;
  }

  async exchange(apdu: Buffer): Promise<Buffer> {
    try {
      const response = await fetch(`${this.baseURL}/apdu`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          data: apdu.toString("hex").toUpperCase() 
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return Buffer.from(result.data, "hex");
    } catch (error) {
      console.error("APDU exchange failed:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // No cleanup needed for HTTP transport
  }

  setScrambleKey(): void {
    // Not applicable for HTTP transport
  }
}

type LedgerWalletInfo = {
  app: AppClient;
  policy: DefaultWalletPolicy;
  mfp: string | undefined;
  extendedPublicKey: string | undefined;
  address: string | undefined;
  path: string | undefined;
  publicKeyHex: string | undefined;
};

// 添加派生路径配置接口
interface DerivationConfig {
  purpose: 84 | 86; // BIP84 (P2WPKH) 或 BIP86 (P2TR)
  addressIndex: number; // 地址索引，默认为0
}

export const WALLET_PROVIDER_NAME = "Ledger";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function openSpeculosAndWait(baseURL: string = "http://localhost:5000"): Promise<BrowserSpeculosTransport> {
  for (let i = 0; i < 3; i++) {
    try {
      const transport = await BrowserSpeculosTransport.open(baseURL);
      return transport;
    } catch (e) {
      console.error(`Attempt ${i + 1} failed:`, e);
      if (i >= 2) {
        console.error("All attempts failed, throwing error");
        throw e;
      }
      await sleep(2000);
    }
  }
  throw new Error("Should not reach here");
}

export class LedgerProvider implements IBTCProvider {
  private ledgerWalletInfo: LedgerWalletInfo | undefined;
  private config: BTCConfig;
  private derivationConfig: DerivationConfig; // 添加派生路径配置

  constructor(_wallet: any, config: BTCConfig) {
    this.config = config;
    // 设置默认派生路径配置
    this.derivationConfig = {
      purpose: 86, // 默认使用BIP86 (P2TR)
      addressIndex: 0, // 默认地址索引为0
    };
  }

  private isUsingSimulator(): boolean {
    return USE_SIMULATOR;
  }

  private getSimulatorURL(): string {
    return SIMULATOR_URL;
  }

  // 添加设置派生路径配置的方法
  setDerivationConfig(config: Partial<DerivationConfig>): void {
    this.derivationConfig = {
      ...this.derivationConfig,
      ...config,
    };
  }

  // 添加获取派生路径配置的方法
  getDerivationConfig(): DerivationConfig {
    return { ...this.derivationConfig };
  }

  // Create a transport instance for Ledger devices
  async createTransport(): Promise<Transport> {
    if (this.isUsingSimulator()) {
      return await openSpeculosAndWait(this.getSimulatorURL());
    } else {
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
  }

  // Get the network derivation index based on the network
  // 0 for MAINNET, 1 for TESTNET
  private getNetworkDerivationIndex(): number {
    return this.config.network === Network.MAINNET ? 0 : 1;
  }

  private getDerivationPath(): string {
    const networkDerivationIndex = this.getNetworkDerivationIndex();
    // 返回3级路径：m/purpose'/networkIndex'/account'
    // account固定为0，最后两级/change/addressIndex由其他地方补充
    return `m/${this.derivationConfig.purpose}'/${networkDerivationIndex}'/0'`;
  }

  // Create a new AppClient instance using the transport
  private async createAppClient(): Promise<AppClient> {
    try {
      const transport = await this.createTransport();
      const appClient = new AppClient(transport);
      return appClient;
    } catch (error) {
      console.error("Error in createAppClient:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  private async getWalletPolicy(app: AppClient, fpr: string, derivationPath: string): Promise<DefaultWalletPolicy> { 
    try {
      const extendedPubKey = await app.getExtendedPubkey(derivationPath); 
      if (!extendedPubKey) {
        throw new Error("Could not retrieve the extended public key for policy");
      }
      
      const networkDerivationIndex = this.getNetworkDerivationIndex();
      const purpose = this.derivationConfig.purpose;
      
      // 根据purpose选择不同的策略描述符和模板
      let policyTemplate: string;
      if (purpose === 86) {
        policyTemplate = "tr(@0/**)"; // P2TR (Taproot)
      } else {
        policyTemplate = "wpkh(@0/**)"; // P2WPKH (默认)
      }
      
      // 策略描述符格式：[fingerprint/purpose'/networkIndex'/account']xpub
      // account固定为0，与getDerivationPath保持一致
      const policyDescriptor = `[${fpr}/${purpose}'/${networkDerivationIndex}'/0']${extendedPubKey}`;
      
      // 使用字符串创建策略，而不是尝试转换类型
      const policy = new DefaultWalletPolicy(policyTemplate as any, policyDescriptor);
      
      if (!policy) {
        throw new Error("Could not create the wallet policy");
      }
      return policy;
    } catch (error) {
      console.error("Error in getWalletPolicy:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  private async getLedgerAccount(
    app: AppClient,
    policy: DefaultWalletPolicy,
    extendedPublicKey: string,
  ): Promise<{ address: string; publicKeyHex: string }> {
    try {
      console.log("Getting Ledger account with policy:", policy);
      console.log("Extended Public Key:", extendedPublicKey);
      // Get and display on the screen the first address
      // We use change=0 (external) and addressIndex=0 (first address)
      const address = await app.getWalletAddress(
        policy,
        null,
        0, // 0 - normal, 1 - change
        0, // address index
        true, // show address on the wallet's screen
      );
      const currentNetwork = await this.getNetwork();
      const publicKeyBuffer = getPublicKeyFromXpub(extendedPublicKey, "M/0/0", toNetwork(currentNetwork));
      const publicKeyHex = publicKeyBuffer.toString("hex");
      return { address, publicKeyHex };
    } catch (error) {
      console.error("Error in getTaprootAccount:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  connectWallet = async (): Promise<void> => {
    try {
      const app = await this.createAppClient();
      // Get the master key fingerprint
      const fpr = await app.getMasterFingerprint();
      const derivationPathLv3 = this.getDerivationPath();
      console.log("Derivation Path (3 levels):", derivationPathLv3);
      console.log("Master Fingerprint:", fpr);
     
      const extendedPubkey = await app.getExtendedPubkey(derivationPathLv3);
      const accountPolicy = await this.getWalletPolicy(app, fpr, derivationPathLv3);
      console.log("Account Policy:", accountPolicy);
      if (!accountPolicy) throw new Error("Could not retrieve the policy");
      const { address, publicKeyHex } = await this.getLedgerAccount(
        app,
        accountPolicy,
        extendedPubkey,
      );
      this.ledgerWalletInfo = {
        app,
        policy: accountPolicy,
        mfp: fpr,
        extendedPublicKey: extendedPubkey,
        path: derivationPathLv3,
        address,
        publicKeyHex,
      };
    } catch (error) {
      console.error("Error in connectWallet:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
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
    console.log("Signing PSBT hex:", psbtHex);
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
      this.ledgerWalletInfo.path,
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

  signMessage = async (message: string): Promise<string> => {

    if (!this.ledgerWalletInfo?.app.transport || !this.ledgerWalletInfo?.path) {
      throw new Error("Ledger is not connected");
    }
    // signMessage requires a full 5-level derivation path
    // 补充最后两级：/change/addressIndex (0为external addresses)
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
