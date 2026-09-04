/**
 * Golden vectors for the peg-in configuration fingerprint, pinning this
 * encoder byte-for-byte against the vault contracts.
 *
 * ## What is being pinned, and how it could silently diverge
 *
 * The contract computes `keccak256(abi.encode(...))` over ten static fields.
 * Under `abi.encode` every static field becomes one left-padded 32-byte word,
 * so the declared integer WIDTH never reaches the output — encoding the tuple
 * with all-`uint256` slots produces a byte-identical hash. What does change the
 * bytes is the field ORDER, the field COUNT, and static-vs-dynamic type class.
 * A transposition of two same-width fields is therefore invisible to type
 * checking, invisible to a review that only reads the types, and invisible to
 * any fixture whose fields share a value. It surfaces only here.
 *
 * That is why the vectors below give every numeric field of every vector a
 * different non-zero value. The contract repository enforces the rule on its
 * side with `test_peginFingerprintVectors_fieldsAreDistinctAndNonZero`; the
 * fixture is consumed verbatim so the rule carries over rather than being
 * restated.
 *
 * ## Oracle and provenance
 *
 * Source of truth: `_peginFingerprint` in `src/protocol/lib/PeginLogic.sol` of
 * `babylonlabs-io/vault-contracts-aave-v4`, introduced by
 * https://github.com/babylonlabs-io/vault-contracts-aave-v4/pull/555.
 *
 * `vectors/pegin_fingerprint_vectors.json` is that repository's
 * `test/data/pegin_fingerprint_vectors.json`, vendored verbatim at commit
 * `ec62ac62da7a590408ccdcd0a6339a2fa36126b0`. Not transcribed, not reformatted
 * — byte-identity is what makes a re-vendor a diff, and what keeps this file
 * and the Rust `depositor-cli` pinned to one artifact rather than two copies of
 * one. Confirm it with:
 *
 * ```
 * gh api "repos/babylonlabs-io/vault-contracts-aave-v4/contents/test/data/pegin_fingerprint_vectors.json?ref=ec62ac62da7a590408ccdcd0a6339a2fa36126b0" \
 *   --jq '.content' | base64 -d \
 *   | diff - src/tbv/core/pegin-fingerprint/__tests__/vectors/pegin_fingerprint_vectors.json
 * ```
 *
 * Each vector was also recomputed independently with Foundry, which shares no
 * code with either this encoder or the Solidity library that produced the file:
 *
 * ```
 * cast abi-encode 'f(bytes32,uint256,address,bytes32,uint64,uint64,uint16,uint16,uint16,uint16)' \
 *   0x7a76c7af21338f0474e4755a879f9ae8b6351b37d1a2e79e88e1ae95f20ea24b \
 *   1 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
 *   0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798 \
 *   3 5 7 11 13 17 | cast keccak
 * # 0xe18d2cbf355cd69b44df7797eac6ad8c2dc522d328b63d20faa4f0be432cd73c
 * ```
 *
 * ## Failure modes this test is designed to catch
 *
 * If the contract's field order, field count or domain string changes, the
 * vector file changes with it and these assertions fail — which is the signal
 * to re-vendor and re-check, not to edit the expectations. If this encoder
 * drifts instead, the `encoded` assertion fails before the hash assertion and
 * names the diverging word.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PEGIN_FINGERPRINT_ABI_PARAMETERS,
  PEGIN_FINGERPRINT_DOMAIN,
  PEGIN_FINGERPRINT_DOMAIN_PREIMAGE,
  computePeginFingerprint,
  encodePeginFingerprintPreimage,
} from "../peginFingerprint";

import type { Address, Hex } from "viem";

/** The vendored file's shape, after the bigint-preserving parse below. */
interface FingerprintVector {
  name: string;
  chainId: bigint;
  registry: Address;
  vaultProviderBtcKey: Hex;
  appKeeperKeyEpoch: bigint;
  ucKeyEpoch: bigint;
  appVaultKeepersVersion: bigint;
  universalChallengersVersion: bigint;
  offchainParamsVersion: bigint;
  vaultCoreVersion: bigint;
  encoded: Hex;
  fingerprint: Hex;
}

interface VectorFile {
  domain: Hex;
  domainPreimage: string;
  /** The canonical tuple, as `keccak256(abi.encode(<type> <name>, ...))`. */
  encoding: string;
  vectors: FingerprintVector[];
}

const VECTORS_PATH = fileURLToPath(
  new URL("./vectors/pegin_fingerprint_vectors.json", import.meta.url),
);

