/**
 * Peg-in configuration fingerprint: the `keccak256(abi.encode(...))` commitment
 * over the protocol state a Pre-PegIn transaction was built against, sent with
 * the peg-in registration so the registry can reject a request whose protocol
 * state moved between the build and inclusion.
 *
 * Reproduces `PeginLogic._peginFingerprint` from the vault contracts exactly;
 * see {@link computePeginFingerprint} for the encoding rules that matter.
 *
 * @module pegin-fingerprint
 */

export {
  PEGIN_FINGERPRINT_DOMAIN,
  PEGIN_FINGERPRINT_DOMAIN_PREIMAGE,
  PeginFingerprintInputError,
  computePeginFingerprint,
  encodePeginFingerprintPreimage,
} from "./peginFingerprint";

export type { PeginFingerprintInput } from "./peginFingerprint";
