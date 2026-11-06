import { render } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "../../../models/peginStateMachine";
import type { VaultActivity } from "../../../types/activity";
import { PeginPollingProvider } from "../PeginPollingContext";
import { resetSharedTerminalMilestoneTracking } from "../terminalMilestones";

vi.mock("../../../hooks/deposit/usePeginPollingQuery", () => ({
  usePeginPollingQuery: () => ({
    polledIds: undefined,
    errors: undefined,
    needsWotsKey: undefined,
    pendingIngestion: undefined,
    pendingDepositorSignatures: undefined,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

// The hooks below reach for react-query / chain reads / ProtocolParams. Stub
// them so the provider renders in isolation — this file only exercises the
// milestone effect. Mirrors the stubs in PeginPollingContext.test.tsx.
vi.mock("../../../hooks/useBtcMempoolConfirmations", () => ({
  useBtcMempoolConfirmations: () => ({ confirmationsByTxid: new Map() }),
}));

vi.mock("../../../hooks/useBtcHtlcRefundStatus", () => ({
  useBtcHtlcRefundStatus: () => ({ refundByDepositId: new Map() }),
}));

vi.mock("../../../hooks/useClaimExpiredWindowGate", () => ({
  useClaimExpiredWindowGate: () => new Map(),
}));

// Floor gate issues chain reads for VERIFIED vaults; stub it so the provider
// renders without a QueryClient.
vi.mock("../../../hooks/useActivationFloorGate", () => ({
  useActivationFloorGate: () => new Map<string, number | null>(),
}));

// The provider reads params through the non-blocking hook, not the blocking
// context — stub it so the provider renders in isolation.
vi.mock("../../../hooks/deposit/usePeginPollingProtocolParams", () => ({
  usePeginPollingProtocolParams: () => ({
    ready: true,
    error: null,
    resolveRequiredPrePeginDepth: () => 6,
    resolveRefundTimelock: () => undefined,
  }),
}));

const { mockEvent } = vi.hoisted(() => ({ mockEvent: vi.fn() }));
vi.mock("@/infrastructure", () => ({
  logger: { event: mockEvent, error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }));
vi.mock("@/infrastructure/analytics", async () => ({
  ANALYTICS_EVENT: (await import("@/infrastructure/analytics/analyticsEvents"))
    .ANALYTICS_EVENT,
  trackEvent: mockTrackEvent,
}));

const ACTIVITY_ID = "0xpegin" as Hex;
const BTC_PUBKEY = "ab".repeat(32);

function activityAt(contractStatus: ContractStatus): VaultActivity {
  return {
    id: ACTIVITY_ID,
    collateral: { amount: "0.1", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    peginTxHash: ACTIVITY_ID,
    contractStatus,
    isInUse: false,
    displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
    depositorBtcPubkey: BTC_PUBKEY,
    unsignedPrePeginTx: "0xdeadbeef",
    depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
    depositorWotsPkHash: "0xwotsh",
  };
}

function emittedEventNames(): string[] {
  return mockEvent.mock.calls.map((call) => call[0] as string);
}

describe("terminal milestone emission across co-mounted providers", () => {
  beforeEach(() => {
    mockEvent.mockClear();
    mockTrackEvent.mockClear();
    // The tracking store is app-scoped and outlives any provider, so it also
    // outlives a test case. Without this reset a later case starts with the
    // vault already seen and silently observes nothing.
    resetSharedTerminalMilestoneTracking();
  });

  it("emits each terminal once across a provider remount", () => {
    // Tracking is module-scoped rather than provider state because the single
    // provider still unmounts — RootLayout swaps the whole content subtree for
    // the geo-block branch, and wallet churn remounts it. Provider-local
    // tracking would re-seed on remount and silently swallow the next terminal.
    const Tree = ({ status }: { status: ContractStatus }) => (
      <PeginPollingProvider
        activities={[activityAt(status)]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>
    );

    const first = render(<Tree status={ContractStatus.PENDING} />);
    first.rerender(<Tree status={ContractStatus.VERIFIED} />);
    first.unmount();

    const second = render(<Tree status={ContractStatus.VERIFIED} />);
    second.rerender(<Tree status={ContractStatus.ACTIVE} />);

    expect(emittedEventNames()).toEqual([
      "activation.verified",
      "deposit.completed",
    ]);
  });

  it("emits nothing for a vault already ACTIVE on its first observation", () => {
    render(
      <PeginPollingProvider
        activities={[activityAt(ContractStatus.ACTIVE)]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>,
    );

    expect(emittedEventNames()).toEqual([]);
  });

  it("sends deposit_completed for an activated vault", () => {
    const Tree = ({ status }: { status: ContractStatus }) => (
      <PeginPollingProvider
        activities={[activityAt(status)]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>
    );

    const view = render(<Tree status={ContractStatus.VERIFIED} />);
    view.rerender(<Tree status={ContractStatus.ACTIVE} />);

    expect(mockTrackEvent).toHaveBeenCalledWith("deposit_completed", {
      vault_id: ACTIVITY_ID,
    });
  });

  it("sends no deposit_completed for a vault returned at activation", () => {
    const Tree = ({ status }: { status: ContractStatus }) => (
      <PeginPollingProvider
        activities={[activityAt(status)]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>
    );

    const view = render(<Tree status={ContractStatus.VERIFIED} />);
    view.rerender(<Tree status={ContractStatus.REDEEMED} />);

    expect(emittedEventNames()).toContain("deposit.completed");
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("sends no deposit_completed for a returned vault first seen after its payout landed", () => {
    const Tree = ({ status }: { status: ContractStatus }) => (
      <PeginPollingProvider
        activities={[activityAt(status)]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>
    );

    const view = render(<Tree status={ContractStatus.VERIFIED} />);
    view.rerender(<Tree status={ContractStatus.DEPOSITOR_WITHDRAWN} />);

    expect(emittedEventNames()).toContain("deposit.completed");
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("sends deposit_completed for a vault first seen liquidated", () => {
    const Tree = ({ status }: { status: ContractStatus }) => (
      <PeginPollingProvider
        activities={[activityAt(status)]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>
    );

    const view = render(<Tree status={ContractStatus.VERIFIED} />);
    view.rerender(<Tree status={ContractStatus.LIQUIDATED} />);

    expect(mockTrackEvent).toHaveBeenCalledWith("deposit_completed", {
      vault_id: ACTIVITY_ID,
    });
  });
});
