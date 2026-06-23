import { getPositionSizeParams } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultCountCap } from "../useVaultCountCap";
import { useVaults } from "../useVaults";

// vi.mock is hoisted above the imports above, so the mocked modules are in
// place by the time the hook resolves them.
vi.mock("@/config/contracts", () => ({
  CONTRACTS: { AAVE_ADAPTER: "0xaaveadapter" as `0x${string}` },
}));
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: vi.fn(() => ({})) },
}));
vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", () => ({
  getPositionSizeParams: vi.fn(),
}));
vi.mock("../useVaults", () => ({ useVaults: vi.fn() }));

const ADDRESS = "0xdepositor";

function buildWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPositionSizeParams).mockResolvedValue({
    maxPositionBTC: 0n,
    maxVaultsPerPosition: 10n,
  } as Awaited<ReturnType<typeof getPositionSizeParams>>);
});

describe("useVaultCountCap fail-closed behavior", () => {
  it("flags capUnavailable when the vaults-list query errors", async () => {
    // A vaults-list fetch failure must fail closed: without this the count
    // defaults to 0, isAtCap=false, and an at-cap user could lock BTC.
    vi.mocked(useVaults).mockReturnValue({
      data: undefined,
      isError: true,
    } as unknown as ReturnType<typeof useVaults>);

    const { result } = renderHook(() => useVaultCountCap(ADDRESS), {
      wrapper: buildWrapper(),
    });

    await waitFor(() => expect(result.current.capUnavailable).toBe(true));
    expect(result.current.isAtCap).toBe(false);
  });

  it("does not flag capUnavailable while the vaults list is still loading", async () => {
    vi.mocked(useVaults).mockReturnValue({
      data: undefined,
      isError: false,
    } as unknown as ReturnType<typeof useVaults>);

    const { result } = renderHook(() => useVaultCountCap(ADDRESS), {
      wrapper: buildWrapper(),
    });

    await waitFor(() => expect(result.current.maxVaults).toBe(10));
    expect(result.current.capUnavailable).toBe(false);
    expect(result.current.isAtCap).toBe(false);
  });
});