/**
 * Parse with every JSON number taken from its SOURCE TEXT rather than from the
 * double `JSON.parse` would produce.
 *
 * This is load-bearing, not a stylistic choice. The `maximum_field_values`
 * vector carries `18446744073709551615` (`uint64` max), which is past
 * `Number.MAX_SAFE_INTEGER`: a plain `JSON.parse` — or a static
 * `import vectors from "./…json"`, which is the same thing — rounds it to
 * 18446744073709552000, i.e. exactly 2^64, and the encoder then rejects it as
 * out of range. Do not "simplify" this back to an import.
 */
const vectorFile = JSON.parse(
  readFileSync(VECTORS_PATH, "utf8"),
  (_key, value: unknown, context?: { source?: string }) =>
    typeof value === "number" && context?.source !== undefined
      ? BigInt(context.source)
      : value,
) as VectorFile;

// Without source-text access the reviver silently returns the rounded double
// and the failure surfaces as "appKeeperKeyEpoch must fit Solidity uint64",
// which reads as a bug in the encoder rather than a gap in the runtime. Name
// the real cause instead. (The repo pins Node 24; this guards a stray runtime.)
if (typeof vectorFile.vectors[0]?.chainId !== "bigint") {
  throw new Error(
    "This runtime's JSON.parse does not expose reviver source text, so the " +
      "uint64 vectors cannot be read exactly. Node 22.x or newer is required.",
  );
}

describe("peg-in fingerprint golden vectors (vault-contracts-aave-v4 PR #555)", () => {
  it("derives the domain the contract's vector file publishes", () => {
    expect(PEGIN_FINGERPRINT_DOMAIN_PREIMAGE).toBe(vectorFile.domainPreimage);
    expect(PEGIN_FINGERPRINT_DOMAIN).toBe(vectorFile.domain);
  });

  it("encodes the tuple the contract's vector file declares", () => {
    // The vectors alone cannot catch a WIDTH change upstream: abi.encode pads
    // every static field to 32 bytes, so widening (say) vaultCoreVersion to
    // uint32 leaves all four vectors' bytes identical while our uint16 bound
    // starts rejecting values the contract accepts. This compares the declared
    // tuple itself, and doubles as an order check that owes nothing to the
    // sample values.
    const rendered = PEGIN_FINGERPRINT_ABI_PARAMETERS.map(
      (parameter) => `${parameter.type} ${parameter.name}`,
    ).join(", ");
    expect(`keccak256(abi.encode(${rendered}))`).toBe(vectorFile.encoding);
  });

  it("vendored the four vectors the contract repository ships", () => {
    expect(vectorFile.vectors.map((vector) => vector.name)).toEqual([
      "small_distinct_primes",
      "rotated_epochs_on_sepolia",
      "widths_above_uint8_and_uint32",
      "maximum_field_values",
    ]);
  });

  it("gives every numeric field of every vector a distinct non-zero value", () => {
    // The file's own `fieldRule` says why: equal values let a wrong field order
    // produce the correct fingerprint. The contract repository enforces this
    // with test_peginFingerprintVectors_fieldsAreDistinctAndNonZero; we vendor
    // the data, not that test, so a re-vendor could otherwise quietly downgrade
    // every assertion below to "the encoder agrees with itself".
    for (const vector of vectorFile.vectors) {
      const numbers = [
        vector.chainId,
        vector.appKeeperKeyEpoch,
        vector.ucKeyEpoch,
        vector.appVaultKeepersVersion,
        vector.universalChallengersVersion,
        vector.offchainParamsVersion,
        vector.vaultCoreVersion,
      ];
      expect(numbers.filter((value) => value === 0n)).toEqual([]);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  for (const vector of vectorFile.vectors) {
    // The four version fields are uint16, so narrowing them is exact; the two
    // epochs and the chain id stay bigint, as they do everywhere else.
    const input = {
      chainId: vector.chainId,
      registryAddress: vector.registry,
      vaultProviderBtcKey: vector.vaultProviderBtcKey,
      appKeeperKeyEpoch: vector.appKeeperKeyEpoch,
      ucKeyEpoch: vector.ucKeyEpoch,
      appVaultKeepersVersion: Number(vector.appVaultKeepersVersion),
      universalChallengersVersion: Number(vector.universalChallengersVersion),
      offchainParamsVersion: Number(vector.offchainParamsVersion),
      vaultCoreVersion: Number(vector.vaultCoreVersion),
    };

    describe(vector.name, () => {
      // Asserted before the hash: a wrong field shows up as a diff at a known
      // word offset, where the hash only says "wrong".
      it("encodes the abi.encode preimage the contract encodes", () => {
        expect(encodePeginFingerprintPreimage(input)).toBe(vector.encoded);
      });

      it("hashes to the fingerprint the contract computes", () => {
        expect(computePeginFingerprint(input)).toBe(vector.fingerprint);
      });
    });
  }
});
