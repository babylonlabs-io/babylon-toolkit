import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VaultActivity } from "@/types/activity";

let mockCollateralAdded = true;
let mockRedeemed = false;
const mockHandleActivation = vi.fn(
  async ({
    onShowSuccessModal,
    onRefetchActivities,
  }: {
    onShowSuccessModal: (outcome: {
      collateralAdded: boolean;
      redeemed: boolean;
    }) => void;
    onRefetchActivities: () => void;
  }) => {
    onShowSuccessModal({
      collateralAdded: mockCollateralAdded,
      redeemed: mockRedeemed,
    });
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

const mockSetOptimisticStatus = vi.fn();
const mockMarkActivationReturned = vi.fn();
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({
    setOptimisticStatus: mockSetOptimisticStatus,
    markActivationReturned: mockMarkActivationReturned,
  }),
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
const ACTIVITIES_KEY = ["user-activities", "0xUser"] as const;

function setup(redeemImmediately?: boolean) {
  const client = new QueryClient();
  client.setQueryData(POSITION_KEY, "cached");
  client.setQueryData(VAULTS_KEY, "cached");
  client.setQueryData(ACTIVITIES_KEY, "cached");
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
          redeemImmediately,
        }),
      { wrapper },
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollateralAdded = true;
  mockRedeemed = false;
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

  it("invalidates the activities query so the activated deposit leaves the list", async () => {
    const { client, result } = setup();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(client.getQueryState(ACTIVITIES_KEY)?.isInvalidated).toBe(true);
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

  it("skips the optimistic activating row when the receipt shows no CollateralAdded", async () => {
    // The registry confirmed the activation but redeemed the vault (e.g. a cap
    // was exceeded). The indexer never lists it as collateral, so a row added
    // here would overstate collateral until the 90s backstop.
    mockCollateralAdded = false;
    mockRedeemed = true;
    const { result } = setup();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(mockAddActivatingVault).not.toHaveBeenCalled();
  });

  it("reports the activated outcome when the receipt shows CollateralAdded", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(result.current.outcome).toBe("activated");
    expect(mockMarkActivationReturned).not.toHaveBeenCalled();
  });

  it("reports the activated outcome when the receipt shows neither CollateralAdded nor a redemption", async () => {
    // An activation into an application other than the Aave adapter carries
    // neither log. A missing log is not evidence the BTC is coming back.
    mockCollateralAdded = false;
    const { result } = setup();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(result.current.outcome).toBe("activated");
    expect(mockMarkActivationReturned).not.toHaveBeenCalled();
  });

  it("reports the returned outcome and marks the vault returned when the receipt shows the registry redeemed it", async () => {
    // The optimistic CONFIRMED alone reads as activated; the mark is what
    // keeps the continuation view from saying "BTCVault activated".
    mockCollateralAdded = false;
    mockRedeemed = true;
    const { result } = setup();

    expect(result.current.outcome).toBeNull();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(result.current.outcome).toBe("returned");
    expect(mockMarkActivationReturned).toHaveBeenCalledWith(VAULT_ID);
    expect(mockSetOptimisticStatus).toHaveBeenCalledWith(VAULT_ID, "confirmed");
  });

  it("marks the vault returned before recording the optimistic CONFIRMED status", async () => {
    // Both land in one batch today, but no snapshot may hold CONFIRMED without
    // the mark: that combination reads as activated.
    mockCollateralAdded = false;
    mockRedeemed = true;
    const { result } = setup();

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(mockMarkActivationReturned.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetOptimisticStatus.mock.invocationCallOrder[0],
    );
  });

  it("marks the vault returned and records CONFIRMED even when the consumer unmounted before the receipt", async () => {
    // A cross-device resume stores no record, so the app-scoped store is the
    // only place the reveal is recorded. Without CONFIRMED the vault stays
    // VERIFIED and a continuation view opened later offers Activate again;
    // without the mark, CONFIRMED reads as activated.
    mockCollateralAdded = false;
    mockRedeemed = true;
    const { result, unmount } = setup();
    const { handleActivation } = result.current;
    unmount();

    await act(async () => {
      await handleActivation("0xsecret");
    });

    expect(mockMarkActivationReturned).toHaveBeenCalledWith(VAULT_ID);
    expect(mockSetOptimisticStatus).toHaveBeenCalledWith(VAULT_ID, "confirmed");
  });

  it("records CONFIRMED and the optimistic collateral row for an accepted activation even when the consumer unmounted", async () => {
    // Both live outside this consumer: the store is app-scoped and the
    // collateral row belongs to the app-level activating-vaults provider.
    const { result, unmount } = setup();
    const { handleActivation } = result.current;
    unmount();

    await act(async () => {
      await handleActivation("0xsecret");
    });

    expect(mockSetOptimisticStatus).toHaveBeenCalledWith(VAULT_ID, "confirmed");
    expect(mockAddActivatingVault).toHaveBeenCalledWith(
      expect.objectContaining({ vaultId: VAULT_ID }),
    );
    expect(mockMarkActivationReturned).not.toHaveBeenCalled();
  });

  it("does not mark the escape hatch as returned, since it has its own success screen", async () => {
    mockCollateralAdded = false;
    mockRedeemed = true;
    const { result } = setup(true);

    await act(async () => {
      await result.current.handleActivation("0xsecret");
    });

    expect(result.current.outcome).toBe("returned");
    expect(mockMarkActivationReturned).not.toHaveBeenCalled();
  });
});
