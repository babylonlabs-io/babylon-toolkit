/**
 * Tests for pickRepayParams — the submit-time freshness + mode-pick step.
 */

import type { QueryObserverResult } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { pickRepayParams } from "../pickRepayParams";

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const RESERVE_ID = 7n;
const DECIMALS = 6;

function balanceResultOk(raw: bigint): QueryObserverResult<bigint, Error> {
  return {
    data: raw,
    isError: false,
    error: null,
  } as unknown as QueryObserverResult<bigint, Error>;
}

function balanceResultError(
  message = "rpc down",
): QueryObserverResult<bigint, Error> {
  return {
    data: undefined,
    isError: true,
    error: new Error(message),
  } as unknown as QueryObserverResult<bigint, Error>;
}

/** Build a minimal `AavePositionWithLiveData`-shaped object exposing only
 * the path `pickRepayParams` reads (`debtPositions.get(id).totalDebt`). */
function positionWithDebt(debtRaw: bigint) {
  return {
    debtPositions: new Map([[RESERVE_ID, { totalDebt: debtRaw }]]),
  } as never;
}

describe("pickRepayParams", () => {
  it("returns 'full' when balance covers debt × (1 + buffer)", async () => {
    // 100 USDC debt, balance 102 USDC — well above the 0.5% buffer threshold.
    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithDebt(100_000_000n)),
      refetchUserBalance: () => Promise.resolve(balanceResultOk(102_000_000n)),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    expect(result).toEqual({
      kind: "ok",
      mode: "full",
      amount: 100,
      amountRaw: null,
    });
  });

  it("returns 'max-capped' with the exact bigint when balance is between debt and debt × (1+buffer)", async () => {
    // 100 USDC debt, balance 100.1 USDC — covers debt but not the 0.5% buffer.
    // The 0.1 USDC sits inside the buffer band.
    const balanceRaw = 100_100_000n;
    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithDebt(100_000_000n)),
      refetchUserBalance: () => Promise.resolve(balanceResultOk(balanceRaw)),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    expect(result).toEqual({
      kind: "ok",
      mode: "max-capped",
      amount: 100.1,
      amountRaw: balanceRaw,
    });
  });

  it("returns 'partial' for an 18-decimal balance one base unit below debt (raw comparison, not rounded)", async () => {
    // debt = 1e18 + 1, balance = 1e18. Both format to "1"/"1.000…001" and
    // collapse to the JS number 1, so a rounded comparison would pick
    // max-capped — whose sentinel repays the full debt while approving only the
    // balance, reverting. The raw bigints differ, so this must be partial.
    const result = await pickRepayParams({
      refetchPosition: () =>
        Promise.resolve(positionWithDebt(1_000_000_000_000_000_001n)),
      refetchUserBalance: () =>
        Promise.resolve(balanceResultOk(1_000_000_000_000_000_000n)),
      reserveId: RESERVE_ID,
      tokenDecimals: 18,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.mode).toBe("partial");
      expect(result.amountRaw).toBeNull();
    }
  });

  it("returns 'max-capped' when an 18-decimal balance exactly equals debt", async () => {
    // Raw balance == raw debt: max-capped is correct (approval covers the debt
    // exactly, sentinel clears it in full).
    const equalRaw = 1_000_000_000_000_000_000n;
    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithDebt(equalRaw)),
      refetchUserBalance: () => Promise.resolve(balanceResultOk(equalRaw)),
      reserveId: RESERVE_ID,
      tokenDecimals: 18,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.mode).toBe("max-capped");
      expect(result.amountRaw).toBe(equalRaw);
    }
  });

  it("returns 'partial' (no bigint) when balance is below debt", async () => {
    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithDebt(100_000_000n)),
      refetchUserBalance: () => Promise.resolve(balanceResultOk(40_000_000n)),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    expect(result).toEqual({
      kind: "ok",
      mode: "partial",
      amount: 40,
      amountRaw: null,
    });
  });

  it("returns 'partial' with min(debt, balance) when one side is zero", async () => {
    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithDebt(0n)),
      refetchUserBalance: () => Promise.resolve(balanceResultOk(50_000_000n)),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    // Early-exit branch when either side is non-positive — partial of the smaller.
    expect(result).toEqual({
      kind: "ok",
      mode: "partial",
      amount: 0,
      amountRaw: null,
    });
  });

  it("returns an error result when refetchUserBalance reports isError", async () => {
    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithDebt(100_000_000n)),
      refetchUserBalance: () => Promise.resolve(balanceResultError()),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/Couldn't refresh balance\/debt/i);
    }
  });

  it("returns an error result when refetchPosition throws", async () => {
    const result = await pickRepayParams({
      refetchPosition: () =>
        Promise.reject(new Error("position rpc unavailable")),
      refetchUserBalance: () => Promise.resolve(balanceResultOk(100_000_000n)),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    expect(result.kind).toBe("error");
  });

  it("returns an error result when refetchUserBalance throws", async () => {
    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithDebt(100_000_000n)),
      refetchUserBalance: () => Promise.reject(new Error("network down")),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    expect(result.kind).toBe("error");
  });

  it("treats a position with no entry for the reserve as zero debt → partial", async () => {
    // Position object exists, but no debt for the requested reserveId.
    const positionWithUnrelatedReserve = {
      debtPositions: new Map([[999n, { totalDebt: 5n }]]),
    } as never;

    const result = await pickRepayParams({
      refetchPosition: () => Promise.resolve(positionWithUnrelatedReserve),
      refetchUserBalance: () => Promise.resolve(balanceResultOk(50_000_000n)),
      reserveId: RESERVE_ID,
      tokenDecimals: DECIMALS,
    });

    // Zero debt + non-zero balance → partial branch with amount = min(0, 50) = 0.
    expect(result).toEqual({
      kind: "ok",
      mode: "partial",
      amount: 0,
      amountRaw: null,
    });
  });
});
