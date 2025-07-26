import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";

// Initialize elliptic curve library
export const initBTCCurve = () => {
  initEccLib(ecc);
};
