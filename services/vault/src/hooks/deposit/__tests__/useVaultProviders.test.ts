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

// Mutable ref so individual tests can control which VPs are reported disabled.
const { disabledRef } = vi.hoisted(() => ({
  disabledRef: { current: new Set<string>() },
}));

vi.mock("../../useDisabledVps", () => ({
  useDisabledVps: () => disabledRef.current,
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
    disabledRef.current = new Set<string>();
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

describe("useVaultProviders disabled filtering", () => {
  const ENABLED_ID = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const DISABLED_ID = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  beforeEach(() => {
    vi.clearAllMocks();
    disabledRef.current = new Set<string>();

    mockedUseQuery.mockReturnValue({
      data: {
        vaultProviders: [
          { id: ENABLED_ID, btcPubKey: "0xdead" },
          { id: DISABLED_ID, btcPubKey: "0xbeef" },
        ] as unknown as VaultProvider[],
        vaultKeepers: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it("excludes proxy-disabled VPs from the listable provider set", () => {
    disabledRef.current = new Set<string>([DISABLED_ID]);

    const { result } = renderHook(() => useVaultProviders());

    const ids = result.current.allVaultProviders.map((p) => p.id);
    expect(ids).toEqual([ENABLED_ID]);
  });

  it("still resolves a disabled VP via findProvider so existing vaults stay manageable", () => {
    disabledRef.current = new Set<string>([DISABLED_ID]);

    const { result } = renderHook(() => useVaultProviders());

    expect(result.current.findProvider(DISABLED_ID)?.id).toBe(DISABLED_ID);
  });

  it("lists every VP when none are disabled", () => {
    const { result } = renderHook(() => useVaultProviders());

    const ids = result.current.allVaultProviders.map((p) => p.id);
    expect(ids).toEqual([ENABLED_ID, DISABLED_ID]);
  });
});
