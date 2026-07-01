/**
 * Shared BIP86 taproot derivation.
 *
 * Derives the taproot (P2TR) SIGNET address for ANY mnemonic — nothing is hardcoded, so it works
 * regardless of which mnemonic a user puts in their env. Signet uses the same address params as
 * testnet (`tb1p…`). BIP39 seed is PBKDF2-HMAC-SHA512 (no wordlist needed).
 */
import { pbkdf2Sync } from "crypto";

import { HDKey } from "@scure/bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";

bitcoin.initEccLib(ecc as unknown as Parameters<typeof bitcoin.initEccLib>[0]);

const NETWORK = bitcoin.networks.testnet; // signet == testnet address params (tb / bech32m)

/** Standard BIP86 taproot path for testnet/signet (coin type 1'). */
export const DEFAULT_TAPROOT_PATH = "m/86'/1'/0'/0/0";

/** Derive the signet taproot address for a mnemonic at the given BIP86 path. */
export function deriveSignetTaproot(mnemonic: string, path: string = DEFAULT_TAPROOT_PATH): string {
  const seed = pbkdf2Sync(mnemonic.trim().normalize("NFKD"), "mnemonic", 2048, 64, "sha512");
  const child = HDKey.fromMasterSeed(seed).derive(path);
  if (!child.publicKey) throw new Error(`no pubkey at ${path}`);
  const xonly = Buffer.from(child.publicKey).subarray(1, 33);
  const { address } = bitcoin.payments.p2tr({ internalPubkey: xonly, network: NETWORK });
  return address as string;
}
