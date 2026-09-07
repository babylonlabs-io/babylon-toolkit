import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { Hex } from "viem";

import { MAX_PAYOUT_SCRIPT_LEN } from "../../primitives/psbt/constants";
import { assertOnChainBtcPubkey } from "./onChainBtcPubkey";

const P2TR_SCRIPT_PREFIX = "5120";
const P2WPKH_SCRIPT_PREFIX = "0014";
const HASH160_BYTES = 20;
const COMPRESSED_PUBKEY_BYTES = 33;
const UNCOMPRESSED_PUBKEY_BYTES = 65;
const SEC1_EVEN_Y_PREFIX = 0x02;
const SEC1_ODD_Y_PREFIX = 0x03;
const SEC1_UNCOMPRESSED_PREFIX = 0x04;

function normalizeHex(value: string, label: string): Hex {
  const body =
    value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(body)) {
    throw new Error(`${label} must be non-empty, even-length hex`);
  }
  return `0x${body.toLowerCase()}`;
}

function deriveP2trScript(xOnlyPubkey: string): Hex {
  const pubkeyBytes = hexToBytes(xOnlyPubkey);
  const internalKey = schnorr.utils.lift_x(BigInt(`0x${xOnlyPubkey}`));
  const tweak = schnorr.utils.bytesToNumberBE(
    schnorr.utils.taggedHash("TapTweak", pubkeyBytes),
  );
  if (tweak >= secp256k1.CURVE.n) {
    throw new Error("Proof of possession BTC pubkey has an invalid TapTweak");
  }
  const outputKey =
    tweak === 0n
      ? internalKey
      : internalKey.add(schnorr.Point.BASE.multiply(tweak));
  return `0x${P2TR_SCRIPT_PREFIX}${bytesToHex(
    schnorr.utils.pointToBytes(outputKey),
  )}`;
}

function normalizePayoutPubkey(value: string): {
  xOnlyPubkey: string;
  compressedPubkey?: Uint8Array;
} {
  const normalized = normalizeHex(value, "depositorBtcPubkeyRaw");
  const pubkey = hexToBytes(normalized.slice(2));
  if (pubkey.length === 32) {
    return {
      xOnlyPubkey: assertOnChainBtcPubkey(normalized, "Payout BTC pubkey"),
    };
  }
  const isCompressed =
    pubkey.length === COMPRESSED_PUBKEY_BYTES &&
    (pubkey[0] === SEC1_EVEN_Y_PREFIX || pubkey[0] === SEC1_ODD_Y_PREFIX);
  const isUncompressed =
    pubkey.length === UNCOMPRESSED_PUBKEY_BYTES &&
    pubkey[0] === SEC1_UNCOMPRESSED_PREFIX;
  if (!isCompressed && !isUncompressed) {
    throw new Error(
      "depositorBtcPubkeyRaw must be x-only, compressed, or uncompressed",
    );
  }
  try {
    secp256k1.Point.fromBytes(pubkey);
  } catch {
    throw new Error("depositorBtcPubkeyRaw is not a valid BTC pubkey");
  }
  return {
    xOnlyPubkey: bytesToHex(pubkey.subarray(1, COMPRESSED_PUBKEY_BYTES)),
    compressedPubkey: isCompressed ? pubkey : undefined,
  };
}

function deriveP2wpkhScript(pubkey: Uint8Array): Hex {
  return `0x${P2WPKH_SCRIPT_PREFIX}${bytesToHex(ripemd160(sha256(pubkey)))}`;
}

/** Verify the irreversible payout script at the final submission boundary. */
export function assertPayoutScriptMatchesPopKey(
  scriptPubKey: string,
  depositorBtcPubkey: string,
  depositorBtcPubkeyRaw: string,
): Hex {
  const payoutScript = normalizeHex(
    scriptPubKey,
    "depositorPayoutScriptPubKey",
  );
  if ((payoutScript.length - 2) / 2 > MAX_PAYOUT_SCRIPT_LEN) {
    throw new Error(
      `depositorPayoutScriptPubKey exceeds ${MAX_PAYOUT_SCRIPT_LEN} bytes`,
    );
  }
  const keyBody =
    depositorBtcPubkey.startsWith("0x") || depositorBtcPubkey.startsWith("0X")
      ? depositorBtcPubkey.slice(2)
      : depositorBtcPubkey;
  const xOnlyPubkey = assertOnChainBtcPubkey(
    `0x${keyBody}` as Hex,
    "Proof of possession BTC pubkey",
  );
  const payoutPubkey = normalizePayoutPubkey(depositorBtcPubkeyRaw);
  if (payoutPubkey.xOnlyPubkey !== xOnlyPubkey) {
    throw new Error(
      "depositorBtcPubkeyRaw does not match the proof of possession BTC pubkey",
    );
  }

  if (payoutScript === deriveP2trScript(xOnlyPubkey)) {
    return payoutScript;
  }
  if (
    payoutScript.startsWith(`0x${P2WPKH_SCRIPT_PREFIX}`) &&
    payoutScript.length ===
      2 + P2WPKH_SCRIPT_PREFIX.length + HASH160_BYTES * 2
  ) {
    if (!payoutPubkey.compressedPubkey) {
      throw new Error("A P2WPKH payout requires a compressed BTC pubkey");
    }
    if (payoutScript === deriveP2wpkhScript(payoutPubkey.compressedPubkey)) {
      return payoutScript;
    }
  }
  throw new Error(
    "depositorPayoutScriptPubKey does not match the proof of possession BTC pubkey",
  );
}
