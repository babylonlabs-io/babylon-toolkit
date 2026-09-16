import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEstimatedBtcFee } from "../useEstimatedBtcFee";

const networkFees = vi.hoisted(() => ({
  defaultFeeRate: 10,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock("@/hooks/useNetworkFees", () => ({
  useNetworkFees: () => networkFees,
}));

vi.mock("../../useNetworkFees", () => ({
  useNetworkFees: () => networkFees,
}));

// Both SDK helpers are linear in the fee rate, which is all these tests need:
// they assert which rate reaches the SDK, not the SDK's own vsize model.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  selectUtxosForPegin: vi.fn((_utxos, _amount, feeRate: number) => ({
    fee: BigInt(Math.round(feeRate * 100)),
  })),
  computeMaxDeposit: vi.fn(
    ({ totalBalance, feeRate }: { totalBalance: bigint; feeRate: number }) =>
      totalBalance - BigInt(Math.round(feeRate * 100)),
  ),
}));

const UTXOS = [
  { txid: "a".repeat(64), vout: 0, value: 1_000_000, scriptPubKey: "00" },
] as unknown as MempoolUTXO[];

const AMOUNT = 100_000n;
const NUM_OUTPUTS = 2;

const render = (override?: number) =>
  renderHook(() => useEstimatedBtcFee(AMOUNT, UTXOS, NUM_OUTPUTS, override));

beforeEach(() => {
  networkFees.defaultFeeRate = 10;
  networkFees.isLoading = false;
  networkFees.error = null;
});

describe("useEstimatedBtcFee fee-rate override", () => {
  it("uses the mempool default when no override is given", () => {
    const { result } = render();

    expect(result.current.feeRate).toBe(10);
    expect(result.current.fee).toBe(1_000n);
  });

  it("prefers a positive override over the mempool default", () => {
    const { result } = render(25);

    expect(result.current.feeRate).toBe(25);
    expect(result.current.fee).toBe(2_500n);
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("ignores a %s override and falls back to mempool", (_label, override) => {
    const { result } = render(override);

    expect(result.current.feeRate).toBe(10);
  });

  it("shrinks maxDeposit as the override rises", () => {
    const atDefault = render().result.current.maxDeposit;
    const atHigherRate = render(40).result.current.maxDeposit;

    expect(atDefault).toBe(999_000n);
    expect(atHigherRate).toBe(996_000n);
    expect(atHigherRate).toBeLessThan(atDefault as bigint);
  });

  it("keeps the override when the mempool rate changes underneath it", () => {
    const { result, rerender } = renderHook(
      ({ override }) =>
        useEstimatedBtcFee(AMOUNT, UTXOS, NUM_OUTPUTS, override),
      { initialProps: { override: 25 } },
    );

    expect(result.current.feeRate).toBe(25);

    networkFees.defaultFeeRate = 77;
    rerender({ override: 25 });

    expect(result.current.feeRate).toBe(25);
  });

  it("resolves out of the loading state when only the override is usable", () => {
    networkFees.defaultFeeRate = 0;
    networkFees.isLoading = true;

    const { result } = render(25);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.feeRate).toBe(25);
    expect(result.current.fee).toBe(2_500n);
  });

  it("still reports loading when neither mempool nor override is usable", () => {
    networkFees.defaultFeeRate = 0;
    networkFees.isLoading = true;

    const { result } = render(0);

    expect(result.current.isLoading).toBe(true);
    expect(result.current.fee).toBeNull();
  });
});

describe("useEstimatedBtcFee uncapped max", () => {
  const OVER_CAP_UTXOS = Array.from({ length: 21 }, (_, i) => ({
    txid: i.toString(16).padStart(64, "0"),
    vout: 0,
    value: (i + 1) * 100_000,
    scriptPubKey: "00",
  })) as unknown as MempoolUTXO[];

  it("reports the whole wallet's max alongside the funding-input-capped one", () => {
    const { result } = renderHook(() =>
      useEstimatedBtcFee(AMOUNT, OVER_CAP_UTXOS, NUM_OUTPUTS),
    );

    expect(result.current.maxDeposit).toBe(22_999_000n);
    expect(result.current.uncappedMaxDeposit).toBe(23_099_000n);
  });

  it("excludes malformed scripts from both maxes, so 21 entries with 2 undecompilable ones stay within the cap", () => {
    const withMalformed = OVER_CAP_UTXOS.map((utxo, i) =>
      i === 0 || i === 20 ? { ...utxo, scriptPubKey: "20" } : utxo,
    ) as unknown as MempoolUTXO[];

    const { result } = renderHook(() =>
      useEstimatedBtcFee(AMOUNT, withMalformed, NUM_OUTPUTS),
    );

    expect(result.current.maxDeposit).toBe(20_899_000n);
    expect(result.current.uncappedMaxDeposit).toBe(20_899_000n);
  });

  it("matches maxDeposit when the wallet is within the cap", () => {
    const { result } = render();

    expect(result.current.uncappedMaxDeposit).toBe(result.current.maxDeposit);
  });
});
