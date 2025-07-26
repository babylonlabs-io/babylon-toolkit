import { HDKey } from "@scure/bip32";
import { Network as BitcoinNetwork, networks, payments } from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import { Network } from "@/core/types";
import { initBTCCurve } from "@/core/utils/initBTCCurve";
import { ERROR_CODES, WalletError } from "@/error";
export const COMPRESSED_PUBLIC_KEY_HEX_LENGTH = 66;

const NETWORKS = {
  [Network.MAINNET]: {
    name: "Mainnet",
    config: networks.bitcoin,
    addressPrefix: {
      common: "bc1",
      nativeSegWit: "bc1q",
      taproot: "bc1p",
    },
  },
  [Network.TESTNET]: {
    name: "Testnet",
    config: networks.testnet,
    addressPrefix: {
      common: "tb1",
      nativeSegWit: "tb1q",
      taproot: "tb1p",
    },
  },
  [Network.SIGNET]: {
    name: "Signet",
    config: networks.testnet,
    addressPrefix: {
      common: "tb1",
      nativeSegWit: "tb1q",
      taproot: "tb1p",
    },
  },
};

export const getTaprootAddress = (publicKey: string, network: Network) => {
  if (publicKey.length == COMPRESSED_PUBLIC_KEY_HEX_LENGTH) {
    publicKey = publicKey.slice(2);
  }

  const internalPubkey = Buffer.from(publicKey, "hex");
  const { address, output: scriptPubKey } = payments.p2tr({
    internalPubkey: toXOnly(internalPubkey),
    network: NETWORKS[network].config,
  });

  if (!address || !scriptPubKey) {
    throw new WalletError({
      code: ERROR_CODES.ADDRESS_GENERATION_FAILED,
      message: "Failed to generate taproot address or script from public key",
    });
  }

  return address;
};

export const getNativeSegwitAddress = (publicKey: string, network: Network) => {
  if (publicKey.length !== COMPRESSED_PUBLIC_KEY_HEX_LENGTH) {
    throw new WalletError({
      code: ERROR_CODES.INVALID_PUBLIC_KEY,
      message: "Invalid public key length for generating native segwit address",
    });
  }

  const internalPubkey = Buffer.from(publicKey, "hex");
  const { address, output: scriptPubKey } = payments.p2wpkh({
    pubkey: internalPubkey,
    network: NETWORKS[network].config,
  });

  if (!address || !scriptPubKey) {
    throw new WalletError({
      code: ERROR_CODES.ADDRESS_GENERATION_FAILED,
      message: "Failed to generate native segwit address or script from public key",
    });
  }

  return address;
};

export function validateAddressWithPK(address: string, publicKey: string, network: Network) {
  if (address.startsWith(NETWORKS[network].addressPrefix.taproot)) {
    return address === getTaprootAddress(publicKey, network);
  }

  if (address.startsWith(NETWORKS[network].addressPrefix.nativeSegWit)) {
    return address === getNativeSegwitAddress(publicKey, network);
  }

  return false;
}

export function validateAddress(network: Network, address: string): void {
  const { addressPrefix, name } = NETWORKS[network];

  if (!(network in NETWORKS)) {
    throw new WalletError({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      message: `Unsupported network: ${network}. Please provide a valid network.`,
    });
  }

  if (!address.startsWith(addressPrefix.common)) {
    throw new WalletError({
      code: ERROR_CODES.INVALID_ADDRESS_PREFIX,
      message: `Incorrect address prefix for ${name}. Expected address to start with '${addressPrefix.common}'.`,
    });
  }
}

export const toNetwork = (network: Network): networks.Network => NETWORKS[network].config;

/**
 * Extracts the public key from an extended public key (xpub) using a specified derivation path.
 * @param xpub - The extended public key.
 * @param path - The derivation path.
 * @param network - The Bitcoin network.
 * @returns The public key as a Buffer.
 */
export const getPublicKeyFromXpub = (xpub: string, path: string, network?: BitcoinNetwork): Buffer => {
  const hdNode = HDKey.fromExtendedKey(xpub, network?.bip32);
  const derivedNode = hdNode.derive(path);
  return Buffer.from(derivedNode.publicKey!);
};

/**
 * Generates the p2tr Bitcoin address from an extended public key and a path.
 * @param xpub - The extended public key.
 * @param path - The derivation path.
 * @param network - The Bitcoin network.
 * @returns An object containing the address, public key in hex format, and scriptPubKey in hex format.
 */
export const generateP2TRAddressFromXpub = (
  xpub: string,
  path: string,
  network: BitcoinNetwork,
): { address: string; publicKeyHex: string; scriptPubKeyHex: string } => {
  // Keystone uses xpub as the extended public key, hence we don't need to pass the network
  const pubkeyBuffer = getPublicKeyFromXpub(xpub, path);
  const childNodeXOnlyPubkey = toXOnly(pubkeyBuffer);
  let address: string;
  let output: Buffer;
  try {
    const res = payments.p2tr({
      internalPubkey: childNodeXOnlyPubkey,
      network,
    });
    address = res.address!;
    output = res.output!;
  } catch (error: Error | any) {
    if (error instanceof Error && error.message.includes("ECC")) {
      // initialize the BTC curve if not already initialized
      initBTCCurve();
      const res = payments.p2tr({
        internalPubkey: childNodeXOnlyPubkey,
        network,
      });
      address = res.address!;
      output = res.output!;
    } else {
      throw error;
    }
  }
  return {
    address: address!,
    publicKeyHex: pubkeyBuffer.toString("hex"),
    scriptPubKeyHex: output!.toString("hex"),
  };
};
