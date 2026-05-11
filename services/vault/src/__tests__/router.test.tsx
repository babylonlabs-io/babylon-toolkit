/**
 * Router-level regression tests.
 *
 * The /activity route renders <Activity />, which transitively calls
 * useAaveConfig() through useActivities(). If the route element loses
 * its AaveConfigProvider wrapper, the page throws synchronously on
 * mount. These tests lock in that the route is always wrapped in a
 * provider so a future router refactor can't silently regress.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/pages/RootLayout", () => ({
  default: () => <Outlet context={{ openDeposit: () => {} }} />,
}));

vi.mock("../applications", () => ({
  getAllApplications: () => [],
  getApplication: () => undefined,
  getApplicationMetadataByController: () => undefined,
}));

vi.mock("../applications/aave/services", () => ({
  fetchAaveAppConfig: vi.fn().mockResolvedValue({
    config: {
      adapterAddress: "0x1",
      vaultBtcAddress: "0x2",
      btcVaultRegistryAddress: "0x3",
      coreSpokeAddress: "0x4" as `0x${string}`,
      btcVaultCoreVbtcReserveId: 1n,
    },
    vbtcReserve: null,
    borrowableReserves: [],
    allBorrowReserves: [],
  }),
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: "0xethtest", connected: true }),
}));

vi.mock("../services/activity", async () => {
  const actual = await vi.importActual<typeof import("../services/activity")>(
    "../services/activity",
  );
  return {
    ...actual,
    fetchUserActivities: vi.fn().mockResolvedValue([]),
    getPendingActivities: vi.fn().mockReturnValue([]),
  };
});

async function renderAt(path: string): Promise<ReturnType<typeof render>> {
  const { Router } = await import("../router");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui: ReactNode = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Router />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui);
}

describe("Router — /activity regression for AaveConfigProvider wiring", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the Activity page heading without throwing the provider error", async () => {
    await renderAt("/activity");

    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeInTheDocument();
    });

    const PROVIDER_ERROR =
      "useAaveConfig must be used within an AaveConfigProvider";
    const sawProviderError = consoleErrorSpy.mock.calls
      .flat()
      .some((arg: unknown) => {
        if (typeof arg === "string") return arg.includes(PROVIDER_ERROR);
        if (arg instanceof Error) return arg.message.includes(PROVIDER_ERROR);
        return false;
      });
    expect(sawProviderError).toBe(false);
  });
});
