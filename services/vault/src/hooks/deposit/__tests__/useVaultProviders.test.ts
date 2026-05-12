import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VaultProvider } from "../../../types";
import { useVaultProviders } from "../useVaultProviders";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("../../../applications/aave/context/AaveConfigContext", () => ({
  useAaveConfig: () => ({
    config: { adapterAddress: "0xadapter" },
  }),
}));

vi.mock("../../../services/providers", () => ({
  fetchAppProviders: vi.fn(),
}));

vi.mock("../../useUnhealthyVps", () => ({
  useUnhealthyVps: () => new Set<string>(),
}));

vi.mock("../../useLogos", () => {
  const stableLogos = {};
  return {
    useLogos: () => ({ logos: stableLogos, isLoading: false, error: null }),
    toIdentity: (hex: string) => (hex.startsWith("0x") ? hex.slice(2) : hex),
  };
});

const mockedUseQuery = vi.mocked(useQuery);

describe("useVaultProviders ref stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a stable findProvider across re-renders when the providers query has no data", () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as never);

    const { result, rerender } = renderHook(() => useVaultProviders());
    const first = result.current.findProvider;
    rerender();
    expect(result.current.findProvider).toBe(first);
  });

  it("returns a stable findProvider across re-renders when the providers query has resolved", () => {
    const provider = {
      id: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
      btcPubKey: "0xdeadbeef",
    } as unknown as VaultProvider;

    mockedUseQuery.mockReturnValue({
      data: { vaultProviders: [provider], vaultKeepers: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    const { result, rerender } = renderHook(() => useVaultProviders());
    const first = result.current.findProvider;
    rerender();
    expect(result.current.findProvider).toBe(first);
  });
});
