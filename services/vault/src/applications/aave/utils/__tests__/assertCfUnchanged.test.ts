import { describe, expect, it, vi } from "vitest";

import type { VaultSplitParams } from "../../hooks/useVaultSplitParams";
import { assertCfUnchanged } from "../assertCfUnchanged";

const CF_75 = { THF: 1.1, CF: 0.75, LB: 1.05 } satisfies VaultSplitParams;
const CF_70 = { THF: 1.1, CF: 0.7, LB: 1.05 } satisfies VaultSplitParams;

describe("assertCfUnchanged", () => {
  it("throws when refetchSplitParams returns null (RPC failure)", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(null);

    await expect(
      assertCfUnchanged({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
      }),
    ).rejects.toThrow(/Could not verify current risk parameters/);
  });

  it("throws when on-chain CF moved since the screen was rendered (audit #260)", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(CF_70);

    await expect(
      assertCfUnchanged({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
      }),
    ).rejects.toThrow(/Risk parameters have changed/);
  });

  it("returns fresh values when CF matches the displayed threshold", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(CF_75);

    const result = await assertCfUnchanged({
      liquidationThresholdBps: 7500,
      refetchSplitParams,
    });

    expect(result.freshLiquidationThresholdBps).toBe(7500);
    expect(result.freshSplitParams).toEqual(CF_75);
  });

  it("skips the equality check when the displayed BPS is 0 (loading/errored state)", async () => {
    // If the user clicked through a state where split params hadn't loaded
    // (`liquidationThresholdBps === 0`), claiming "Risk parameters have
    // changed" against the freshly fetched 7500 would be misleading — the
    // displayed value was never a real comparison target.
    const refetchSplitParams = vi.fn().mockResolvedValue(CF_75);

    const result = await assertCfUnchanged({
      liquidationThresholdBps: 0,
      refetchSplitParams,
    });

    expect(result.freshLiquidationThresholdBps).toBe(7500);
  });

  it("propagates underlying refetch errors instead of swallowing them", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockRejectedValue(new Error("RPC failure"));

    await expect(
      assertCfUnchanged({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
      }),
    ).rejects.toThrow("RPC failure");
  });
});
