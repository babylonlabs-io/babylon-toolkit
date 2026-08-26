import { describe, expect, it, vi } from "vitest";

import {
  CONTRACT_ERRORS,
  extractErrorData,
  getContractErrorMessage,
  handleContractError,
  isKnownContractError,
} from "../errors";

const DUPLICATE_HASHLOCK_SELECTOR = "0x70f7d5e2";
const INVALID_PEGIN_FEE_SELECTOR = "0x979f4518";

describe("extractErrorData", () => {
  it("returns undefined for null", () => {
    expect(extractErrorData(null)).toBeUndefined();
  });

  it("returns undefined for non-object", () => {
    expect(extractErrorData("oops")).toBeUndefined();
    expect(extractErrorData(42)).toBeUndefined();
  });

  it("extracts .data when it is a hex string", () => {
    expect(extractErrorData({ data: DUPLICATE_HASHLOCK_SELECTOR })).toBe(
      DUPLICATE_HASHLOCK_SELECTOR,
    );
  });

  it("extracts .revertData", () => {
    expect(extractErrorData({ revertData: DUPLICATE_HASHLOCK_SELECTOR })).toBe(
      DUPLICATE_HASHLOCK_SELECTOR,
    );
  });

  it("extracts .signature (decoded ContractFunctionRevertedError)", () => {
    expect(extractErrorData({ signature: DUPLICATE_HASHLOCK_SELECTOR })).toBe(
      DUPLICATE_HASHLOCK_SELECTOR,
    );
  });

  it("extracts .details", () => {
    expect(extractErrorData({ details: DUPLICATE_HASHLOCK_SELECTOR })).toBe(
      DUPLICATE_HASHLOCK_SELECTOR,
    );
  });

  it("extracts .error.data (RPC-level shape)", () => {
    expect(
      extractErrorData({ error: { data: DUPLICATE_HASHLOCK_SELECTOR } }),
    ).toBe(DUPLICATE_HASHLOCK_SELECTOR);
  });

  it("ignores non-hex strings on .data", () => {
    expect(extractErrorData({ data: "execution reverted" })).toBeUndefined();
  });

  it("recurses through .cause chain", () => {
    const inner = { data: DUPLICATE_HASHLOCK_SELECTOR };
    const outer = { cause: { cause: inner } };
    expect(extractErrorData(outer)).toBe(DUPLICATE_HASHLOCK_SELECTOR);
  });

  it("uses viem-style .walk() to traverse causes", () => {
    const inner = { data: DUPLICATE_HASHLOCK_SELECTOR };
    const middle = { cause: inner };
    const root = {
      walk(fn: (e: unknown) => boolean) {
        // Mimic viem: visit self then chain
        if (fn(root)) return root;
        if (fn(middle)) return middle;
        if (fn(inner)) return inner;
        return undefined;
      },
    };
    expect(extractErrorData(root)).toBe(DUPLICATE_HASHLOCK_SELECTOR);
  });

  it("does not blow up if .walk() throws", () => {
    const err = {
      walk: () => {
        throw new Error("walk boom");
      },
    };
    expect(extractErrorData(err)).toBeUndefined();
  });

  it("falls back to a regex over .message at depth 0", () => {
    const err = {
      message: `Execution reverted with selector ${DUPLICATE_HASHLOCK_SELECTOR}`,
    };
    expect(extractErrorData(err)).toBe(DUPLICATE_HASHLOCK_SELECTOR);
  });

  it("does not recurse forever on a self-referential cause", () => {
    const err: Record<string, unknown> = {};
    err.cause = err;
    expect(extractErrorData(err)).toBeUndefined();
  });

  it("survives a deep cause chain without throwing", () => {
    let chain: Record<string, unknown> = { data: DUPLICATE_HASHLOCK_SELECTOR };
    for (let i = 0; i < 50; i++) chain = { cause: chain };
    expect(() => extractErrorData(chain)).not.toThrow();
  });
});

