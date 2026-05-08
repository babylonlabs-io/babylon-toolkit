import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../services/assertVbtcReserveAnchoredToAdapter", () => ({
  assertVbtcReserveAnchoredToAdapter: vi.fn(),
}));

import { ReserveMismatchError } from "../../../../../services/assertReserveMatchesOnChain";
import { assertVbtcReserveAnchoredToAdapter } from "../../../../../services/assertVbtcReserveAnchoredToAdapter";
import { validateRepayPreSign } from "../validateRepayPreSign";

const mockAssertAnchored = vi.mocked(assertVbtcReserveAnchoredToAdapter);

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const VBTC_RESERVE_ID = 1n;

describe("validateRepayPreSign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertAnchored.mockResolvedValue();
  });

  it("throws when refetchSplitParams returns null", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(null);

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        adapterAddress: ADAPTER,
        displayedVbtcReserveId: VBTC_RESERVE_ID,
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
        adapterAddress: ADAPTER,
        displayedVbtcReserveId: VBTC_RESERVE_ID,
      }),
    ).rejects.toThrow("Risk parameters have changed");
  });

  it("aborts when the displayed reserve id does not match the adapter (auditor #230)", async () => {
    mockAssertAnchored.mockRejectedValue(
      new ReserveMismatchError("vBTC reserve id mismatch"),
    );
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        adapterAddress: ADAPTER,
        displayedVbtcReserveId: 999n,
      }),
    ).rejects.toBeInstanceOf(ReserveMismatchError);

    expect(mockAssertAnchored).toHaveBeenCalledWith(ADAPTER, 999n);
  });

  it("resolves when fresh CF matches and reserve id is anchored", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        adapterAddress: ADAPTER,
        displayedVbtcReserveId: VBTC_RESERVE_ID,
      }),
    ).resolves.toBeUndefined();

    expect(refetchSplitParams).toHaveBeenCalledTimes(1);
    expect(mockAssertAnchored).toHaveBeenCalledWith(ADAPTER, VBTC_RESERVE_ID);
  });

  it("propagates errors from refetchSplitParams", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockRejectedValue(new Error("RPC failure"));

    await expect(
      validateRepayPreSign({
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        adapterAddress: ADAPTER,
        displayedVbtcReserveId: VBTC_RESERVE_ID,
      }),
    ).rejects.toThrow("RPC failure");
  });
});
