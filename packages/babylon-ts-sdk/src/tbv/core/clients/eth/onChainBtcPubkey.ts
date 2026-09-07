/**
 * The single validator that mints {@link OnChainBtcPubkey}.
 *
 * Extracted from `ViemVaultRegistryReader.getVaultProviderGenesisBtcPubKey` so that
 * RFC-006 operation-key resolution can produce branded keys through exactly
 * the same checks, rather than casting past the brand. Every producer of an
 * `OnChainBtcPubkey` must go through here.
 */

import type { Hex } from "viem";

import type { OnChainBtcPubkey } from "./types";

/** secp256k1's base-field prime, `2^256 - 2^32 - 977`. */
const SECP256K1_FIELD_PRIME =
  0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

/** secp256k1's curve coefficient `b`, from `y^2 = x^3 + b`. */
const SECP256K1_CURVE_B = 7n;

/** Modular exponentiation without a crypto-library dependency. */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let factor = base % modulus;
  let remaining = exponent;

  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = (result * factor) % modulus;
    }
    factor = (factor * factor) % modulus;
    remaining >>= 1n;
  }

  return result;
}

/**
 * secp256k1's field prime is congruent to 3 mod 4, so an x-coordinate is on
 * the curve iff `(x^3 + 7)^((p + 1) / 4)` squares back to `x^3 + 7` modulo
 * p. This is the same curve-membership condition used by x-only key parsers;
 * it deliberately does not merely validate length/range.
 * `x^3 + 7` cannot be zero because `-7` is not a cubic residue in this field,
 * so the zero square-root edge case is unreachable.
 */
function isSecp256k1XCoordinate(value: string): boolean {
  const x = BigInt(`0x${value}`);
  if (x >= SECP256K1_FIELD_PRIME) return false;

  const xCubed =
    (((x * x) % SECP256K1_FIELD_PRIME) * x) % SECP256K1_FIELD_PRIME;
  const curveValue = (xCubed + SECP256K1_CURVE_B) % SECP256K1_FIELD_PRIME;
  const y = modPow(
    curveValue,
    (SECP256K1_FIELD_PRIME + 1n) >> 2n,
    SECP256K1_FIELD_PRIME,
  );

  return (y * y) % SECP256K1_FIELD_PRIME === curveValue;
}

/**
 * Validate a registry-returned `bytes32` as an x-only BTC pubkey and mint the
 * brand. Checks length, hex form, and secp256k1 curve membership. Returns
 * 64-char lowercase hex without the `0x` prefix.
 *
 * `label` identifies the read site in error messages (e.g.
 * `getOperationBtcKeyAtEpoch (vp=0x…, epoch=0)`), so a failure names which
 * participant and which getter produced it.
 *
 * A zero hash fails the curve check, so an unregistered operator or an epoch
 * with no bonded key surfaces as an error rather than a silent all-zero key.
 */
export function assertOnChainBtcPubkey(
  value: Hex,
  label: string,
): OnChainBtcPubkey {
  const lowered = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(lowered)) {
    throw new Error(
      `${label} returned an unexpected value (length ${lowered.length}, prefix "${lowered.slice(0, 2)}")`,
    );
  }
  const stripped = lowered.slice(2);
  if (!isSecp256k1XCoordinate(stripped)) {
    throw new Error(
      `${label} returned a value that is not on the secp256k1 curve`,
    );
  }
  return stripped as OnChainBtcPubkey;
}
