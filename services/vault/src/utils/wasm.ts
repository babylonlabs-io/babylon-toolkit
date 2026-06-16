const MAX_CHALLENGER_COUNT = 100;
const MAX_PEGIN_FEE_SATS = 100_000_000n;
const MAX_CLAIM_RESERVE_SATS = 1_000_000_000n;

export function assertNumLocalChallengers(value: number): number {
  if (value > MAX_CHALLENGER_COUNT) {
    throw new Error(
      `computeNumLocalChallengers returned unreasonably large value: ${value}`,
    );
  }
  return value;
}

export function assertMinClaimValue(value: bigint): bigint {
  if (value <= 0n) {
    throw new Error(
      `WASM computeMinClaimValue returned non-positive value: ${value}`,
    );
  }
  if (value > MAX_CLAIM_RESERVE_SATS) {
    throw new Error(
      `WASM computeMinClaimValue returned unreasonably large value: ${value}`,
    );
  }
  return value;
}

export function assertMinPeginFee(value: bigint): bigint {
  if (value <= 0n) {
    throw new Error(
      `WASM computeMinPeginFee returned non-positive value: ${value}`,
    );
  }
  if (value > MAX_PEGIN_FEE_SATS) {
    throw new Error(
      `WASM computeMinPeginFee returned unreasonably large value: ${value}`,
    );
  }
  return value;
}