describe("getContractErrorMessage", () => {
  it("resolves DuplicateHashlock selector to the friendly message", () => {
    expect(getContractErrorMessage({ data: DUPLICATE_HASHLOCK_SELECTOR })).toBe(
      CONTRACT_ERRORS[DUPLICATE_HASHLOCK_SELECTOR],
    );
  });

  it("matches a parametric error by 4-byte selector prefix", () => {
    // InvalidPeginFee(uint256,uint256) returns selector + ABI-encoded args.
    const abiArgs = "00".repeat(64); // two uint256 placeholders
    expect(
      getContractErrorMessage({ data: INVALID_PEGIN_FEE_SELECTOR + abiArgs }),
    ).toBe(CONTRACT_ERRORS[INVALID_PEGIN_FEE_SELECTOR]);
  });

  it("returns undefined for an unknown selector", () => {
    expect(getContractErrorMessage({ data: "0xdeadbeef" })).toBeUndefined();
  });

  it("returns undefined when no error data can be extracted", () => {
    expect(getContractErrorMessage({})).toBeUndefined();
  });

  it("works on a viem-shaped EstimateGasExecutionError", () => {
    // Realistic shape: outer error wraps a ContractFunctionRevertedError
    // with a decoded `signature` field.
    const decoded = { signature: DUPLICATE_HASHLOCK_SELECTOR };
    const wrapper = {
      name: "EstimateGasExecutionError",
      cause: { name: "ContractFunctionRevertedError", cause: decoded },
    };
    expect(getContractErrorMessage(wrapper)).toBe(
      CONTRACT_ERRORS[DUPLICATE_HASHLOCK_SELECTOR],
    );
  });
});

describe("isKnownContractError", () => {
  it("is true for a known selector", () => {
    expect(isKnownContractError({ data: DUPLICATE_HASHLOCK_SELECTOR })).toBe(
      true,
    );
  });

  it("is true for a parametric error matched by 4-byte prefix", () => {
    const abiArgs = "00".repeat(64);
    expect(
      isKnownContractError({ data: INVALID_PEGIN_FEE_SELECTOR + abiArgs }),
    ).toBe(true);
  });

  it("is false for an unknown selector", () => {
    expect(isKnownContractError({ data: "0xdeadbeef" })).toBe(false);
  });

  it("is false when no data is present", () => {
    expect(isKnownContractError({})).toBe(false);
  });
});

describe("handleContractError", () => {
  it("throws the friendly message for a known selector", () => {
    expect(() =>
      handleContractError({ data: DUPLICATE_HASHLOCK_SELECTOR }),
    ).toThrow(CONTRACT_ERRORS[DUPLICATE_HASHLOCK_SELECTOR]);
  });

  it("throws a transaction-failed hint on gas-estimation errors", () => {
    const err = new Error("gas limit too high");
    expect(() => handleContractError(err)).toThrow(/Transaction failed/);
  });

  it("includes the raw selector in the gas-error hint when extractable", () => {
    const err = Object.assign(new Error("Internal JSON-RPC error"), {
      data: "0xdeadbeef",
    });
    expect(() => handleContractError(err)).toThrow(/error code: 0xdeadbeef/);
  });

  it("re-throws an unknown Error unchanged", () => {
    const err = new Error("something else");
    expect(() => handleContractError(err)).toThrow(err);
  });

  it("wraps non-Error values in a generic message", () => {
    expect(() => handleContractError("plain string")).toThrow(
      /Contract call failed: plain string/,
    );
  });
});

describe("CONTRACT_ERRORS table", () => {
  it("has a DuplicateHashlock entry keyed by the canonical selector", () => {
    expect(CONTRACT_ERRORS[DUPLICATE_HASHLOCK_SELECTOR]).toMatch(
      /Duplicate deposit/i,
    );
  });
});

// Silence the console.error calls inside handleContractError so they
// don't clutter test output.
vi.spyOn(console, "error").mockImplementation(() => {});
