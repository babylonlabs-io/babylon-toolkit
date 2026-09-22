import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FeeRow } from "@/components/simple/FeesSection";
import { COPY } from "@/copy";

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({ minDeposit: 50_000n })),
}));

vi.mock("@/utils/formatting", () => ({
  getBtcSymbol: () => "BTC",
}));

// Launch values: split THF 1.08, expected HF 0.99, CF 78%, bonus 105.04% at
// HF 0.99 and 105.55% at most.
vi.mock("../../applications/aave/hooks/useVaultSplitParams", () => ({
  useVaultSplitParams: vi.fn(() => ({
    params: {
      THF: 1.08,
      expectedHF: 0.99,
      CF: 0.78,
      LB: 1.0504,
      maxLB: 1.0555,
    },
    isLoading: false,
    error: null,
  })),
}));

import { useProtocolFeeRows } from "../useProtocolFeeRows";

function rowValue(rows: FeeRow[], label: string): FeeRow["value"] {
  return rows.find((row) => row.label === label)?.value;
}

describe("useProtocolFeeRows", () => {
  it("shows the split target health factor under its own label", () => {
    const { result } = renderHook(() => useProtocolFeeRows());

    expect(
      rowValue(
        result.current.rows,
        COPY.protocolFees.splitTargetHealthFactor.label,
      ),
    ).toBe("1.08");
  });

  it("shows the max liquidation penalty from the max bonus, not the bonus at the expected HF", () => {
    const { result } = renderHook(() => useProtocolFeeRows());

    // (1.0555 − 1) × 100 = 5.55, shown as 6%; the bonus at HF 0.99 would show 5%
    expect(
      rowValue(
        result.current.rows,
        COPY.protocolFees.maxLiquidationPenalty.label,
      ),
    ).toBe("6%");
  });

  it("sizes the split minimum from the sacrificial share with no extra buffer", () => {
    const { result } = renderHook(() => useProtocolFeeRows());

    // ceil(50_000 / 0.2857166769…) = 174_999 sats
    expect(
      rowValue(result.current.rows, COPY.protocolFees.minForSplit.label),
    ).toBe("0.00174999 BTC");
  });
});
