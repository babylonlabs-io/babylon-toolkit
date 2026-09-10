import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import {
  computeMaxDeposit,
  selectUtxosForPegin,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

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

// The fee helpers are linear in the fee rate, which is all these tests need:
// they assert which rate reaches the SDK, not the SDK's own vsize model. The
// budget helper caps the input set the way the real one does so the maxDeposit
// assertions see a bound that actually bites.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  selectUtxosForPegin: vi.fn((_utxos, _amount, feeRate: number) => ({
    fee: BigInt(Math.round(feeRate * 100)),
  })),
  computeMaxDeposit: vi.fn(
    ({ totalBalance, feeRate }: { totalBalance: bigint; feeRate: number }) =>
      totalBalance - BigInt(Math.round(feeRate * 100)),
  ),
  computeFundingBudget: vi.fn(
    (utxos: Array<{ value: number }>, maxInputCount: number | null) => {
      const capped =
        maxInputCount === null ? utxos : utxos.slice(0, maxInputCount);
      return {
        numInputs: capped.length,
        totalBalance: capped.reduce((sum, u) => sum + BigInt(u.value), 0n),
      };
    },
  ),
  isFundingInputCountExceededError: vi.fn(
    (err: unknown) =>
      err instanceof Error && err.name === "FundingInputCountExceededError",
  ),
}));

const UTXOS = [
  { txid: "a".repeat(64), vout: 0, value: 1_000_000, scriptPubKey: "00" },
] as unknown as MempoolUTXO[];

const AMOUNT = 100_000n;
const NUM_OUTPUTS = 2;
const MAX_INPUTS = 20;

const render = (override?: number) =>
  renderHook(() =>
    useEstimatedBtcFee(AMOUNT, UTXOS, NUM_OUTPUTS, MAX_INPUTS, override),
  );

beforeEach(() => {
  vi.mocked(selectUtxosForPegin).mockImplementation(((
    _utxos: unknown,
    _amount: bigint,
    feeRate: number,
  ) => ({
    fee: BigInt(Math.round(feeRate * 100)),
  })) as unknown as typeof selectUtxosForPegin);
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
        useEstimatedBtcFee(AMOUNT, UTXOS, NUM_OUTPUTS, MAX_INPUTS, override),
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

describe("useEstimatedBtcFee funding-input bound", () => {
  it("reports loading with no max while the bound is unresolved", () => {
    const { result } = renderHook(() =>
      useEstimatedBtcFee(AMOUNT, UTXOS, NUM_OUTPUTS, undefined),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.maxDeposit).toBeNull();
    expect(result.current.fee).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("shows the copy string, not the SDK message, when the bound is exceeded", () => {
    const exceeded = new Error("Funding this deposit needs more than 2 UTXOs");
    exceeded.name = "FundingInputCountExceededError";
    vi.mocked(selectUtxosForPegin).mockImplementation(() => {
      throw exceeded;
    });

    const { result } = renderHook(() =>
      useEstimatedBtcFee(AMOUNT, UTXOS, NUM_OUTPUTS, 2),
    );

    expect(result.current.error).toBe(
      COPY.deposit.errors.tooManyFundingInputs.title,
    );
    expect(result.current.error).not.toBe(exceeded.message);
  });

  it("sizes maxDeposit from the capped budget, not the whole UTXO set", () => {
    const utxos = [
      { txid: "a".repeat(64), vout: 0, value: 600_000, scriptPubKey: "00" },
      { txid: "b".repeat(64), vout: 0, value: 400_000, scriptPubKey: "00" },
      { txid: "c".repeat(64), vout: 0, value: 300_000, scriptPubKey: "00" },
    ] as unknown as MempoolUTXO[];

    renderHook(() => useEstimatedBtcFee(AMOUNT, utxos, NUM_OUTPUTS, 2));

    expect(computeMaxDeposit).toHaveBeenCalledWith({
      numInputs: 2,
      numOutputs: NUM_OUTPUTS,
      totalBalance: 1_000_000n,
      feeRate: 10,
    });
  });
});
