import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";

let initialised = false;

/**
 * Register bitcoinjs-lib's elliptic-curve implementation.
 *
 * Taproot needs it: BIP-341 key tweaking is what `payments.p2tr` performs, and
 * decoding a taproot scriptPubKey back to an address needs the same curve. The
 * connector must never rely on the host application having done this — a host
 * that loads its Bitcoin dependencies lazily (so an Ethereum-only session stays
 * light) would otherwise break every taproot wallet connection. Every entry
 * point in this package that builds or decodes a taproot address calls this
 * first, and this is the only place that calls `initEccLib`.
 *
 * Idempotent, so callers can invoke it unconditionally.
 */
export const initBTCCurve = () => {
  if (initialised) return;

  initEccLib(ecc);
  initialised = true;
};
