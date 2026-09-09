import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VaultActivity } from "@/types/activity";

const mockHandleActivation = vi.fn(
  async ({
    onShowSuccessModal,
    onRefetchActivities,
  }: {
    onShowSuccessModal: () => void;
    onRefetchActivities: () => void;
  }) => {
    onShowSuccessModal();
    onRefetchActivities();
  },
);

vi.mock("../useVaultActions", () => ({
  useVaultActions: () => ({
    activating: false,
    activationError: null,
    activationErrorTerminal: false,
    handleActivation: mockHandleActivation,
  }),
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ setOptimisticStatus: vi.fn() }),
}));

const mockAddActivatingVault = vi.fn();
vi.mock("@/applications/aave/context", () => ({
  useActivatingVaults: () => ({
    addActivatingVault: mockAddActivatingVault,
  }),
}));

vi.mock("@/storage/usePeginStorage", () => ({
  usePeginStorage: () => ({
    pendingPegins: [],
    updatePendingPeginStatus: vi.fn(),
  }),
}));

import { useActivationState } from "../useActivationState";

const VAULT_ID =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001";

const activity = {
  id: VAULT_ID,
  collateral: { amount: "1.5" },
  providers: [{ id: "0xprovider" }],
} as unknown as VaultActivity;

const POSITION_KEY = ["aaveUserPosition", "0xUser", "0xspoke"] as const;
const VAULTS_KEY = ["vaults", "0xUser"] as const;

function setup() {
  const client = new QueryClient();
  client.setQueryData(POSITION_KEY, "cached");
  client.setQueryData(VAULTS_KEY, "cached");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(
      () =>
        useActivationState({
          activity,
          depositorEthAddress: "0xUser",
        }),
      { wrapper },
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useActivationState", () => {
  it("invalidates the vault and position queries once activation succeeds", async () => {
    const { client, result } = setup();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(VAULTS_KEY)?.isInvalidated).toBe(true);
  });

  it("still records the optimistic activating row for the indexer gap", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(mockAddActivatingVault).toHaveBeenCalledWith({
      vaultId: VAULT_ID,
      depositorEthAddress: "0xUser",
      amountBtc: 1.5,
      providerAddress: "0xprovider",
    });
  });
});
