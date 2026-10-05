/**
 * ActivityListWithRefund — when the feed mounts the recovery modals, and which
 * rows it hands the feed. The modal and list contents are stubbed: these tests
 * are about the wrapper's own decisions.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pendingDepositsMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePendingDeposits", () => ({
  usePendingDeposits: pendingDepositsMock,
}));
vi.mock("@/hooks/usePrices", () => ({ usePrices: () => ({ prices: {} }) }));
vi.mock("@/context/ProtocolParamsContext", () => ({
  ProtocolParamsProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/simple/PendingDepositModals", () => ({
  PendingDepositModals: () => <div data-testid="recovery-modals" />,
}));
// Polling results by vault id; the real action-status logic reads them.
const pollingResults = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({
    getPollingResult: (id: string) => pollingResults.get(id),
  }),
}));

const activityListProps = vi.hoisted(() => vi.fn());
vi.mock("../ActivityList", () => ({
  ActivityList: (props: unknown) => {
    activityListProps(props);
    return <div>Activity feed</div>;
  },
}));

import { PeginAction } from "@/models/peginStateMachine";
import type { ActivityLog, ActivityRow } from "@/types/activityLog";

import { ActivityListWithRefund } from "../ActivityListWithRefund";

const EXPIRED_VAULT = { id: `0x${"11".repeat(32)}` };

function deposits(overrides: {
  expiredActivities: unknown[];
  claimingActivity: unknown;
}) {
  return {
    expiredActivities: overrides.expiredActivities,
    ethAddress: "0x1234",
    broadcastModal: {},
    refundModal: { handleRefundClick: vi.fn() },
    reclaimModal: {},
    emergencyWithdrawModal: {},
    claimExpiredModal: {
      claimingActivity: overrides.claimingActivity,
      handleClaimClick: vi.fn(),
    },
  };
}

describe("ActivityListWithRefund", () => {
  beforeEach(() => {
    pendingDepositsMock.mockReset();
    activityListProps.mockReset();
  });

  it("keeps an open redeem modal mounted after its vault leaves the expired list", () => {
    pendingDepositsMock.mockReturnValue(
      deposits({
        expiredActivities: [EXPIRED_VAULT],
        claimingActivity: EXPIRED_VAULT,
      }),
    );
    const { rerender } = render(
      <ActivityListWithRefund activities={[]} isConnected />,
    );
    expect(screen.getByTestId("recovery-modals")).toBeInTheDocument();

    // The redeem confirmed and the indexer reports the vault Redeemed.
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [], claimingActivity: EXPIRED_VAULT }),
    );
    rerender(<ActivityListWithRefund activities={[]} isConnected />);

    expect(screen.getByTestId("recovery-modals")).toBeInTheDocument();
  });

  it("renders the feed bare when there is nothing to recover and no modal open", () => {
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [], claimingActivity: null }),
    );
    render(<ActivityListWithRefund activities={[]} isConnected />);

    expect(screen.getByText("Activity feed")).toBeInTheDocument();
    expect(screen.queryByTestId("recovery-modals")).not.toBeInTheDocument();
  });
});

describe("ActivityListWithRefund feed rows for expired deposits", () => {
  const PRE_PEGIN_TX = `0x${"ab".repeat(32)}`;
  const OLDER = Date.parse("2026-10-01T12:00:00Z");
  const NEWER = Date.parse("2026-10-03T12:00:00Z");

  const expiredVault = (id: string, timestamp: number) => ({
    id,
    collateral: { amount: "0.5", symbol: "BTC" },
    prePeginTxHash: PRE_PEGIN_TX,
    timestamp,
  });

  const feedRow = (vaultId: string, date: number): ActivityLog => ({
    kind: "row",
    id: `event-${vaultId}`,
    vaultId,
    date: new Date(date),
    type: "Deposit",
    tokenIcon: "btc.svg",
    amount: { value: "1", symbol: "BTC", numeric: 1 },
    chain: "BTC",
    transactionHash: "",
    isPending: true,
  });

  // An expired deposit whose state machine offers `action` — owned by the
  // connected BTC wallet unless `ownedByAnotherKey` is set.
  function pollWith(
    vaultId: string,
    action: PeginAction,
    { ownedByAnotherKey = false } = {},
  ) {
    pollingResults.set(vaultId, {
      depositId: vaultId,
      loading: false,
      error: null,
      isOwnedByCurrentWallet: !ownedByAnotherKey,
      depositorBtcPubkey: ownedByAnotherKey ? "ab".repeat(32) : undefined,
      peginState: { availableActions: [action] },
    });
  }

  function renderedRows(): ActivityRow[] {
    const props = activityListProps.mock.calls.at(-1)?.[0] as {
      activities: ActivityRow[];
    };
    return props.activities;
  }

  beforeEach(() => {
    pendingDepositsMock.mockReset();
    activityListProps.mockReset();
    pollingResults.clear();
  });

  it("adds a Deposit row, keyed by vault id, for an expired deposit the feed does not show", () => {
    const vault = expiredVault(`0x${"22".repeat(32)}`, NEWER);
    pollWith(vault.id, PeginAction.CLAIM_EXPIRED_VAULT);
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [vault], claimingActivity: null }),
    );

    render(<ActivityListWithRefund activities={[]} isConnected />);

    expect(renderedRows()).toEqual([
      expect.objectContaining({
        kind: "row",
        vaultId: vault.id,
        type: "Deposit",
        amount: { value: "0.5", symbol: "BTC", numeric: 0.5 },
        chain: "BTC",
        transactionHash: PRE_PEGIN_TX,
        date: new Date(NEWER),
      }),
    ]);
  });

  it("does not duplicate an expired deposit the feed already shows, and clears its pending spinner", () => {
    const vaultId = `0x${"33".repeat(32)}`;
    pollWith(vaultId, PeginAction.REFUND_HTLC);
    pendingDepositsMock.mockReturnValue(
      deposits({
        expiredActivities: [expiredVault(vaultId, NEWER)],
        claimingActivity: null,
      }),
    );

    render(
      <ActivityListWithRefund
        activities={[feedRow(vaultId, NEWER)]}
        isConnected
      />,
    );

    const rows = renderedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: `event-${vaultId}`, isPending: false });
  });

  it("keeps the feed newest-first when it adds a row", () => {
    const olderFeedVault = `0x${"44".repeat(32)}`;
    const newerExpired = expiredVault(`0x${"55".repeat(32)}`, NEWER);
    pollWith(newerExpired.id, PeginAction.REFUND_HTLC);
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [newerExpired], claimingActivity: null }),
    );

    render(
      <ActivityListWithRefund
        activities={[feedRow(olderFeedVault, OLDER)]}
        isConnected
      />,
    );

    expect(
      renderedRows().map((row) => (row.kind === "row" ? row.vaultId : null)),
    ).toEqual([newerExpired.id, olderFeedVault]);
  });

  it("adds no row for an expired deposit with nothing to offer, such as a settled refund", () => {
    const refunded = expiredVault(`0x${"66".repeat(32)}`, NEWER);
    pollWith(refunded.id, PeginAction.NONE);
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [refunded], claimingActivity: null }),
    );

    render(<ActivityListWithRefund activities={[]} isConnected />);

    expect(renderedRows()).toEqual([]);
  });

  it("adds no row for a redeem the connected BTC wallet cannot take, which would show no control", () => {
    const vault = expiredVault(`0x${"88".repeat(32)}`, NEWER);
    pollWith(vault.id, PeginAction.CLAIM_EXPIRED_VAULT, {
      ownedByAnotherKey: true,
    });
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [vault], claimingActivity: null }),
    );

    render(<ActivityListWithRefund activities={[]} isConnected />);

    expect(renderedRows()).toEqual([]);
  });

  it("adds a row for a refund another BTC key owns, which shows a blocked control", () => {
    const vault = expiredVault(`0x${"99".repeat(32)}`, NEWER);
    pollWith(vault.id, PeginAction.REFUND_HTLC, { ownedByAnotherKey: true });
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [vault], claimingActivity: null }),
    );

    render(<ActivityListWithRefund activities={[]} isConnected />);

    expect(renderedRows()).toEqual([
      expect.objectContaining({ vaultId: vault.id }),
    ]);
  });

  it("adds no rows while the session is not connected", () => {
    const vault = expiredVault(`0x${"77".repeat(32)}`, NEWER);
    pollWith(vault.id, PeginAction.CLAIM_EXPIRED_VAULT);
    pendingDepositsMock.mockReturnValue(
      deposits({ expiredActivities: [vault], claimingActivity: null }),
    );

    render(<ActivityListWithRefund activities={[]} isConnected={false} />);

    expect(renderedRows()).toEqual([]);
  });
});
