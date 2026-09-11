/**
 * `resolveMaxInputCount` is the seam that keeps the UTXO selector from running
 * uncapped. Three of its four cases mean "do not select yet" or "no bound
 * exists", and only one carries a number — collapsing any of them into the
 * wrong neighbour either blocks every deposit or selects without a cap at all.
 * Both consumer suites mock this function, so nothing else covers it.
 */

import type { FundingInputBound } from "@babylonlabs-io/ts-sdk/tbv/core";
import { describe, expect, it } from "vitest";

import { resolveMaxInputCount } from "../useFundingInputBound";

describe("resolveMaxInputCount", () => {
  it("passes a published bound through as its integer", () => {
    const bound: FundingInputBound = { status: "published", maxInputs: 20 };
    expect(resolveMaxInputCount(bound)).toBe(20);
  });

  it("resolves an unpublished bound to undefined, never null", () => {
    // `null` is "this deployment has no bound" and selects uncapped. A chain
    // that publishes a zero bound rejects every Pre-PegIn instead, so this has
    // to read as unresolved and block.
    expect(resolveMaxInputCount({ status: "unpublished" })).toBeUndefined();
  });

  it("resolves an in-flight read to undefined", () => {
    expect(resolveMaxInputCount(undefined)).toBeUndefined();
  });

  it("resolves a deployment that predates the field to null", () => {
    expect(resolveMaxInputCount({ status: "unsupported" })).toBeNull();
  });
});
