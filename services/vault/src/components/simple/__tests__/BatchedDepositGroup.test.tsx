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
  PendingDepositCard: ({
    depositId,
    suppressBroadcastAction,
  }: {
    depositId: string;
    suppressBroadcastAction?: boolean;
  }) => (
    <div
      data-testid="deposit-card"
      data-deposit-id={depositId}
      data-suppressed={String(!!suppressBroadcastAction)}
    />
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
      onSignClick={vi.fn()}
      onBroadcastClick={onBroadcastClick}
      onWotsKeyClick={vi.fn()}
      onActivationClick={vi.fn()}
      onRefundClick={vi.fn()}
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
    expect(cards.every((c) => c.dataset.suppressed === "true")).toBe(true);

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

  it("dissolves into standalone cards once the broadcast is done", () => {
    // No sibling needs broadcast — the batch has no shared action left, so
    // the grouping chrome and hoisted button are dropped.
    mockGetActionStatus.mockReturnValue(NO_ACTION);
    renderGroup([activity("0xa"), activity("0xb")]);

    expect(
      screen.queryByText(COPY.pegin.batchedDeposit.groupLabel),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /broadcast pre-pegin/i }),
    ).not.toBeInTheDocument();

    const cards = screen.getAllByTestId("deposit-card");
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.dataset.suppressed === "false")).toBe(true);
  });
});
