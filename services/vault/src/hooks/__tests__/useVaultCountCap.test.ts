import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { renderHook } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Vault } from "@/types/vault";

import {
  countCollateralizableVaults,
  useVaultCountCap,
} from "../useVaultCountCap";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: 5, isError: false })),
}));
vi.mock("../useVaults", () => ({
  useVaults: vi.fn(),
}));

const ADAPTER = "0x00000000000000000000000000000000000000a1" as Address;
const OTHER_ADAPTER = "0x00000000000000000000000000000000000000b2" as Address;

function v(status: ContractStatus, entryPoint: Address = ADAPTER): Vault {
  return { status, applicationEntryPoint: entryPoint } as unknown as Vault;
}

describe("countCollateralizableVaults", () => {
  it("counts ACTIVE + PENDING + VERIFIED scoped to the adapter (the in-flight margin)", () => {
    const vaults = [
      v(ContractStatus.ACTIVE),
      v(ContractStatus.PENDING),
      v(ContractStatus.VERIFIED),
    ];
    expect(countCollateralizableVaults(vaults, ADAPTER)).toBe(3);
  });

  it("excludes REDEEMED / LIQUIDATED / withdrawn vaults (they free their slot)", () => {
    const vaults = [
      v(ContractStatus.ACTIVE),
      v(ContractStatus.REDEEMED),
      v(ContractStatus.LIQUIDATED),
      v(ContractStatus.DEPOSITOR_WITHDRAWN),
    ];
    expect(countCollateralizableVaults(vaults, ADAPTER)).toBe(1);
  });

  it("excludes vaults bound to a different adapter", () => {
    const vaults = [
      v(ContractStatus.ACTIVE),
      v(ContractStatus.ACTIVE, OTHER_ADAPTER),
    ];
    expect(countCollateralizableVaults(vaults, ADAPTER)).toBe(1);
  });

  it("matches the adapter case-insensitively", () => {
    const vaults = [v(ContractStatus.ACTIVE, ADAPTER.toUpperCase() as Address)];
    expect(countCollateralizableVaults(vaults, ADAPTER.toLowerCase())).toBe(1);
  });
});

describe("useVaultCountCap capUnavailable", () => {
  const DEPOSITOR = "0x00000000000000000000000000000000000000c3" as Address;
  let useVaultsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../useVaults");
    useVaultsMock = vi.mocked(mod.useVaults) as unknown as ReturnType<
      typeof vi.fn
    >;
  });

  it("stays available when the vaults fetch returned every row", () => {
    useVaultsMock.mockReturnValue({
      data: { vaults: [], droppedCount: 0 },
      isError: false,
    });

    const { result } = renderHook(() => useVaultCountCap(DEPOSITOR));

    expect(result.current.capUnavailable).toBe(false);
  });

  it("fails closed when the vaults fetch dropped a row it could not transform", () => {
    // A dropped vault under-counts exactly like a failed fetch, so the cap
    // must not be treated as known.
    useVaultsMock.mockReturnValue({
      data: { vaults: [], droppedCount: 1 },
      isError: false,
    });

    const { result } = renderHook(() => useVaultCountCap(DEPOSITOR));

    expect(result.current.capUnavailable).toBe(true);
  });
});
