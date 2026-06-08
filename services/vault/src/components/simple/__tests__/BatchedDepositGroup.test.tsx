import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionStatus } from "@/components/deposit/actionStatus";
import { PeginAction } from "@/components/deposit/actionStatus";
import { COPY } from "@/copy";
import type { VaultActivity } from "@/types/activity";

import { BatchedDepositGroup } from "../BatchedDepositGroup";

const mockGetPollingResult = vi.fn();
const mockGetActionStatus = vi.fn();

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ getPollingResult: mockGetPollingResult }),
}));

vi.mock("@/components/deposit/actionStatus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/deposit/actionStatus")>();
  return {
    ...actual,
    getActionStatus: (...args: unknown[]) => mockGetActionStatus(...args),
  };
});

// Stub the inner card — this suite covers the group wrapper, not the card.
vi.mock("../PendingDepositCard", () => ({
  PendingDepositCard: ({ depositId }: { depositId: string }) => (
    <div data-testid="deposit-card" data-deposit-id={depositId} />
  ),
}));

function activity(id: string): VaultActivity {
  return {
    id: id as VaultActivity["id"],
    collateral: { amount: "0.01", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    displayLabel: "Pending" as VaultActivity["displayLabel"],
    unsignedPrePeginTx: "0xdeadbeef",
    depositorWotsPkHash: "0xwots",
  };
}

const BROADCAST_AVAILABLE: ActionStatus = {
  type: "available",
  action: {
    action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
    label: "Broadcast Pre-Pegin",
  },
};
const NO_ACTION: ActionStatus = { type: "noAction" };

function renderGroup(activities: VaultActivity[], onBroadcastClick = vi.fn()) {
  render(
    <BatchedDepositGroup
      activities={activities}
      vaultProviders={[]}
      onBroadcastClick={onBroadcastClick}
    />,
  );
  return { onBroadcastClick };
}

describe("BatchedDepositGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPollingResult.mockReturnValue({ some: "result" });
  });

  it("groups siblings with a hoisted broadcast button while the broadcast is pending", () => {
    mockGetActionStatus.mockReturnValue(BROADCAST_AVAILABLE);
    renderGroup([activity("0xa"), activity("0xb")]);

    expect(
      screen.getByText(COPY.pegin.batchedDeposit.groupLabel),
    ).toBeInTheDocument();

    const cards = screen.getAllByTestId("deposit-card");
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.dataset.depositId)).toEqual(["0xa", "0xb"]);

    expect(
      screen.getByRole("button", { name: /broadcast pre-pegin/i }),
    ).toBeInTheDocument();
  });

  it("routes a hoisted broadcast click through a sibling that still needs broadcast", () => {
    // First sibling already broadcast, second still pending.
    mockGetActionStatus.mockImplementation((result: unknown) =>
      (result as { pending?: boolean }).pending
        ? BROADCAST_AVAILABLE
        : NO_ACTION,
    );
    mockGetPollingResult.mockImplementation((id: string) => ({
      pending: id === "0xb",
    }));

    const { onBroadcastClick } = renderGroup([
      activity("0xa"),
      activity("0xb"),
    ]);

    // A partly-broadcast batch stays grouped while any sibling is pending.
    expect(
      screen.getByText(COPY.pegin.batchedDeposit.groupLabel),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /broadcast pre-pegin/i }),
    );
    expect(onBroadcastClick).toHaveBeenCalledWith("0xb");
  });

  it("keeps the grouping wrapper after broadcast but drops the hoisted button", () => {
    // No sibling needs broadcast — the batch has no shared action left, but
    // the wrapper stays so sibling cards remain visually grouped.
    mockGetActionStatus.mockReturnValue(NO_ACTION);
    renderGroup([activity("0xa"), activity("0xb")]);

    expect(
      screen.getByText(COPY.pegin.batchedDeposit.groupLabel),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /broadcast pre-pegin/i }),
    ).not.toBeInTheDocument();

    expect(screen.getAllByTestId("deposit-card")).toHaveLength(2);
  });

  it("opens the batch multistepper when an owned group body is clicked", () => {
    mockGetActionStatus.mockReturnValue(NO_ACTION);
    const onGroupClick = vi.fn();
    render(
      <BatchedDepositGroup
        activities={[activity("0xa"), activity("0xb")]}
        vaultProviders={[]}
        onBroadcastClick={vi.fn()}
        onGroupClick={onGroupClick}
      />,
    );

    fireEvent.click(screen.getByText(COPY.pegin.batchedDeposit.groupLabel));
    // The handler receives the first sibling's id as the batch representative.
    expect(onGroupClick).toHaveBeenCalledWith("0xa");
  });

  it("is inert when the batch belongs to a different wallet", () => {
    // Ownership mismatch → getActionStatus returns `disabled` for the siblings.
    mockGetActionStatus.mockReturnValue({
      type: "disabled",
      tooltip: "Switch to the owning wallet",
    } satisfies ActionStatus);
    const onGroupClick = vi.fn();
    render(
      <BatchedDepositGroup
        activities={[activity("0xa"), activity("0xb")]}
        vaultProviders={[]}
        onBroadcastClick={vi.fn()}
        onGroupClick={onGroupClick}
      />,
    );

    fireEvent.click(screen.getByText(COPY.pegin.batchedDeposit.groupLabel));
    expect(onGroupClick).not.toHaveBeenCalled();
    // No button semantics on the wrapper, and no hoisted broadcast button
    // (an unowned sibling is `disabled`, never `available`).
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a total of all sibling amounts in the group header", () => {
    mockGetActionStatus.mockReturnValue(NO_ACTION);
    const a = activity("0xa");
    a.collateral = { amount: "0.6", symbol: "BTC" };
    const b = activity("0xb");
    b.collateral = { amount: "0.4", symbol: "BTC" };
    renderGroup([a, b]);

    // Total is sum of siblings — copy is rendered via the total-label fn so
    // we match it loosely rather than re-implement the format here.
    expect(screen.getByText(/total/i).textContent).toMatch(/1/);
  });
});
