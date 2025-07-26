import { KeystoneBitcoinSDK, KeystoneSDK, UR } from "@keystonehq/keystone-sdk";
import { viewSdk as keystoneViewSDK, PlayStatus, ReadStatus, SDK, SupportedResult } from "@keystonehq/sdk";
import { PsbtInput } from "bip174/src/lib/interfaces";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { tapleafHash } from "bitcoinjs-lib/src/payments/bip341";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { pubkeyInScript } from "bitcoinjs-lib/src/psbt/psbtutils";
import { Buffer } from "buffer";
import { v4 as uuidv4 } from "uuid";

import type { BTCConfig, InscriptionIdentifier } from "@/core/types";
import { IBTCProvider, Network } from "@/core/types";
import BIP322 from "@/core/utils/bip322";
import { generateP2TRAddressFromXpub, toNetwork } from "@/core/utils/wallet";
import { ERROR_CODES, WalletError } from "@/error";

import logo from "./logo.svg";

type KeystoneWalletInfo = {
  mfp: string | undefined;
  extendedPublicKey: string | undefined;
  path: string | undefined;
  address: string | undefined;
  publicKeyHex: string | undefined;
  scriptPubKeyHex: string | undefined;
};

export const WALLET_PROVIDER_NAME = "Keystone";

export class KeystoneProvider implements IBTCProvider {
  private keystoneWalletInfo: KeystoneWalletInfo | undefined;
  private viewSDK: typeof keystoneViewSDK;
  private dataSdk: KeystoneSDK;
  private config: BTCConfig;

  constructor(_wallet: any, config: BTCConfig) {
    this.config = config;
    keystoneViewSDK.bootstrap();
    this.viewSDK = keystoneViewSDK;
    this.dataSdk = new KeystoneSDK({
      origin: "babylon staking app",
    });
  }

