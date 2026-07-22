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

const mockLoggerEvent = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { event: mockLoggerEvent, warn: vi.fn(), info: vi.fn() },
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

describe("useVaultProviders — all-providers-disabled telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disabledRef.current = new Set<string>();
  });

  const provider = {
    id: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
    btcPubKey: "0xdeadbeef",
  } as unknown as VaultProvider;

  function mockProvidersQuery() {
    mockedUseQuery.mockReturnValue({
      data: { vaultProviders: [provider], vaultKeepers: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  }

  it("emits onboarding.providers.empty once when the proxy disabled every provider", () => {
    mockProvidersQuery();
    disabledRef.current = new Set([provider.id.toLowerCase()]);

    // Distinct entry point per test: the once-per-application dedupe store is
    // module-scoped and survives across tests in this file.
    const { rerender } = renderHook(() =>
      useVaultProviders("0xapp-all-disabled"),
    );

    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    const [name, ctx] = mockLoggerEvent.mock.calls[0];
    expect(name).toBe("onboarding.providers.empty");
    expect(ctx.reason).toBe("all_disabled");
    expect(ctx.total).toBe(1);

    // Re-renders (poll refreshes) do not re-emit.
    rerender();
    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
  });

  it("does not emit while at least one provider remains listable", () => {
    mockProvidersQuery();

    renderHook(() => useVaultProviders("0xapp-healthy"));

    expect(mockLoggerEvent).not.toHaveBeenCalled();
  });

  it("does not emit when the application genuinely has no providers", () => {
    mockedUseQuery.mockReturnValue({
      data: { vaultProviders: [], vaultKeepers: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderHook(() => useVaultProviders("0xapp-empty"));

    expect(mockLoggerEvent).not.toHaveBeenCalled();
  });
});
