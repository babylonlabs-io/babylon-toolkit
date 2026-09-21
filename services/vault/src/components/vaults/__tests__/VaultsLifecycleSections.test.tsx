import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProtocolGateState } from "@/components/shared/protocolStatus";
import { VaultsLifecycleSections } from "@/components/vaults/VaultsLifecycleSections";
import { COPY } from "@/copy";
import type { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { useReclaimStatus, type ReclaimStatus } from "@/hooks/useReclaimStatus";
import { useReclaimVaultChainData } from "@/hooks/useReclaimVaultChainData";
import {
  ContractStatus,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
  type PeginState,
} from "@/models/peginStateMachine";
import type { RemovePendingPeginsResult } from "@/storage/peginStorage";
import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";
import { formatDurationShort } from "@/utils/formatting";

const mockUseDepositPollingResult = vi.hoisted(() =>
  vi.fn<(depositId: string) => DepositPollingResult | undefined>(
    () => undefined,
  ),
);
const wallet = vi.hoisted(() => ({ connected: true, open: vi.fn() }));
const UNBLOCKED_GATE: ProtocolGateState = { protocol: null, aave: null };
const gate = vi.hoisted(() => ({
  value: { protocol: null, aave: null } as ProtocolGateState,
}));

vi.mock("@babylonlabs-io/core-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/core-ui")>()),
  Hint: ({ tooltip, children }: { tooltip?: string; children?: ReactNode }) => (
    <span data-testid="row-hint">
      {tooltip}
      {children}
    </span>
  ),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  Network: { MAINNET: "mainnet", SIGNET: "signet" },
  useChainConnector: () => undefined,
  useBTCWallet: () => ({ connected: wallet.connected }),
  useWalletConnect: () => ({ connected: true, open: wallet.open }),
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: mockUseDepositPollingResult,
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  ProtocolParamsProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/hooks/deposit/useRefundRowAction", () => ({
  useRefundRowAction: () => ({ available: false, blockedTooltip: null }),
}));

// The reclaim row action runs for real: its wallet-needed decision is the
// behaviour under test. Only the Ledger check and the protocol gate are driven.
vi.mock("@/context/wallet/VaultWalletConnectionProvider", () => ({
  isLedgerVaultConnector: () => false,
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gate.value,
}));

vi.mock("@/hooks/useReclaimStatus", () => ({
  useReclaimStatus: vi.fn(() => ({ statusByDepositId: new Map() })),
}));

vi.mock("@/hooks/useReclaimVaultChainData", () => ({
  useReclaimVaultChainData: vi.fn(() => new Map()),
}));

vi.mock("@/components/simple/PendingDepositModals", () => ({
  PendingDepositModals: () => null,
}));

vi.mock("@/components/simple/PostDepositContinuationContent", () => ({
  PostDepositContinuationContent: () => null,
}));

const ACTIVITY_ID = "0xdeposit" as Hex;

