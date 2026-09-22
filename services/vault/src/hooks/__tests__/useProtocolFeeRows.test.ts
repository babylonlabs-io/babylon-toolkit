import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FeeRow } from "@/components/simple/FeesSection";
import { COPY } from "@/copy";

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({ minDeposit: 50_000n })),
}));

vi.mock("@/utils/formatting", async (importOriginal) => ({
  // Keep the real percent formatters; only the ticker depends on env config.
  ...(await importOriginal<typeof import("@/utils/formatting")>()),
  getBtcSymbol: () => "BTC",
}));

// Launch values: split THF 1.08, expected HF 0.99, CF 78%, bonus 105.04% at
// HF 0.99 and 105.55% at most.
const LAUNCH_SPLIT_PARAMS = vi.hoisted(() => ({
  params: {
    THF: 1.08,
    expectedHF: 0.99,
    CF: 0.78,
    LB: 1.0504,
    maxLB: 1.0555,
  },
  isLoading: false,
  error: null,
  refetch: async () => null,
}));

vi.mock("../../applications/aave/hooks/useVaultSplitParams", () => ({
  useVaultSplitParams: vi.fn(() => LAUNCH_SPLIT_PARAMS),
}));

import { useVaultSplitParams } from "../../applications/aave/hooks/useVaultSplitParams";
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

    // 10555 BPS is 5.55%, not 6%; the bonus at HF 0.99 would be 5.04%
    expect(
      rowValue(
        result.current.rows,
        COPY.protocolFees.maxLiquidationPenalty.label,
      ),
    ).toBe("5.55%");
  });

  it("shows a whole-percent collateral factor without trailing zeros", () => {
    const { result } = renderHook(() => useProtocolFeeRows());

    // 7800 BPS renders as "78%", not "78.00%"
    expect(rowValue(result.current.rows, COPY.protocolFees.ltv.label)).toBe(
      "78%",
    );
  });

  it("keeps the basis-point precision of a fractional collateral factor", () => {
    // Held for every render this test makes, then handed back, so the
    // assertion does not depend on the hook rendering exactly once.
    vi.mocked(useVaultSplitParams).mockReturnValue({
      ...LAUNCH_SPLIT_PARAMS,
      params: { ...LAUNCH_SPLIT_PARAMS.params, CF: 0.7825 },
    });

    const { result } = renderHook(() => useProtocolFeeRows());

    // 7825 BPS renders as "78.25%", not the "78%" a whole-percent round gave
    expect(rowValue(result.current.rows, COPY.protocolFees.ltv.label)).toBe(
      "78.25%",
    );

    vi.mocked(useVaultSplitParams).mockReturnValue(LAUNCH_SPLIT_PARAMS);
  });

  it("sizes the split minimum from the sacrificial share with no extra buffer", () => {
    const { result } = renderHook(() => useProtocolFeeRows());

    // ceil(50_000 / 0.2857166769…) = 174_999 sats
    expect(
      rowValue(result.current.rows, COPY.protocolFees.minForSplit.label),
    ).toBe("0.00174999 BTC");
  });
});
