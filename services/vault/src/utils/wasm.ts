const MAX_CHALLENGER_COUNT = 100;
const MAX_FEE_SATS = 100_000_000n;

export function assertNumLocalChallengers(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `WASM computeNumLocalChallengers returned invalid value: ${value}`,
    );
  }
  if (value > MAX_CHALLENGER_COUNT) {
    throw new Error(
      `WASM computeNumLocalChallengers returned unreasonably large value: ${value}`,
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
  if (value > MAX_FEE_SATS) {
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
  if (value > MAX_FEE_SATS) {
    throw new Error(
      `WASM computeMinPeginFee returned unreasonably large value: ${value}`,
    );
  }
  return value;
}