const ACTIVITY: VaultActivity = {
  id: ACTIVITY_ID,
  collateral: { amount: "0.1", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  prePeginTxHash: "0xprepegin" as Hex,
  contractStatus: ContractStatus.PENDING,
  displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
  depositorBtcPubkey: "ab".repeat(32),
  unsignedPrePeginTx: "0xdeadbeef",
  depositorWotsPkHash: "0xwotshash",
};

const PROCESSING_STATE: PeginState = {
  contractStatus: ContractStatus.PENDING,
  displayLabel: PEGIN_DISPLAY_LABELS.PROCESSING,
  displayVariant: "pending",
  availableActions: [PeginAction.NONE],
  message: COPY.pegin.messages.payoutSignaturesSubmitted,
};

const FAILED_STATE: PeginState = {
  contractStatus: ContractStatus.PENDING,
  displayLabel: PEGIN_DISPLAY_LABELS.FAILED,
  displayVariant: "warning",
  availableActions: [PeginAction.NONE],
  message: "Vault provider rejected the deposit terms.",
};

const BROADCAST_STATE: PeginState = {
  contractStatus: ContractStatus.PENDING,
  displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
  displayVariant: "pending",
  availableActions: [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN],
  message: COPY.pegin.messages.broadcastMayHaveFailed,
};

function pollingResult(
  peginState: PeginState,
  overrides: Partial<DepositPollingResult> = {},
): DepositPollingResult {
  return {
    depositId: ACTIVITY_ID,
    loading: false,
    error: null,
    peginState,
    isOwnedByCurrentWallet: true,
    depositorBtcPubkey: ACTIVITY.depositorBtcPubkey,
    prePeginConfirmations: 0,
    requiredPrePeginDepth: 6,
    ...overrides,
  };
}

type DepositsOptions = Partial<ReturnType<typeof usePendingDeposits>> & {
  activities?: VaultActivity[];
};

function makeDeposits(
  options: DepositsOptions,
  removePendingPegins: (
    vaultIds: readonly string[],
  ) => RemovePendingPeginsResult,
) {
  const {
    activities = [ACTIVITY],
    indexedVaultIds = new Set<string>(),
    localRecordStatuses = new Map(
      activities.map((a) => [a.id.toLowerCase(), LocalStorageStatus.PENDING]),
    ),
    ...overrides
  } = options;

  return {
    pendingActivities: activities,
    expiredActivities: [],
    reclaimableCandidates: [],
    allActivities: activities,
    vaultProviders: [],
    btcAddress: "tb1depositor",
    btcConnected: true,
    ethAddress: "0x1111111111111111111111111111111111111111",
    hasPendingDeposits: true,
    hasExpiredDeposits: false,
    isLoading: false,
    error: null,
    refetchActivities: vi.fn(),
    broadcastModal: {
      broadcastingActivity: null,
      broadcastingBatchIds: [],
      isOpen: false,
      successOpen: false,
      successAmount: "",
      handleBroadcastClick: vi.fn(),
      handleClose: vi.fn(),
      handleSuccess: vi.fn(),
      handleSuccessClose: vi.fn(),
    },
    refundModal: {
      refundingActivity: null,
      handleRefundClick: vi.fn(),
      handleClose: vi.fn(),
      handleSuccess: vi.fn(),
    },
    reclaimModal: {
      reclaimingActivity: null,
      inFlightVaultIds: new Set<string>(),
      handleReclaimClick: vi.fn(),
      handleClose: vi.fn(),
      handleBroadcast: vi.fn(),
      handleSuccess: vi.fn(),
    },
    emergencyWithdrawModal: {
      withdrawing: null,
      handleWithdrawClick: vi.fn(),
      handleClose: vi.fn(),
      handleSuccess: vi.fn(),
    },
    removePendingPegins,
    indexedVaultIds,
    localRecordStatuses,
    demo: null,
    ...overrides,
  } satisfies ReturnType<typeof usePendingDeposits>;
}

function renderPendingRow(
  result: DepositPollingResult,
  options: DepositsOptions = {},
  removePendingPegins: (
    vaultIds: readonly string[],
  ) => RemovePendingPeginsResult = vi.fn(
    (): RemovePendingPeginsResult => "removed",
  ),
) {
  mockUseDepositPollingResult.mockReturnValue(result);
  const deposits = makeDeposits(options, removePendingPegins);
  const view = render(<VaultsLifecycleSections deposits={deposits} />);

  return {
    deposits,
    removePendingPegins,
    rerenderWith: (next: DepositsOptions) =>
      view.rerender(
        <VaultsLifecycleSections
          deposits={makeDeposits({ ...options, ...next }, removePendingPegins)}
        />,
      ),
    ...view,
  };
}

const estimateText = (minutes: number) =>
  COPY.vaults.pendingActivationEstimate(formatDurationShort(minutes));

const ANY_ESTIMATE = new RegExp(
  COPY.vaults
    .pendingActivationEstimate("")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
);

describe("VaultsLifecycleSections pending row", () => {
  it("keeps the failure reason in a hint on a FAILED row", () => {
    renderPendingRow(pollingResult(FAILED_STATE));

    const message = FAILED_STATE.message as string;
    expect(screen.getByTestId("row-hint")).toHaveTextContent(message);
    expect(screen.getAllByText(message)).toHaveLength(1);
  });

  it("shows no hint beside the pending chip", () => {
    renderPendingRow(pollingResult(PROCESSING_STATE));

    expect(screen.queryByTestId("row-hint")).not.toBeInTheDocument();
  });

  it("estimates the wait while the deposit is machine-paced", () => {
    renderPendingRow(pollingResult(PROCESSING_STATE));

    expect(screen.getByText(estimateText(70))).toBeInTheDocument();
  });

  it("shows no estimate while the deposit waits on the user", () => {
    renderPendingRow(pollingResult(BROADCAST_STATE));

    expect(
      screen.getByTestId("pending-deposit-resume-cta"),
    ).toBeInTheDocument();
    expect(screen.queryByText(ANY_ESTIMATE)).not.toBeInTheDocument();
  });

  it("keeps the state message in the sub-line on a user-paced row", () => {
    renderPendingRow(pollingResult(BROADCAST_STATE));

    expect(
      screen.getByText(COPY.pegin.messages.broadcastMayHaveFailed),
    ).toBeInTheDocument();
    expect(screen.queryByText(ANY_ESTIMATE)).not.toBeInTheDocument();
  });

  it("shows no estimate on a user-paced row owned by another wallet", () => {
    renderPendingRow(
      pollingResult(BROADCAST_STATE, { isOwnedByCurrentWallet: false }),
    );

    expect(
      screen.queryByTestId("pending-deposit-resume-cta"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("row-hint")).toBeInTheDocument();
    expect(screen.queryByText(ANY_ESTIMATE)).not.toBeInTheDocument();
  });

  it("shows no estimate before the first confirmation poll lands", () => {
    renderPendingRow(
      pollingResult(PROCESSING_STATE, { prePeginConfirmations: null }),
    );

    expect(screen.queryByText(ANY_ESTIMATE)).not.toBeInTheDocument();
  });
});

const LOCAL_ONLY: VaultActivity = {
  ...ACTIVITY,
  id: "0xlocalonly" as Hex,
  unsignedPrePeginTx: "0xlocalonlytx",
  isPending: true,
};

const INDEXED_MIXED_CASE: VaultActivity = {
  ...ACTIVITY,
  id: "0xABCDEF" as Hex,
  unsignedPrePeginTx: "0xindexedtx",
  isPending: true,
};

const BATCH_A: VaultActivity = {
  ...ACTIVITY,
  id: "0xbatcha" as Hex,
  unsignedPrePeginTx: "0xsharedbatchtx",
  isPending: true,
};

const BATCH_B: VaultActivity = {
  ...ACTIVITY,
  id: "0xbatchb" as Hex,
  unsignedPrePeginTx: "0xsharedbatchtx",
  isPending: true,
};

const dismissIn = (rowIndex: number) =>
  within(screen.getAllByTestId("pending-deposit-row")[rowIndex]).queryByTestId(
    "pending-deposit-dismiss-button",
  );

describe("VaultsLifecycleSections dismiss control", () => {
  it("offers the control only on the deposit the indexer did not return", () => {
    renderPendingRow(pollingResult(BROADCAST_STATE), {
      activities: [LOCAL_ONLY, INDEXED_MIXED_CASE],
      indexedVaultIds: new Set([INDEXED_MIXED_CASE.id.toLowerCase()]),
    });

    expect(dismissIn(0)).toBeInTheDocument();
    expect(dismissIn(1)).not.toBeInTheDocument();
  });

  it("offers the control only once the indexer has answered successfully", () => {
    const { rerenderWith } = renderPendingRow(pollingResult(BROADCAST_STATE), {
      activities: [LOCAL_ONLY],
      indexedVaultIds: null,
    });

    expect(dismissIn(0)).not.toBeInTheDocument();

    rerenderWith({ indexedVaultIds: new Set<string>() });

    expect(dismissIn(0)).toBeInTheDocument();
  });

  it("offers the control only while the stored record still reads PENDING", () => {
    const { rerenderWith } = renderPendingRow(pollingResult(BROADCAST_STATE), {
      activities: [LOCAL_ONLY],
      localRecordStatuses: new Map([
        [LOCAL_ONLY.id.toLowerCase(), LocalStorageStatus.CONFIRMING],
      ]),
    });

    expect(dismissIn(0)).not.toBeInTheDocument();

    rerenderWith({
      localRecordStatuses: new Map([
        [LOCAL_ONLY.id.toLowerCase(), LocalStorageStatus.PENDING],
      ]),
    });

    expect(dismissIn(0)).toBeInTheDocument();
  });

  it("states what the discard costs before removing anything", () => {
    const { removePendingPegins } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [LOCAL_ONLY] },
    );

    fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));

    expect(
      screen.getByText(COPY.vaults.dismissPending.warning),
    ).toBeInTheDocument();
    expect(removePendingPegins).not.toHaveBeenCalled();
  });

  it("removes the stored deposit once the discard is confirmed", () => {
    const { removePendingPegins } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [LOCAL_ONLY] },
    );

    fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    );

    expect(removePendingPegins).toHaveBeenCalledWith(
      [LOCAL_ONLY.id],
      LocalStorageStatus.PENDING,
    );
    // core-ui keeps a closed dialog mounted until its exit animation ends, and
    // jsdom never fires that event on its own.
    fireEvent.animationEnd(screen.getByTestId("dialog"));
    expect(
      screen.queryByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    ).not.toBeInTheDocument();
  });

  it("closes the confirmation without a write when the record is already gone", () => {
    const { removePendingPegins, rerenderWith } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [LOCAL_ONLY] },
    );

    fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));
    rerenderWith({ activities: [] });
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    );

    expect(removePendingPegins).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    ).not.toBeInTheDocument();
  });

  it("says why it removed nothing when the record stops reading PENDING before confirmation", () => {
    const { removePendingPegins, rerenderWith } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [LOCAL_ONLY] },
    );

    fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));
    rerenderWith({
      localRecordStatuses: new Map([
        [LOCAL_ONLY.id.toLowerCase(), LocalStorageStatus.CONFIRMING],
      ]),
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    );

    expect(removePendingPegins).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      COPY.vaults.dismissPending.noLongerRemovable,
    );
  });

  it("keeps the stored deposit when the discard is cancelled", () => {
    const { removePendingPegins } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [LOCAL_ONLY] },
    );

    fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.dismissPending.cancelButton,
      }),
    );

    expect(removePendingPegins).not.toHaveBeenCalled();
  });

  it("says why it removed nothing when the indexer returns the deposit before confirmation", () => {
    const { removePendingPegins, rerenderWith } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [LOCAL_ONLY] },
    );

    fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));
    rerenderWith({ indexedVaultIds: new Set([LOCAL_ONLY.id.toLowerCase()]) });
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    );

    expect(removePendingPegins).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      COPY.vaults.dismissPending.noLongerRemovable,
    );
  });

  it("says the status is unverified when the indexer stops answering before confirmation", () => {
    const { removePendingPegins, rerenderWith } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [LOCAL_ONLY] },
    );

    fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));
    // The indexer query started failing while the dialog was open, so the id
    // set is withheld — absence is no longer evidence of anything.
    rerenderWith({ indexedVaultIds: null });
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    );

    expect(removePendingPegins).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      COPY.vaults.dismissPending.unavailable,
    );
  });

  it("withholds the control while a batch sibling is still indexed", () => {
    renderPendingRow(pollingResult(BROADCAST_STATE), {
      activities: [BATCH_A, BATCH_B],
      indexedVaultIds: new Set([BATCH_B.id.toLowerCase()]),
    });

    expect(dismissIn(0)).not.toBeInTheDocument();
    expect(dismissIn(1)).not.toBeInTheDocument();
  });

  it("removes every record of a split deposit in one write", () => {
    const { removePendingPegins } = renderPendingRow(
      pollingResult(BROADCAST_STATE),
      { activities: [BATCH_A, BATCH_B] },
    );

    fireEvent.click(dismissIn(0) as HTMLElement);
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.dismissPending.confirmButton,
      }),
    );

    expect(removePendingPegins).toHaveBeenCalledTimes(1);
    expect(removePendingPegins).toHaveBeenCalledWith(
      [BATCH_A.id, BATCH_B.id],
      LocalStorageStatus.PENDING,
    );
  });

  it("says how many deposits the confirmation would remove", () => {
    renderPendingRow(pollingResult(BROADCAST_STATE), {
      activities: [BATCH_A, BATCH_B],
    });

    fireEvent.click(dismissIn(0) as HTMLElement);

    expect(
      screen.getByText(COPY.vaults.dismissPending.batchWarning(2)),
    ).toBeInTheDocument();
  });

  it.each([
    ["write-failed", COPY.vaults.dismissPending.writeFailed],
    ["unreadable", COPY.vaults.dismissPending.unreadable],
    ["changed", COPY.vaults.dismissPending.noLongerRemovable],
  ] as const)(
    "reports a %s removal and keeps the confirmation open",
    (result, message) => {
      renderPendingRow(
        pollingResult(BROADCAST_STATE),
        { activities: [LOCAL_ONLY] },
        vi.fn((): RemovePendingPeginsResult => result),
      );

      fireEvent.click(screen.getByTestId("pending-deposit-dismiss-button"));
      fireEvent.click(
        screen.getByRole("button", {
          name: COPY.vaults.dismissPending.confirmButton,
        }),
      );

      expect(
        screen.getByTestId("pending-deposit-dismiss-error"),
      ).toHaveTextContent(message);
      expect(
        screen.getByRole("button", {
          name: COPY.vaults.dismissPending.confirmButton,
        }),
      ).toBeInTheDocument();
    },
  );
});

