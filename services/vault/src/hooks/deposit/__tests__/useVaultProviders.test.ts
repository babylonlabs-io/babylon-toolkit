import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { shortId } from "@/infrastructure/telemetryEvents";

import {
  fetchAppProviderMetadata,
  fetchAppProviders,
} from "../../../services/providers";
import type { VaultProvider } from "../../../types";
import { useVaultProviders } from "../useVaultProviders";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

// Mutable ref so telemetry tests can mount the hook for the current adapter
// under a distinct application address each (the dedupe stores are
// module-scoped and survive across tests in this file).
const { adapterRef } = vi.hoisted(() => ({
  adapterRef: { current: "0xadapter" },
}));

vi.mock("../../../applications/aave/context/AaveConfigContext", () => ({
  useAaveConfig: () => ({
    config: { adapterAddress: adapterRef.current },
  }),
}));

vi.mock("../../../services/providers", () => ({
  fetchAppProviderMetadata: vi.fn(),
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
const mockLoggerWarn = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { event: mockLoggerEvent, warn: mockLoggerWarn, info: vi.fn() },
}));

// Mutable ref so individual tests can control the operator allowlist.
const { allowlistRef } = vi.hoisted(() => ({
  allowlistRef: { current: null as ReadonlySet<string> | null },
}));

vi.mock("@/config/featureFlags", () => ({
  default: {
    get allowedVaultProviders() {
      return allowlistRef.current;
    },
  },
}));

vi.mock("../../useLogos", () => {
  const stableLogos = {};
  return {
    useLogos: () => ({ logos: stableLogos, isLoading: false, error: null }),
    toIdentity: (hex: string) => (hex.startsWith("0x") ? hex.slice(2) : hex),
  };
});

const mockedUseQuery = vi.mocked(useQuery);
const mockFetchAppProviderMetadata = vi.mocked(fetchAppProviderMetadata);
const mockFetchAppProviders = vi.mocked(fetchAppProviders);

describe("useVaultProviders query scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disabledRef.current = new Set<string>();
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it("uses the metadata-only fetcher for provider lookup paths", async () => {
    mockFetchAppProviderMetadata.mockResolvedValue({
      vaultProviders: [],
      vaultKeepers: [],
      vaultKeeperItems: [],
    });

    renderHook(() =>
      useVaultProviders("0xApp", { requireCompleteKeeperRoster: false }),
    );
    const options = mockedUseQuery.mock.calls[0][0];
    if (typeof options.queryFn !== "function") {
      throw new Error("Expected useVaultProviders to configure a queryFn");
    }
    await options.queryFn({} as never);

    expect(mockFetchAppProviderMetadata).toHaveBeenCalledWith("0xApp");
    expect(mockFetchAppProviders).not.toHaveBeenCalled();
    expect(options.queryKey).toEqual(["providers", "0xApp", "metadata-only"]);
    expect(options).toMatchObject({
      refetchOnReconnect: false,
    });
    // A remount must be able to retry a transient failure.
    expect(options.retryOnMount).not.toBe(false);
  });
});

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

  it("resolves a provider whose RPC URL is missing", () => {
    const providerWithoutRpcUrl: VaultProvider = {
      id: DISABLED_ID,
      btcPubKey: "0xbeef",
      metadataStatus: "missing",
      metadataRejectionReason: "rpcUrl is missing",
    };
    mockedUseQuery.mockReturnValue({
      data: { vaultProviders: [providerWithoutRpcUrl], vaultKeepers: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    const { result } = renderHook(() => useVaultProviders());

    const resolvedProvider = result.current.findProvider(DISABLED_ID);

    expect(resolvedProvider).toMatchObject(providerWithoutRpcUrl);
    expect(resolvedProvider?.url).toBeUndefined();
  });

  it("lists every VP when none are disabled", () => {
    const { result } = renderHook(() => useVaultProviders());

    const ids = result.current.allVaultProviders.map((p) => p.id);
    expect(ids).toEqual([ENABLED_ID, DISABLED_ID]);
  });
});

describe("useVaultProviders — empty-picker telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disabledRef.current = new Set<string>();
    adapterRef.current = "0xadapter";
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
    adapterRef.current = "0xapp-all-disabled";
    const { rerender } = renderHook(() =>
      useVaultProviders("0xapp-all-disabled"),
    );

    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    const [name, ctx] = mockLoggerEvent.mock.calls[0];
    expect(name).toBe("onboarding.providers.empty");
    expect(ctx.tags.reason).toBe("all_disabled");
    expect(ctx.total).toBe(1);

    // Re-renders (poll refreshes) do not re-emit.
    rerender();
    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
  });

  it("emits once when the same application mounts with checksummed and lowercase addresses", () => {
    mockProvidersQuery();
    disabledRef.current = new Set([provider.id.toLowerCase()]);

    adapterRef.current = "0xapp-casing";
    renderHook(() => useVaultProviders("0xAPP-CASING"));
    renderHook(() => useVaultProviders("0xapp-casing"));

    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
  });

  it("does not emit while at least one provider remains listable", () => {
    mockProvidersQuery();

    adapterRef.current = "0xapp-healthy";
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

    adapterRef.current = "0xapp-empty";
    renderHook(() => useVaultProviders("0xapp-empty"));

    expect(mockLoggerEvent).not.toHaveBeenCalled();
  });

  it("does not emit from a mount for an application other than the current adapter", () => {
    mockProvidersQuery();
    disabledRef.current = new Set([provider.id.toLowerCase()]);

    // A payout-signing mount passes the vault's own application, which after
    // an adapter redeploy is not the one the picker lists.
    renderHook(() => useVaultProviders("0xapp-older-adapter-disabled"));

    expect(mockLoggerEvent).not.toHaveBeenCalled();
  });
});

