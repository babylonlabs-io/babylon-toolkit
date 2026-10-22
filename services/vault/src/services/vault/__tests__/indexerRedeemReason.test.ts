import { VAULT_ERROR_ABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import { encodeErrorResult } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { redeemReasonFromIndexer } from "../indexerRedeemReason";

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

// Solidity's built-in revert payload, which names no application error.
const SOLIDITY_ERROR_STRING_ABI = [
  {
    type: "error",
    name: "Error",
    inputs: [{ name: "message", type: "string" }],
  },
] as const;

describe("redeemReasonFromIndexer", () => {
  afterEach(() => vi.clearAllMocks());

  it("null maps to undefined", () => {
    expect(redeemReasonFromIndexer(null, null)).toBeUndefined();
  });

  it("cap_exceeded", () => {
    expect(redeemReasonFromIndexer("cap_exceeded", null)).toEqual({
      kind: "cap_exceeded",
    });
  });

  it("depositor_redeemed", () => {
    expect(redeemReasonFromIndexer("depositor_redeemed", null)).toEqual({
      kind: "depositor_redeemed",
    });
  });

  it("unknown", () => {
    expect(redeemReasonFromIndexer("unknown", null)).toEqual({
      kind: "unknown",
    });
  });

  it("app_reverted with a known error selector maps to app_rejected with its name", () => {
    // AaveAdapter.activateVault's own revert (AaveAdapter.sol:149 @102e78c5).
    const data = encodeErrorResult({
      abi: VAULT_ERROR_ABI,
      errorName: "InvalidPositionSizes",
    });

    expect(redeemReasonFromIndexer("app_reverted", data)).toEqual({
      kind: "app_rejected",
      errorName: "InvalidPositionSizes",
    });
  });

  it("app_reverted with undecodable non-empty data maps to app_rejected with a null error name", () => {
    expect(redeemReasonFromIndexer("app_reverted", "0xdeadbeef")).toEqual({
      kind: "app_rejected",
      errorName: null,
    });
  });

  it("app_reverted with Error(string) data maps to app_rejected with a null name", () => {
    const data = encodeErrorResult({
      abi: SOLIDITY_ERROR_STRING_ABI,
      errorName: "Error",
      args: ["application failed"],
    });

    expect(redeemReasonFromIndexer("app_reverted", data)).toEqual({
      kind: "app_rejected",
      errorName: null,
    });
  });

  it("app_reverted with empty data maps to app_failed_without_reason", () => {
    expect(redeemReasonFromIndexer("app_reverted", "0x")).toEqual({
      kind: "app_failed_without_reason",
    });
  });

  it("app_reverted with missing data maps to unknown", () => {
    expect(redeemReasonFromIndexer("app_reverted", null)).toEqual({
      kind: "unknown",
    });
  });

  it("an unknown indexer value maps to undefined and warns", () => {
    expect(redeemReasonFromIndexer("some_future_reason", null)).toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("some_future_reason"),
      expect.objectContaining({ category: "activation" }),
    );
  });
});
