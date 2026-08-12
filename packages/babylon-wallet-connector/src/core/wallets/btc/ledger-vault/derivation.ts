/**
 * Read-only key derivation over raw APDUs (the Bitcoin signer kit cannot
 * express the vault's no-policy flows). Byte layout per the base app's
 * `get_extended_pubkey.c`; the response is the extended key as ASCII, and
 * `display = 0` is silent for allowlisted BIP-86 paths. The taproot ADDRESS
 * is never read from the device — the provider derives it locally.
 *
 * @module wallets/btc/ledger-vault/derivation
 */

import { HDKey } from "@scure/bip32";

import { CLA_APP, type ApduSender } from "./vaultCommands";

/** `GET_EXTENDED_PUBKEY` header (`commands.h`; P2 is the protocol version). */
const INS_GET_EXTENDED_PUBKEY = 0x00;
const P1_NONE = 0x00;
const P2_PROTOCOL_VERSION = 0x01;

/** Silent export — no confirmation screen for allowlisted paths. */
const DISPLAY_OFF = 0x00;

const COMPRESSED_PUBKEY_BYTES = 33;

/**
 * Base-app bound: `get_extended_pubkey.c` rejects longer paths with
 * SW_INCORRECT_DATA (MAX_BIP388_XPUB_DERIVATION_STEPS + 2 at the pinned
 * `bitcoin_app_base` rev). Bounding pre-I/O also keeps the single-byte
 * length field below from ever truncating.
 */
const MAX_BIP32_PATH_STEPS = 10;

/**
 * Read the x-only public key at the given BIP-32 path.
 *
 * @param send - APDU sender bound to the live device session
 * @param path - Full BIP-32 path as raw u32 levels (hardened bits included)
 * @param bip32Versions - Version bytes for the decode: the signet build
 *   returns a tpub, and `@scure/bip32` throws "Version mismatch" on its
 *   mainnet defaults without them.
 */
export async function getXOnlyPublicKeyHex(
  send: ApduSender,
  path: readonly number[],
  bip32Versions: { private: number; public: number },
): Promise<string> {
  if (path.length < 1 || path.length > MAX_BIP32_PATH_STEPS) {
    throw new Error(`BIP-32 path must have 1..${MAX_BIP32_PATH_STEPS} levels, got ${path.length}`);
  }
  const response = await send({
    cla: CLA_APP,
    ins: INS_GET_EXTENDED_PUBKEY,
    p1: P1_NONE,
    p2: P2_PROTOCOL_VERSION,
    data: encodeGetExtendedPubkeyData(path),
  });

  const extendedKey = new TextDecoder().decode(response);
  const node = HDKey.fromExtendedKey(extendedKey, bip32Versions);
  if (!node.publicKey || node.publicKey.length !== COMPRESSED_PUBKEY_BYTES) {
    throw new Error(`Ledger returned an extended key without a ${COMPRESSED_PUBKEY_BYTES}-byte public key`);
  }
  return Buffer.from(node.publicKey.subarray(1)).toString("hex");
}

/** `display(1) ‖ n(1) ‖ n×u32BE` — the GET_EXTENDED_PUBKEY payload. */
function encodeGetExtendedPubkeyData(path: readonly number[]): Uint8Array {
  const data = new Uint8Array(2 + path.length * 4);
  data[0] = DISPLAY_OFF;
  data[1] = path.length;
  path.forEach((level, i) => {
    const offset = 2 + i * 4;
    data[offset] = (level >>> 24) & 0xff;
    data[offset + 1] = (level >>> 16) & 0xff;
    data[offset + 2] = (level >>> 8) & 0xff;
    data[offset + 3] = level & 0xff;
  });
  return data;
}
