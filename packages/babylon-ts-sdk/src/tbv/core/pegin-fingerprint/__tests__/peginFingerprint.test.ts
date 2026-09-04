/**
 * Behaviour of the fingerprint encoder that the golden vectors cannot reach:
 * that every field reaches the output, that out-of-range inputs are rejected by
 * name, and that a non-checksummed address still encodes.
 *
 * Note what is NOT tested here. Field ORDER is pinned by the golden vectors and
 * only by them — a test that swaps two inputs and asserts the hash moves passes
 * just as happily against an encoder that transposes those same two fields
 * internally. What the cases below do catch is a field that never reaches the
 * encoding at all: dropped from the tuple, aliased to a neighbour, or shadowed
 * by a constant. That failure is silent against a hand-written expectation and
 * would otherwise surface only if a vector happened to vary that one field.
 */

import { describe, expect, it } from "vitest";

import {
  PEGIN_FINGERPRINT_DOMAIN,
  PeginFingerprintInputError,
  computePeginFingerprint,
  encodePeginFingerprintPreimage,
  type PeginFingerprintInput,
} from "../peginFingerprint";

/**
 * Every field a different non-zero value, for the same reason the contract's
 * vectors are built that way: with equal values a transposition of two
 * same-width fields produces the identical encoding and cannot be detected.
 */
const BASE: PeginFingerprintInput = {
  chainId: 11155111n,
  registryAddress: "0x8464135c8F25Da09e49BC8782676a84730C318bC",
  vaultProviderBtcKey:
    "0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  appKeeperKeyEpoch: 19n,
  ucKeyEpoch: 23n,
  appVaultKeepersVersion: 29,
  universalChallengersVersion: 31,
  offchainParamsVersion: 37,
  vaultCoreVersion: 41,
};

describe("computePeginFingerprint", () => {
  it("produces 32 bytes", () => {
    expect(computePeginFingerprint(BASE)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("encodes ten 32-byte words, one per field", () => {
    // 0x + 10 words * 64 hex digits. A field added or dropped changes this.
    expect(encodePeginFingerprintPreimage(BASE)).toHaveLength(2 + 10 * 64);
  });

  it("starts the preimage with the domain word", () => {
    expect(encodePeginFingerprintPreimage(BASE).slice(0, 66)).toBe(
      PEGIN_FINGERPRINT_DOMAIN,
    );
  });

  // The domain constant and its preimage string are pinned in the golden test,
  // against the contract's own vector file, rather than against literals
  // transcribed here a second time.
});

/**
 * One altered field per case. Each altered value differs from every other value
 * in {@link BASE}, so a field aliased onto a neighbour still moves the hash and
 * is not mistaken for a pass.
 *
 * Typed as a `Record` keyed by the input's own fields, so adding a field to
 * {@link PeginFingerprintInput} without adding a case here is a COMPILE error.
 * A runtime test comparing this list against `Object.keys(BASE)` would assert
 * nothing about `src/` and would miss an optional field entirely.
 */
const SINGLE_FIELD_CHANGES: Record<
  keyof PeginFingerprintInput,
  PeginFingerprintInput
> = {
  chainId: { ...BASE, chainId: 43n },
  registryAddress: {
    ...BASE,
    registryAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
  vaultProviderBtcKey: {
    ...BASE,
    vaultProviderBtcKey:
      "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  },
  appKeeperKeyEpoch: { ...BASE, appKeeperKeyEpoch: 47n },
  ucKeyEpoch: { ...BASE, ucKeyEpoch: 53n },
  appVaultKeepersVersion: { ...BASE, appVaultKeepersVersion: 59 },
  universalChallengersVersion: { ...BASE, universalChallengersVersion: 61 },
  offchainParamsVersion: { ...BASE, offchainParamsVersion: 67 },
  vaultCoreVersion: { ...BASE, vaultCoreVersion: 71 },
};

describe("computePeginFingerprint field coverage", () => {
  const baseline = computePeginFingerprint(BASE);

  for (const [field, changed] of Object.entries(SINGLE_FIELD_CHANGES)) {
    it(`changes when only ${field} changes`, () => {
      expect(computePeginFingerprint(changed)).not.toBe(baseline);
    });
  }
});

describe("computePeginFingerprint address handling", () => {
  it("encodes a mixed-case address whose EIP-55 checksum does not verify", () => {
    // The contract's own `maximum_field_values` vector uses such an address.
    // viem rejects it by default, so the encoder must normalise case itself.
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        registryAddress: "0xfFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF",
      }),
    ).not.toThrow();
  });

  it("ignores address casing, which the encoded word does not carry", () => {
    const checksummed = computePeginFingerprint(BASE);
    const lowercased = computePeginFingerprint({
      ...BASE,
      registryAddress:
        BASE.registryAddress.toLowerCase() as PeginFingerprintInput["registryAddress"],
    });
    expect(lowercased).toBe(checksummed);
  });

  it("rejects an address that is not 20 bytes", () => {
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        registryAddress: "0x1234",
      }),
    ).toThrow(PeginFingerprintInputError);
  });

  it("rejects the zero address, the shape of an unresolved read", () => {
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        registryAddress: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrow(/registryAddress must not be the zero address/);
  });

  it("lowercases the key so the preimage stays comparable to the contract's", () => {
    // viem echoes hex casing into its output, so an upper-case key would give a
    // correct fingerprint beside a preimage that no longer compares equal.
    const upper = {
      ...BASE,
      vaultProviderBtcKey:
        `0x${BASE.vaultProviderBtcKey.slice(2).toUpperCase()}` as PeginFingerprintInput["vaultProviderBtcKey"],
    };
    expect(encodePeginFingerprintPreimage(upper)).toBe(
      encodePeginFingerprintPreimage(BASE),
    );
  });
});

