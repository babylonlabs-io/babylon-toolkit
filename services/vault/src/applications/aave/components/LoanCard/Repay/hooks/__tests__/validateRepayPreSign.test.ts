import { describe, expect, it, vi } from "vitest";

import { validateRepayPreSign } from "../validateRepayPreSign";

describe("validateRepayPreSign", () => {
  it("throws when refetchSplitParams returns null", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(null);

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
      }),
    ).rejects.toThrow("Could not verify current risk parameters");
  });

  it("aborts when on-chain CF moved since the screen was rendered (auditor #260)", async () => {
    // Displayed metrics were computed with CF=0.75. Governance has since
    // lowered CF to 0.70 — same dynamicConfigKey, so the cached value
    // would have stayed 0.75 without an explicit refetch.
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.7,
      LB: 1.05,
    });

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
      }),
    ).rejects.toThrow("Risk parameters have changed");
  });

  it("resolves when fresh CF matches the displayed threshold", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
      }),
    ).resolves.toBeUndefined();

    expect(refetchSplitParams).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from refetchSplitParams", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockRejectedValue(new Error("RPC failure"));

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
      }),
    ).rejects.toThrow("RPC failure");
  });
});