describe("VaultsLifecycleSections reclaim connection", () => {
  let status: ReclaimStatus;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    wallet.connected = false;
    wallet.open.mockClear();
    // Use the settled payout heights from reclaimEligibility.test.ts.
    status = {
      payoutSpend: { spent: true, confirmed: true, blockHeight: 899_995 },
      reserveSpend: { spent: false, confirmed: false },
      reserveValueSats: 33_000n,
      observedTipHeight: 900_000,
    };
    vi.mocked(useReclaimStatus).mockReturnValue({
      statusByDepositId: new Map([[ACTIVITY_ID, status]]),
    });
    vi.mocked(useReclaimVaultChainData).mockReturnValue(
      new Map([
        [
          ACTIVITY_ID,
          {
            peginTxid: ACTIVITY.prePeginTxHash!,
            onChainStatus: OnChainBtcVaultStatus.REDEEMED,
          },
        ],
      ]),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    wallet.connected = true;
    gate.value = UNBLOCKED_GATE;
    vi.mocked(useReclaimStatus).mockReturnValue({
      statusByDepositId: new Map(),
    });
    vi.mocked(useReclaimVaultChainData).mockReturnValue(new Map());
  });

  function renderReclaim() {
    return renderPendingRow(pollingResult(PROCESSING_STATE), {
      pendingActivities: [],
      reclaimableCandidates: [ACTIVITY],
    });
  }

  it("opens only the Bitcoin connection dialog and waits for ownership before reclaim", () => {
    const { deposits, rerender } = renderReclaim();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.wallet.btcAction.connect }),
    );
    expect(wallet.open).toHaveBeenCalledWith("BTC");
    expect(deposits.reclaimModal.handleReclaimClick).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("vault-reclaim-button"),
    ).not.toBeInTheDocument();
    wallet.connected = true;
    rerender(<VaultsLifecycleSections deposits={deposits} />);
    expect(
      screen.queryByRole("button", { name: COPY.wallet.btcAction.connect }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vault-reclaim-button"),
    ).not.toBeInTheDocument();
    expect(deposits.reclaimModal.handleReclaimClick).not.toHaveBeenCalled();
  });

  it("shows the disabled reclaim with its reason, not a connection, while withdraw is paused", () => {
    gate.value = { protocol: "paused", aave: null };
    renderReclaim();
    expect(
      screen.queryByRole("button", { name: COPY.wallet.btcAction.connect }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.reclaim.rowButton }),
    ).toBeDisabled();
    expect(
      screen.getByText(COPY.reclaim.blocked.protocolPaused),
    ).toBeInTheDocument();
  });

  it.each(["disabled", "unsettled", "spent", "missing", "in-flight"])(
    "does not offer connection for a %s reclaim",
    (condition) => {
      if (condition === "disabled")
        vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "false");
      if (condition === "unsettled") status.payoutSpend.confirmed = false;
      if (condition === "spent") status.reserveSpend.spent = true;
      if (condition === "missing")
        vi.mocked(useReclaimVaultChainData).mockReturnValue(new Map());
      const { deposits, rerender } = renderReclaim();
      if (condition === "in-flight") {
        deposits.reclaimModal.inFlightVaultIds = new Set([ACTIVITY_ID]);
        rerender(<VaultsLifecycleSections deposits={deposits} />);
      }
      expect(
        screen.queryByRole("button", { name: COPY.wallet.btcAction.connect }),
      ).not.toBeInTheDocument();
      expect(deposits.reclaimModal.handleReclaimClick).not.toHaveBeenCalled();
    },
  );
});