describe("encodePeginFingerprintPreimage input validation", () => {
  it("rejects a uint16 version above 65535", () => {
    expect(() =>
      encodePeginFingerprintPreimage({ ...BASE, vaultCoreVersion: 65_536 }),
    ).toThrow(/vaultCoreVersion must be an integer fitting Solidity uint16/);
  });

  it("rejects a negative uint16 version", () => {
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        universalChallengersVersion: -1,
      }),
    ).toThrow(/universalChallengersVersion must be an integer/);
  });

  it("rejects a non-integer uint16 version", () => {
    expect(() =>
      encodePeginFingerprintPreimage({ ...BASE, offchainParamsVersion: 1.5 }),
    ).toThrow(/offchainParamsVersion must be an integer/);
  });

  it("accepts the uint64 maximum epoch", () => {
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        appKeeperKeyEpoch: 2n ** 64n - 1n,
      }),
    ).not.toThrow();
  });

  it("rejects an epoch at 2^64", () => {
    expect(() =>
      encodePeginFingerprintPreimage({ ...BASE, ucKeyEpoch: 2n ** 64n }),
    ).toThrow(/ucKeyEpoch must fit Solidity uint64/);
  });

  it("rejects a negative epoch", () => {
    expect(() =>
      encodePeginFingerprintPreimage({ ...BASE, appKeeperKeyEpoch: -1n }),
    ).toThrow(/appKeeperKeyEpoch must fit Solidity uint64/);
  });

  it("rejects a chain id above uint256", () => {
    expect(() =>
      encodePeginFingerprintPreimage({ ...BASE, chainId: 2n ** 256n }),
    ).toThrow(/chainId must fit Solidity uint256/);
  });

  it("rejects a vault provider key that is not 32 bytes", () => {
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        vaultProviderBtcKey: "0xdead",
      }),
    ).toThrow(/vaultProviderBtcKey must be 32 bytes/);
  });

  it("rejects a vault provider key with no 0x prefix", () => {
    // The SDK resolves operation keys as un-prefixed x-only hex, so this is the
    // mistake a call site is most likely to make.
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        vaultProviderBtcKey:
          "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5" as PeginFingerprintInput["vaultProviderBtcKey"],
      }),
    ).toThrow(PeginFingerprintInputError);
  });

  it("rejects chain id 0, the shape of an unresolved read", () => {
    expect(() =>
      encodePeginFingerprintPreimage({ ...BASE, chainId: 0n }),
    ).toThrow(/chainId must not be 0/);
  });

  it("rejects vaultCoreVersion 0, which no live contract reports", () => {
    // activeVaultCoreVersion() is uint16 >= 1 and its setter rejects 0, so a 0
    // reaching here is a mis-decoded read. The rest of the SDK fails closed on
    // it (assertValidVaultCoreVersion); encoding it would instead produce a
    // fingerprint that can never match, failing on-chain rather than here.
    expect(() =>
      encodePeginFingerprintPreimage({ ...BASE, vaultCoreVersion: 0 }),
    ).toThrow(PeginFingerprintInputError);
  });

  it("still accepts version 0 on the axes where the contract allows it", () => {
    expect(() =>
      encodePeginFingerprintPreimage({
        ...BASE,
        appVaultKeepersVersion: 0,
        universalChallengersVersion: 0,
        offchainParamsVersion: 0,
      }),
    ).not.toThrow();
  });
});

/**
 * TypeScript does not reach a JS consumer, an object built from a partial
 * snapshot, or an unawaited read. A purely relational range check treats all of
 * these as in-range, and viem then either throws something unrecognisable or —
 * for `"7"` and `true` — encodes them as 7 and 1, producing a well-formed
 * fingerprint from a value nobody supplied.
 */
describe("encodePeginFingerprintPreimage rejects non-bigint numeric fields", () => {
  for (const [label, value] of [
    ["undefined", undefined],
    ["null", null],
    ["NaN", Number.NaN],
    ["a numeric string", "7"],
    ["a boolean", true],
    ["a plain number", 19],
  ] as const) {
    it(`rejects ${label} as appKeeperKeyEpoch`, () => {
      expect(() =>
        encodePeginFingerprintPreimage({
          ...BASE,
          appKeeperKeyEpoch: value as unknown as bigint,
        }),
      ).toThrow(PeginFingerprintInputError);
    });
  }
});