describe("useVaultProviders allowlist filtering", () => {
  const VP_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const VP_A_CHECKSUMMED = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
  const VP_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const VP_C = "0xcccccccccccccccccccccccccccccccccccccccc";

  beforeEach(() => {
    vi.clearAllMocks();
    disabledRef.current = new Set<string>();
    allowlistRef.current = null;

    mockedUseQuery.mockReturnValue({
      data: {
        vaultProviders: [
          { id: VP_A_CHECKSUMMED, btcPubKey: "0xdead" },
          { id: VP_B, btcPubKey: "0xbeef" },
        ] as unknown as VaultProvider[],
        vaultKeepers: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it("lists every VP when no allowlist is configured", () => {
    const { result } = renderHook(() => useVaultProviders());

    const ids = result.current.allVaultProviders.map((p) => p.id);
    expect(ids).toEqual([VP_A_CHECKSUMMED, VP_B]);
  });

  it("lists only allowlisted VPs in the picker", () => {
    allowlistRef.current = new Set([VP_B]);

    const { result } = renderHook(() => useVaultProviders());

    const ids = result.current.allVaultProviders.map((p) => p.id);
    expect(ids).toEqual([VP_B]);
  });

  it("matches a lowercased allowlist entry against a checksummed provider id", () => {
    allowlistRef.current = new Set([VP_A]);

    const { result } = renderHook(() => useVaultProviders());

    const ids = result.current.allVaultProviders.map((p) => p.id);
    expect(ids).toEqual([VP_A_CHECKSUMMED]);
  });

  it("still resolves a VP outside the allowlist via findProvider so existing vaults stay manageable", () => {
    allowlistRef.current = new Set([VP_A]);

    const { result } = renderHook(() => useVaultProviders());

    expect(result.current.findProvider(VP_B)?.id).toBe(VP_B);
  });

  it("applies the allowlist on top of the proxy hide list", () => {
    allowlistRef.current = new Set([VP_A, VP_B]);
    disabledRef.current = new Set([VP_B]);

    const { result } = renderHook(() => useVaultProviders());

    const ids = result.current.allVaultProviders.map((p) => p.id);
    expect(ids).toEqual([VP_A_CHECKSUMMED]);
  });

  it("lists nothing when the allowlist matches no provider", () => {
    allowlistRef.current = new Set([VP_C]);

    const { result } = renderHook(() => useVaultProviders());

    expect(result.current.allVaultProviders).toEqual([]);
  });
});

describe("useVaultProviders — allowlist telemetry", () => {
  const VP_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const VP_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const VP_C = "0xcccccccccccccccccccccccccccccccccccccccc";

  beforeEach(() => {
    vi.clearAllMocks();
    disabledRef.current = new Set<string>();
    allowlistRef.current = null;
    adapterRef.current = "0xadapter";

    mockedUseQuery.mockReturnValue({
      data: {
        vaultProviders: [
          { id: VP_A, btcPubKey: "0xdead" },
          { id: VP_B, btcPubKey: "0xbeef" },
        ] as unknown as VaultProvider[],
        vaultKeepers: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  // Distinct entry point per test: the once-per-application dedupe stores are
  // module-scoped and survive across tests in this file.

  it("emits onboarding.providers.empty with reason allowlist once when the allowlist hides every provider", () => {
    allowlistRef.current = new Set([VP_C]);

    adapterRef.current = "0xapp-allowlist-empty";
    const { rerender } = renderHook(() =>
      useVaultProviders("0xapp-allowlist-empty"),
    );

    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    const [name, ctx] = mockLoggerEvent.mock.calls[0];
    expect(name).toBe("onboarding.providers.empty");
    expect(ctx.tags.reason).toBe("allowlist");
    expect(ctx.total).toBe(2);

    rerender();
    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
  });

  it("carries the unmatched entries, shortened past the address scrubber, on the allowlist event", () => {
    allowlistRef.current = new Set([VP_C]);

    adapterRef.current = "0xapp-allowlist-event-data";
    renderHook(() => useVaultProviders("0xapp-allowlist-event-data"));

    const ctx = mockLoggerEvent.mock.calls[0][1];
    expect(ctx.unmatchedAllowlist).toEqual([shortId(VP_C)]);
    expect(JSON.stringify(ctx)).not.toContain(VP_C);
  });

  it("reports the proxy, not the allowlist, when the allowlist matched but the proxy disabled every match", () => {
    allowlistRef.current = new Set([VP_A]);
    disabledRef.current = new Set([VP_A]);

    adapterRef.current = "0xapp-allowlist-then-disabled";
    renderHook(() => useVaultProviders("0xapp-allowlist-then-disabled"));

    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    const ctx = mockLoggerEvent.mock.calls[0][1];
    expect(ctx.tags.reason).toBe("all_disabled");
    expect(ctx.unmatchedAllowlist).toBeUndefined();
  });

  it("warns once per application, naming unmatched entries in a form that survives the address scrubber", () => {
    allowlistRef.current = new Set([VP_A, VP_C]);

    adapterRef.current = "0xapp-allowlist-unmatched";
    const { result, rerender } = renderHook(() =>
      useVaultProviders("0xapp-allowlist-unmatched"),
    );

    expect(result.current.allVaultProviders.map((p) => p.id)).toEqual([VP_A]);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    const message = mockLoggerWarn.mock.calls[0][0];
    expect(message).toContain(shortId(VP_C));
    expect(message).not.toContain(VP_C);
    expect(message).not.toContain(shortId(VP_A));

    rerender();
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when every allowlist entry matches a provider", () => {
    allowlistRef.current = new Set([VP_A, VP_B]);

    adapterRef.current = "0xapp-allowlist-all-matched";
    renderHook(() => useVaultProviders("0xapp-allowlist-all-matched"));

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("neither emits nor warns from a mount for an application other than the current adapter", () => {
    allowlistRef.current = new Set([VP_C]);

    renderHook(() => useVaultProviders("0xapp-older-adapter-allowlist"));

    expect(mockLoggerEvent).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});
