import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xregistry" as `0x${string}`,
    AAVE_ADAPTER: "0xaaveadapter" as `0x${string}`,
  },
}));

const featureFlagsMock = vi.hoisted(() => ({ isVaultCapDisabled: false }));
vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

vi.mock("@/clients/eth-contract/cap-policy", () => ({
  getApplicationCap: vi.fn(),
  getApplicationUsage: vi.fn(),
}));

import {
  getApplicationCap,
  getApplicationUsage,
} from "@/clients/eth-contract/cap-policy";

import { useApplicationCap } from "../useApplicationCap";

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
  featureFlagsMock.isVaultCapDisabled = false;
});

describe("useApplicationCap", () => {
  it("computes a snapshot without user usage when no address is supplied", async () => {
    vi.mocked(getApplicationCap).mockResolvedValue({
      totalCapBTC: 1000n,
      perAddressCapBTC: 50n,
    });
    vi.mocked(getApplicationUsage).mockResolvedValue({
      totalBTC: 200n,
      userBTC: null,
    });

    const { result } = renderHook(() => useApplicationCap(), {
      wrapper: buildWrapper(),
    });

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.snapshot).toMatchObject({
      totalCapBTC: 1000n,
      totalBTC: 200n,
      userBTC: null,
      remainingTotal: 800n,
      remainingForUser: null,
      effectiveRemaining: 800n,
    });
  });

  it("includes per-user remaining when a user address is supplied", async () => {
    vi.mocked(getApplicationCap).mockResolvedValue({
      totalCapBTC: 1000n,
      perAddressCapBTC: 50n,
    });
    vi.mocked(getApplicationUsage).mockResolvedValue({
      totalBTC: 200n,
      userBTC: 10n,
    });

    const { result } = renderHook(
      () => useApplicationCap("0xuser" as `0x${string}`),
      { wrapper: buildWrapper() },
    );

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.snapshot).toMatchObject({
      remainingTotal: 800n,
      remainingForUser: 40n,
      effectiveRemaining: 40n,
    });
  });

  it("uses real usage data when computing an uncapped snapshot", async () => {
    vi.mocked(getApplicationCap).mockResolvedValue({
      totalCapBTC: 0n,
      perAddressCapBTC: 0n,
    });
    vi.mocked(getApplicationUsage).mockResolvedValue({
      totalBTC: 12_345n,
      userBTC: null,
    });

    const { result } = renderHook(() => useApplicationCap(), {
      wrapper: buildWrapper(),
    });

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(getApplicationUsage).toHaveBeenCalledWith(
      "0xaaveadapter",
      undefined,
    );
    expect(result.current.snapshot).toMatchObject({
      hasTotalCap: false,
      hasPerAddressCap: false,
      totalBTC: 12_345n,
      effectiveRemaining: null,
    });
  });

  it("keeps snapshot null while queries are loading", () => {
    vi.mocked(getApplicationCap).mockImplementation(
      () => new Promise(() => {}),
    );
    vi.mocked(getApplicationUsage).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useApplicationCap(), {
      wrapper: buildWrapper(),
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("falls back to a synthetic snapshot and shields usage errors on an uncapped deployment", async () => {
    vi.mocked(getApplicationCap).mockResolvedValue({
      totalCapBTC: 0n,
      perAddressCapBTC: 0n,
    });
    vi.mocked(getApplicationUsage).mockRejectedValue(
      new Error("usage rpc timeout"),
    );

    const { result } = renderHook(() => useApplicationCap(), {
      wrapper: buildWrapper(),
    });

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.snapshot).toMatchObject({
      hasTotalCap: false,
      totalBTC: 0n,
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.isLoading).toBe(false);
  });

  it("returns a no-feature state and skips RPC when the vault-cap kill-switch is set", () => {
    featureFlagsMock.isVaultCapDisabled = true;

    const { result } = renderHook(() => useApplicationCap("0xuser"), {
      wrapper: buildWrapper(),
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getApplicationCap).not.toHaveBeenCalled();
    expect(getApplicationUsage).not.toHaveBeenCalled();
  });
});
