import { DaemonStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { render } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "../../../models/peginStateMachine";
import type { VaultActivity } from "../../../types/activity";
import { TerminalPeginPollingError } from "../../../utils/peginPolling";
import { resetSharedDaemonTerminalTracking } from "../daemonTerminalEvents";
import { PeginPollingProvider } from "../PeginPollingContext";

// Mutable polling-query state read by the mock below, so each rerender can
// observe a different resolved poll. `polledIds` and `errors` are served as
// one snapshot, mirroring the real hook's PollingQueryData contract — the
// hook result carries no other id source, so the daemon-terminal effect can
// only classify from this snapshot (never from the provider's live
// `activities`, which the cases below keep disjoint from the polled ids by
// never marking the activity terminal).
const { pollingQueryState } = vi.hoisted(() => ({
  pollingQueryState: {
    polledIds: undefined as string[] | undefined,
    errors: undefined as Map<string, Error> | undefined,
  },
}));

vi.mock("../../../hooks/deposit/usePeginPollingQuery", () => ({
  usePeginPollingQuery: () => ({
    polledIds: pollingQueryState.polledIds,
    errors: pollingQueryState.errors,
    needsWotsKey: undefined,
    pendingIngestion: undefined,
    pendingDepositorSignatures: undefined,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

// The hooks below reach for react-query / chain reads / ProtocolParams. Stub
// them so the provider renders in isolation — this file only exercises the
// daemon-terminal effect. Mirrors the stubs in terminalMilestoneEmission.
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

// Long enough for shortId to shorten; distinct head/tail pin the redaction.
const VAULT_ID = `0x11${"ab".repeat(29)}2222` as Hex;
const BTC_PUBKEY = "ab".repeat(32);

function pendingActivity(): VaultActivity {
  return {
    id: VAULT_ID,
    collateral: { amount: "0.1", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    peginTxHash: VAULT_ID,
    contractStatus: ContractStatus.PENDING,
    isInUse: false,
    displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
    depositorBtcPubkey: BTC_PUBKEY,
    unsignedPrePeginTx: "0xdeadbeef",
    depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
    depositorWotsPkHash: "0xwotsh",
  };
}

function terminalErrors(status: DaemonStatus): Map<string, Error> {
  return new Map([
    [VAULT_ID, new TerminalPeginPollingError(status, "terminal")],
  ]);
}

const Tree = () => (
  <PeginPollingProvider
    activities={[pendingActivity()]}
    pendingPegins={[]}
    btcPublicKey={BTC_PUBKEY}
  >
    <div />
  </PeginPollingProvider>
);

describe("daemon terminal emission through the polling provider", () => {
  beforeEach(() => {
    mockEvent.mockClear();
    pollingQueryState.polledIds = undefined;
    pollingQueryState.errors = undefined;
    // The tracking store is app-scoped and outlives any provider, so it also
    // outlives a test case. Without this reset a later case starts with the
    // vault already seen and silently observes nothing.
    resetSharedDaemonTerminalTracking();
  });

  it("emits a warning with the shortened vaultId when a healthy vault turns terminal", () => {
    pollingQueryState.polledIds = [VAULT_ID];
    pollingQueryState.errors = new Map();
    const { rerender } = render(<Tree />);
    expect(mockEvent).not.toHaveBeenCalled();

    pollingQueryState.errors = terminalErrors(DaemonStatus.AML_REJECTED);
    rerender(<Tree />);

    expect(mockEvent).toHaveBeenCalledTimes(1);
    expect(mockEvent).toHaveBeenCalledWith("activation.daemon.terminal", {
      level: "warning",
      category: "activation",
      vaultId: "0x11...2222",
      daemonStatus: DaemonStatus.AML_REJECTED,
    });

    // The sticky terminal re-observed on the next poll — no re-emit, because
    // the shared store already holds the (vault, status) pair.
    pollingQueryState.errors = terminalErrors(DaemonStatus.AML_REJECTED);
    rerender(<Tree />);
    expect(mockEvent).toHaveBeenCalledTimes(1);
  });

  it("seeds a vault already terminal on its first resolved poll without emitting", () => {
    pollingQueryState.polledIds = [VAULT_ID];
    pollingQueryState.errors = terminalErrors(DaemonStatus.EXPIRED);
    const { rerender } = render(<Tree />);

    pollingQueryState.errors = terminalErrors(DaemonStatus.EXPIRED);
    rerender(<Tree />);
    expect(mockEvent).not.toHaveBeenCalled();

    // A real progression past the seeded status still emits.
    pollingQueryState.errors = terminalErrors(DaemonStatus.EXPIRED_CLEANED_UP);
    rerender(<Tree />);
    expect(mockEvent).toHaveBeenCalledTimes(1);
    expect(mockEvent).toHaveBeenCalledWith(
      "activation.daemon.terminal",
      expect.objectContaining({
        daemonStatus: DaemonStatus.EXPIRED_CLEANED_UP,
      }),
    );
  });

  it("observes nothing before the first poll resolves, then seeds from the resolved snapshot", () => {
    const { rerender } = render(<Tree />);
    expect(mockEvent).not.toHaveBeenCalled();

    // First RESOLVED observation arrives already terminal: seed, don't emit.
    pollingQueryState.polledIds = [VAULT_ID];
    pollingQueryState.errors = terminalErrors(DaemonStatus.INGESTION_REJECTED);
    rerender(<Tree />);
    expect(mockEvent).not.toHaveBeenCalled();
  });

  it("emits once when co-mounted providers observe the same transition", () => {
    const NestedTree = () => (
      <PeginPollingProvider
        activities={[pendingActivity()]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <PeginPollingProvider
          activities={[pendingActivity()]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
      </PeginPollingProvider>
    );

    pollingQueryState.polledIds = [VAULT_ID];
    pollingQueryState.errors = new Map();
    const { rerender } = render(<NestedTree />);

    pollingQueryState.errors = terminalErrors(DaemonStatus.AML_REJECTED);
    rerender(<NestedTree />);
    expect(mockEvent).toHaveBeenCalledTimes(1);
  });
});
