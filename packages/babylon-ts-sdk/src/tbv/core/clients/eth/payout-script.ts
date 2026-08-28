import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { Hex } from "viem";

import { MAX_PAYOUT_SCRIPT_LEN } from "../../primitives/psbt/constants";
import { decodeWitnessStack } from "../../utils/witness/witnessStack";
import { assertOnChainBtcPubkey } from "./onChainBtcPubkey";

const P2TR_SCRIPT_PREFIX = "5120";
const P2WPKH_SCRIPT_PREFIX = "0014";
const COMPRESSED_PUBKEY_BYTES = 33;
const SEC1_EVEN_Y_PREFIX = 0x02;
const SEC1_ODD_Y_PREFIX = 0x03;

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

function deriveP2wpkhScript(btcPopSignature: Hex, xOnlyPubkey: string): Hex {
  const witness = decodeWitnessStack(
    hexToBytes(btcPopSignature.slice(2)),
    "proof of possession witness",
  );
  if (witness.length !== 2) {
    throw new Error(
      "A P2WPKH payout requires a two-item proof of possession witness",
    );
  }
  const pubkey = witness[1];
  if (
    pubkey.length !== COMPRESSED_PUBKEY_BYTES ||
    (pubkey[0] !== SEC1_EVEN_Y_PREFIX && pubkey[0] !== SEC1_ODD_Y_PREFIX)
  ) {
    throw new Error(
      "The proof of possession witness must contain a compressed BTC pubkey",
    );
  }
  try {
    secp256k1.Point.fromBytes(pubkey);
  } catch {
    throw new Error(
      "The proof of possession witness contains an invalid BTC pubkey",
    );
  }
  if (bytesToHex(pubkey.subarray(1)) !== xOnlyPubkey) {
    throw new Error(
      "The proof of possession witness pubkey does not match its BTC pubkey",
    );
  }
  return `0x${P2WPKH_SCRIPT_PREFIX}${bytesToHex(ripemd160(sha256(pubkey)))}`;
}

/** Verify the irreversible payout script at the final submission boundary. */
export function assertPayoutScriptMatchesPopKey(
  scriptPubKey: string,
  depositorBtcPubkey: string,
  btcPopSignature: Hex,
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

  if (payoutScript === deriveP2trScript(xOnlyPubkey)) {
    return payoutScript;
  }
  if (
    /^0x0014[0-9a-f]{40}$/.test(payoutScript) &&
    payoutScript === deriveP2wpkhScript(btcPopSignature, xOnlyPubkey)
  ) {
    return payoutScript;
  }
  throw new Error(
    "depositorPayoutScriptPubKey does not match the proof of possession BTC pubkey",
  );
}
