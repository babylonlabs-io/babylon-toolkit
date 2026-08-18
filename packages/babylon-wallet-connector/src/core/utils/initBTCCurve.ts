import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";

/**
 * Register bitcoinjs-lib's elliptic-curve implementation.
 *
 * Taproot needs it: BIP-341 key tweaking is what `payments.p2tr` performs, and
 * decoding a taproot scriptPubKey back to an address needs the same curve. The
 * connector must never rely on the host application having done this — a host
 * that loads its Bitcoin dependencies lazily (so an Ethereum-only session stays
 * light) would otherwise break every taproot wallet connection. Every entry
 * point in this package that needs the curve — building or decoding a taproot
 * address, and finalizing a taproot key-spend input — calls this first, and
 * this is the only place in `src/` that registers a curve implementation.
 *
 * Idempotent: `initEccLib` verifies and stores the library only when it differs
 * from the one already registered, so repeat calls cost nothing and a cleared
 * or swapped global is re-registered rather than skipped.
 */
export const initBTCCurve = () => {
  initEccLib(ecc);
};
