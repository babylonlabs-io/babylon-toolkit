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
    errors: undefined,
    needsWotsKey: undefined,
    pendingIngestion: undefined,
    pendingDepositorSignatures: undefined,
    isLoading: false,
    refetch: vi.fn(),
    depositsToPoll: [],
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

vi.mock("../../../hooks/useActivationDeadlineGate", () => ({
  useActivationDeadlineGate: () => new Set<string>(),
}));

vi.mock("../../ProtocolParamsContext", () => ({
  useProtocolParamsContext: () => ({
    config: { offchainParams: { minPrepeginDepth: 6 } },
    getOffchainParamsByVersion: () => undefined,
  }),
}));

const { mockEvent } = vi.hoisted(() => ({ mockEvent: vi.fn() }));
vi.mock("@/infrastructure", () => ({
  logger: { event: mockEvent, error: vi.fn(), warn: vi.fn(), info: vi.fn() },
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
    // The tracking store is app-scoped and outlives any provider, so it also
    // outlives a test case. Without this reset a later case starts with the
    // vault already seen and silently observes nothing.
    resetSharedTerminalMilestoneTracking();
  });

  it("emits each terminal once when the continuation modal nests a second provider over the same vault", () => {
    const Tree = ({ status }: { status: ContractStatus }) => (
      <PeginPollingProvider
        activities={[activityAt(status)]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <PeginPollingProvider
          activities={[activityAt(status)]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
      </PeginPollingProvider>
    );

    const { rerender } = render(<Tree status={ContractStatus.PENDING} />);
    rerender(<Tree status={ContractStatus.VERIFIED} />);
    rerender(<Tree status={ContractStatus.ACTIVE} />);

    expect(emittedEventNames()).toEqual([
      "activation.verified",
      "deposit.completed",
    ]);
  });

  it("emits each terminal once when the dashboard and root-layout providers are siblings over the same vault", () => {
    const Tree = ({ status }: { status: ContractStatus }) => (
      <>
        <PeginPollingProvider
          activities={[activityAt(status)]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
        <PeginPollingProvider
          activities={[activityAt(status)]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
      </>
    );

    const { rerender } = render(<Tree status={ContractStatus.PENDING} />);
    rerender(<Tree status={ContractStatus.VERIFIED} />);
    rerender(<Tree status={ContractStatus.ACTIVE} />);

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
});
