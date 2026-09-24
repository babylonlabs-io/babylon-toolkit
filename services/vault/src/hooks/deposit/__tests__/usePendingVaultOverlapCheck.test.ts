import { renderHook } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PendingPeginStorageReadError } from "@/storage/peginStorage";

import { usePendingVaultOverlapCheck } from "../usePendingVaultOverlapCheck";

const mockGetPendingPegins = vi.hoisted(() => vi.fn());

vi.mock("@/storage/peginStorage", async () => {
  const actual = await vi.importActual<typeof import("@/storage/peginStorage")>(
    "@/storage/peginStorage",
  );
  return { ...actual, getPendingPegins: mockGetPendingPegins };
});

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  DUST_THRESHOLD: 330n,
  selectUtxosForPegin: () => ({ selectedUTXOs: [] }),
  findOverlappingPendingVaults: () => [],
}));

vi.mock("@/hooks/useVaults", () => ({
  useVaults: () => ({ data: { vaults: [] } }),
}));

const ETH_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;

function runCheck() {
  const { result } = renderHook(() =>
    usePendingVaultOverlapCheck({
      ethAddress: ETH_ADDRESS,
      spendableUTXOs: [],
      estimatedFeeRate: 5,
      depositorClaimValue: 1000n,
      minPeginFee: 500n,
    }),
  );
  return result.current([100_000n]);
}

describe("usePendingVaultOverlapCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports an unreadable storage blob instead of a count", () => {
    mockGetPendingPegins.mockImplementation(() => {
      throw new PendingPeginStorageReadError(
        ETH_ADDRESS,
        '[{"id":',
        new SyntaxError("Unexpected end of JSON input"),
      );
    });

    expect(runCheck()).toBe("unreadable");
  });

  it("propagates a storage failure that is not the typed read error", () => {
    mockGetPendingPegins.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() => runCheck()).toThrow("boom");
  });
});