  /**
   * Connects the staking app to the Keystone device and retrieves the necessary information.
   * @returns A Promise that resolves to the current instance of the class.
   * @throws An error if there is an issue reading the QR code or retrieving the extended public key.
   */
  connectWallet = async (): Promise<void> => {
    const keystoneContainer = await this.viewSDK.getSdk();

    // Initialize the Keystone container and read the QR code for sync keystone device with the staking app.
    const decodedResult = await keystoneContainer.read([SupportedResult.UR_CRYPTO_ACCOUNT], {
      title: "Sync Keystone with Babylon Staking App",
      description:
        "Please scan the QR code displayed on your Keystone, Currently only the first Taproot Address will be used",
      renderInitial: {
        walletMode: "btc",
        link: "",
        description: [
          "1. Turn on your Keystone 3 with BTC only firmware.",
          '2. Click connect software wallet and use "Sparrow" for connection.',
          '3. Press the "Sync Keystone" button and scan the QR Code displayed on your Keystone hardware wallet',
          "4. The first Taproot address will be used for staking.",
        ],
      },
      URTypeErrorMessage:
        "The scanned QR code is not the sync code from the Keystone hardware wallet. Please verify the code and try again.",
    });

    if (decodedResult.status === ReadStatus.canceled) {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_CANCELED,
        message: "Connection to Keystone was canceled",
        wallet: WALLET_PROVIDER_NAME,
      });
    } else if (decodedResult.status !== ReadStatus.success) {
      throw new WalletError({
        code: ERROR_CODES.QR_READ_ERROR,
        message: "Error reading QR code, Please try again.",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    // parse the QR Code and get extended public key and other required information
    const accountData = this.dataSdk.parseAccount(decodedResult.result);

    // currently only the p2tr address will be used.
    const P2TRINDEX = 3;
    const xpub = accountData.keys[P2TRINDEX].extendedPublicKey;

    this.keystoneWalletInfo = {
      mfp: accountData.masterFingerprint,
      extendedPublicKey: xpub,
      path: accountData.keys[P2TRINDEX].path,
      address: undefined,
      publicKeyHex: undefined,
      scriptPubKeyHex: undefined,
    };

    if (!this.keystoneWalletInfo.extendedPublicKey)
      throw new WalletError({
        code: ERROR_CODES.EXTENSION_NOT_FOUND,
        message: "Could not retrieve the extended public key",
        wallet: WALLET_PROVIDER_NAME,
      });

    // generate the address and public key based on the xpub
    const { address, publicKeyHex, scriptPubKeyHex } = generateP2TRAddressFromXpub(
      this.keystoneWalletInfo.extendedPublicKey,
      "M/0/0",
      toNetwork(this.config.network),
    );
    this.keystoneWalletInfo.address = address;
    this.keystoneWalletInfo.publicKeyHex = publicKeyHex;
    this.keystoneWalletInfo.scriptPubKeyHex = scriptPubKeyHex;
  };

  getAddress = async (): Promise<string> => {
    if (!this.keystoneWalletInfo?.address)
      throw new WalletError({
        code: ERROR_CODES.ADDRESS_NOT_FOUND,
        message: "Could not retrieve the address",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.keystoneWalletInfo.address;
  };

  getPublicKeyHex = async (): Promise<string> => {
    if (!this.keystoneWalletInfo?.publicKeyHex)
      throw new WalletError({
        code: ERROR_CODES.PUBLIC_KEY_NOT_FOUND,
        message: "Could not retrieve the BTC public key",
        wallet: WALLET_PROVIDER_NAME,
      });

    return this.keystoneWalletInfo.publicKeyHex;
  };

  signPsbt = async (psbtHex: string): Promise<string> => {
    if (!this.keystoneWalletInfo?.address || !this.keystoneWalletInfo?.publicKeyHex) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Keystone Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    if (!psbtHex)
      throw new WalletError({
        code: ERROR_CODES.PSBT_HEX_REQUIRED,
        message: "psbt hex is required",
        wallet: WALLET_PROVIDER_NAME,
      });

    // enhance the PSBT with the BIP32 derivation information
    // to tell keystone which key to use to sign the PSBT
    let psbt = Psbt.fromHex(psbtHex);
    psbt = this.enhancePsbt(psbt);
    const enhancedPsbt = psbt.toHex();
    // sign the psbt with keystone
    const signedPsbt = await this.sign(enhancedPsbt);
    return signedPsbt.toHex();
  };

  signPsbts = async (psbtsHexes: string[]): Promise<string[]> => {
    if (!this.keystoneWalletInfo?.address || !this.keystoneWalletInfo?.publicKeyHex) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Keystone Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    if (!psbtsHexes && !Array.isArray(psbtsHexes))
      throw new WalletError({
        code: ERROR_CODES.PSBTS_HEXES_REQUIRED,
        message: "psbts hexes are required",
        wallet: WALLET_PROVIDER_NAME,
      });

    const result = [];
    for (const psbt of psbtsHexes) {
      const signedHex = await this.signPsbt(psbt);
      result.push(signedHex);
    }
    return result;
  };

  getNetwork = async (): Promise<Network> => {
    return this.config.network;
  };

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> => {
    if (type === "bip322-simple") {
      return this.signMessageBIP322(message);
    } else {
      return this.signMessageECDSA(message);
    }
  };

  /**
   * https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki
   * signMessageBIP322 signs a message using the BIP322 standard.
   * @param message
   * @returns signature
   */
  signMessageBIP322 = async (message: string): Promise<string> => {
    if (!this.keystoneWalletInfo?.scriptPubKeyHex || !this.keystoneWalletInfo?.publicKeyHex) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Keystone Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    // Construct the psbt of Bip322 message signing
    const scriptPubKey = Buffer.from(this.keystoneWalletInfo.scriptPubKeyHex, "hex");
    const toSpendTx = BIP322.buildToSpendTx(message, scriptPubKey);
    const internalPublicKey = toXOnly(Buffer.from(this.keystoneWalletInfo.publicKeyHex, "hex"));
    let psbt = BIP322.buildToSignTx(toSpendTx.getId(), scriptPubKey, false, internalPublicKey);

    // Set the sighashType to bitcoin.Transaction.SIGHASH_ALL since it defaults to SIGHASH_DEFAULT
    psbt.updateInput(0, {
      sighashType: Transaction.SIGHASH_ALL,
    });

    // Ehance the PSBT with the BIP32 derivation information
    psbt = this.enhancePsbt(psbt);
    const signedPsbt = await this.sign(psbt.toHex());
    return BIP322.encodeWitness(signedPsbt);
  };

  signMessageECDSA = async (message: string): Promise<string> => {
    if (!this.keystoneWalletInfo?.address || !this.keystoneWalletInfo?.publicKeyHex) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Keystone Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    const ur = this.dataSdk.btc.generateSignRequest({
      requestId: uuidv4(),
      signData: Buffer.from(message, "utf-8").toString("hex"),
      dataType: KeystoneBitcoinSDK.DataType.message,
      accounts: [
        {
          path: `${this.keystoneWalletInfo.path}/0/0`,
          xfp: `${this.keystoneWalletInfo.mfp}`,
          address: this.keystoneWalletInfo.address,
        },
      ],
      origin: "babylon staking app",
    });

    const signMessage = composeQRProcess(SupportedResult.UR_BTC_SIGNATURE);

    const keystoneContainer = await this.viewSDK.getSdk();
    const signedMessageUR = await signMessage(keystoneContainer, ur);

    const result = this.dataSdk.btc.parseSignature(signedMessageUR);
    return Buffer.from(result.signature, "hex").toString("base64");
  };

  getInscriptions = async (): Promise<InscriptionIdentifier[]> => {
    throw new WalletError({
      code: ERROR_CODES.METHOD_NOT_IMPLEMENTED,
      message: "Method not implemented.",
      wallet: WALLET_PROVIDER_NAME,
    });
  };

  // Not implemented because of the Airgapped HW nature
  on = (): void => {};
  off = (): void => {};

  getWalletProviderName = async (): Promise<string> => {
    return WALLET_PROVIDER_NAME;
  };

  getWalletProviderIcon = async (): Promise<string> => {
    return logo;
  };

  /**
   * Sign the PSBT with the Keystone device.
   *
   * @param psbtHex - The PSBT in hex format.
   * @returns The signed PSBT in hex format.
   * */
  private sign = async (psbtHex: string): Promise<Psbt> => {
    if (!psbtHex)
      throw new WalletError({
        code: ERROR_CODES.PSBT_HEX_REQUIRED,
        message: "psbt hex is required",
        wallet: WALLET_PROVIDER_NAME,
      });
    const ur = this.dataSdk.btc.generatePSBT(Buffer.from(psbtHex, "hex"));

    // compose the signing process for the Keystone device
    const signPsbt = composeQRProcess(SupportedResult.UR_PSBT);

    const keystoneContainer = await this.viewSDK.getSdk();
    const signePsbtUR = await signPsbt(keystoneContainer, ur);

    // extract the signed PSBT from the UR
    const signedPsbtHex = this.dataSdk.btc.parsePSBT(signePsbtUR);
    const signedPsbt = Psbt.fromHex(signedPsbtHex);
    signedPsbt.finalizeAllInputs();
    return signedPsbt;
  };

  /**
   * Add the BIP32 derivation information for each input.
   * The Keystone device is stateless, so it needs to know which key to use to sign the PSBT.
   * Therefore, add the Taproot BIP32 derivation information to the PSBT.
   * https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki#Specification
   * @param psbt - The PSBT object.
   * @returns The PSBT object with the BIP32 derivation information added.
   */
  private enhancePsbt = (psbt: Psbt): Psbt => {
    if (
      !this.keystoneWalletInfo?.scriptPubKeyHex ||
      !this.keystoneWalletInfo?.publicKeyHex ||
      !this.keystoneWalletInfo?.mfp ||
      !this.keystoneWalletInfo?.path
    ) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: "Keystone Wallet not connected",
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    const bip32Derivation = {
      masterFingerprint: Buffer.from(this.keystoneWalletInfo.mfp, "hex"),
      path: `${this.keystoneWalletInfo.path}/0/0`,
      pubkey: Buffer.from(this.keystoneWalletInfo.publicKeyHex, "hex"),
    };

    psbt.data.inputs.forEach((input) => {
      input.tapBip32Derivation = [
        {
          ...bip32Derivation,
          pubkey: toXOnly(bip32Derivation.pubkey),
          leafHashes: calculateTapLeafHash(input, bip32Derivation.pubkey),
        },
      ];
    });
    return psbt;
  };
}

/**
 * High order function to compose the QR generation and scanning process for specific data types.
 * Composes the QR code process for the Keystone device.
 * @param destinationDataType - The type of data to be read from the QR code.
 * @returns A function that plays the UR in the QR code and reads the result.
 */
const composeQRProcess =
  (destinationDataType: SupportedResult) =>
  async (container: SDK, ur: UR): Promise<UR> => {
    // make the container play the UR in the QR code
    const status: PlayStatus = await container.play(ur, {
      title: "Scan the QR Code",
      description: "Please scan the QR code with your Keystone device.",
    });

    // if the QR code is scanned successfully, read the result
    if (status !== PlayStatus.success)
      throw new WalletError({
        code: ERROR_CODES.QR_SCAN_ERROR,
        message: "Could not generate the QR code, please try again.",
        wallet: WALLET_PROVIDER_NAME,
      });

    const urResult = await container.read([destinationDataType], {
      title: "Get the Signature from Keystone",
      description: "Please scan the QR code displayed on your Keystone",
      URTypeErrorMessage: "The scanned QR code can't be read. please verify and try again.",
    });

    // return the result if the QR code data(UR) of scanned successfully
    if (urResult.status !== ReadStatus.success)
      throw new WalletError({
        code: ERROR_CODES.SIGNATURE_EXTRACT_ERROR,
        message: "Could not extract the signature, please try again.",
        wallet: WALLET_PROVIDER_NAME,
      });
    return urResult.result;
  };

/**
 * Calculates the tap leaf hashes for a given PsbtInput and public key.
 * @param input - The PsbtInput object.
 * @param pubkey - The public key as a Buffer.
 * @returns An array of tap leaf hashes.
 */
const calculateTapLeafHash = (input: PsbtInput, pubkey: Buffer) => {
  if (input.tapInternalKey && !input.tapLeafScript) {
    return [];
  }
  const tapLeafHashes = (input.tapLeafScript || [])
    .filter((tapLeaf) => pubkeyInScript(pubkey, tapLeaf.script))
    .map((tapLeaf) => {
      const hash = tapleafHash({
        output: tapLeaf.script,
        version: tapLeaf.leafVersion,
      });
      return Object.assign({ hash }, tapLeaf);
    });

  return tapLeafHashes.map((each) => each.hash);
};
