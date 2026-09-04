/**
 * Pins the peg-in submit signatures against the contract they must match.
 *
 * A function selector is `keccak256` of the signature, so it is the one value
 * that changes if an argument is added, removed, reordered, or retyped. Every
 * expectation here is a literal transcribed from the contract source, never
 * re-derived from our own ABI — a re-derivation would only prove the ABI agrees
 * with itself, which is true of any ABI including a wrong one.
 *
 * Source: https://github.com/babylonlabs-io/vault-contracts-aave-v4/pull/555,
 * read at head `ec62ac62`. `expectedFingerprint` is argument 4 of the batch
 * function — before `requests` — and appended last on both singular overloads.
 */

import { keccak256, toFunctionSignature, toHex } from "viem";
import { describe, expect, it } from "vitest";

import { ApplicationRegistryABI } from "../abis/ApplicationRegistry.abi";
import { BTCVaultRegistryABI } from "../abis/BTCVaultRegistry.abi";
import { ProtocolParamsABI } from "../abis/ProtocolParams.abi";
import { PEGIN_FINGERPRINT_CHANGED_SELECTOR } from "../errors";

/**
 * `toFunctionSignature` prefixes an error item with the `error ` keyword,
 * which is not part of the preimage the EVM hashes. Functions carry no such
 * prefix, so one strip covers both.
 */
function selectorOf(item: { name: string }): string {
  const signature = toFunctionSignature(item as never).replace(/^error /, "");
  return keccak256(toHex(signature)).slice(0, 10);
}

function itemsNamed(name: string) {
  return BTCVaultRegistryABI.filter((entry) => entry.name === name);
}

/** The shape the width assertions below read, across three `as const` ABIs. */
interface AbiFunctionEntry {
  type: string;
  name?: string;
  inputs?: readonly { type: string }[];
  outputs?: readonly { type: string }[];
  stateMutability?: string;
}

describe("peg-in submit selectors", () => {
  it("encodes submitPeginRequestBatch with the fingerprint at argument 4", () => {
    const [batch, ...extras] = itemsNamed("submitPeginRequestBatch");
    expect(extras).toHaveLength(0);
    expect(batch.inputs.map((input) => input.name)).toEqual([
      "depositor",
      "vaultProvider",
      "maxAcceptableCommissionBps",
      "expectedFingerprint",
      "requests",
    ]);
    expect(selectorOf(batch)).toBe("0x3e62a2ba");
  });

  it("appends the fingerprint to both submitPeginRequest overloads", () => {
    const overloads = itemsNamed("submitPeginRequest");
    // Arity is how viem picks between the two. Before this change they had 11
    // and 12 inputs; they now have 12 and 13. A partial ABI edit that updated
    // only one would make both 12 and let viem resolve by argument type
    // instead — silently, and possibly correctly, which is the danger.
    expect(overloads.map((item) => item.inputs.length)).toEqual([12, 13]);
    for (const overload of overloads) {
      expect(overload.inputs.at(-1)?.name).toBe("expectedFingerprint");
    }
    expect(overloads.map(selectorOf)).toEqual(["0x564feec1", "0x1c3c4606"]);
  });

  it("declares PeginFingerprintChanged so viem can decode the revert", () => {
    const [error, ...extras] = itemsNamed("PeginFingerprintChanged");
    expect(extras).toHaveLength(0);
    expect(error.type).toBe("error");
    expect(error.inputs.map((input) => input.type)).toEqual([
      "bytes32",
      "bytes32",
    ]);
    // The ABI entry and the selector the error handler branches on have to be
    // the same error. Nothing else ties them together.
    expect(selectorOf(error)).toBe(PEGIN_FINGERPRINT_CHANGED_SELECTOR);
    expect(PEGIN_FINGERPRINT_CHANGED_SELECTOR).toBe("0x846c25bb");
  });

  // The two epoch getters feed fingerprint words 5 and 6. Neither is a compile
  // error if it drifts: a wrong name or arity reverts the read at build time
  // for every depositor, and a wrong output WIDTH is worse — `uint256` where
  // the contract declares `uint64` decodes to a value that encodes differently
  // and fails the on-chain comparison with two opaque hashes and no hint.
  it.each([
    [
      "appKeeperKeyEpochCurrent",
      ApplicationRegistryABI,
      ["address"],
      "uint64",
    ],
    ["ucKeyEpochCurrent", ProtocolParamsABI, [], "uint64"],
  ])(
    "declares %s with the width the fingerprint encodes",
    (name, abi, inputTypes, outputType) => {
      const matches = (abi as readonly AbiFunctionEntry[]).filter(
        (entry) => entry.name === name && entry.type === "function",
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].inputs?.map((input) => input.type)).toEqual(inputTypes);
      expect(matches[0].outputs?.map((output) => output.type)).toEqual([
        outputType,
      ]);
      expect(matches[0].stateMutability).toBe("view");
    },
  );

  it("exposes getVaultProviderApplication, which resolves the keeper roster", () => {
    const [getter, ...extras] = itemsNamed("getVaultProviderApplication").filter(
      (item) => item.type === "function",
    );
    expect(extras).toHaveLength(0);
    expect(getter.inputs.map((input) => input.type)).toEqual(["address"]);
    expect(getter.outputs.map((output) => output.type)).toEqual(["address"]);
    expect(getter.stateMutability).toBe("view");
  });
});
