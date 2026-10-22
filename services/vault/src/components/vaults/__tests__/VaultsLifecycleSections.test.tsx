import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProtocolGateState } from "@/components/shared/protocolStatus";
import { VaultsLifecycleSections } from "@/components/vaults/VaultsLifecycleSections";
import { COPY } from "@/copy";
import { useActivationRedeemReasons } from "@/hooks/useActivationRedeemReasons";
import type { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { useReclaimStatus, type ReclaimStatus } from "@/hooks/useReclaimStatus";
import { useReclaimVaultChainData } from "@/hooks/useReclaimVaultChainData";
import { useRedeemClaimTxids } from "@/hooks/useRedeemClaimTxids";
import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
  type PeginState,
} from "@/models/peginStateMachine";
import type { ActivationRedeemReason } from "@/services/vault/activationRedeemReason";
import {
  getSignedGraphFingerprint,
  type RemovePendingPeginsResult,
} from "@/storage/peginStorage";
import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";
import { truncateHash } from "@/utils/addressUtils";
import { saveArtifactDownloadReceipt } from "@/utils/artifactDownloadStorage";
import { formatDurationShort } from "@/utils/formatting";

/** A redeemed vault's payout destination, as the indexer and the row show it. */
const { PAYOUT_SCRIPT_PUBKEY, PAYOUT_ADDRESS } = vi.hoisted(() => ({
  PAYOUT_SCRIPT_PUBKEY: `0x5120${"ab".repeat(32)}`,
  PAYOUT_ADDRESS: `tb1p${"q".repeat(58)}`,
}));

const mockUseDepositPollingResult = vi.hoisted(() =>
  vi.fn<(depositId: string) => DepositPollingResult | undefined>(
    () => undefined,
  ),
);
const wallet = vi.hoisted(() => ({
  connected: true,
  publicKeyNoCoord: undefined as string | undefined,
  open: vi.fn(),
}));
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
  useWidgetState: () => ({ visible: false }),
  Network: { MAINNET: "mainnet", SIGNET: "signet" },
  useChainConnector: () => undefined,
  useBTCWallet: () => ({
    connected: wallet.connected,
    publicKeyNoCoord: wallet.publicKeyNoCoord,
  }),
  useWalletConnect: () => ({ connected: true, open: wallet.open }),
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: mockUseDepositPollingResult,
  usePeginPolling: () => ({ getPollingResult: mockUseDepositPollingResult }),
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  ProtocolParamsProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

// The reclaim row action runs for real: its wallet-needed decision is the
// behaviour under test. Only the Ledger check and the protocol gate are driven.
vi.mock("@/context/wallet/ledgerVaultConnector", () => ({
  isLedgerVaultConnector: () => false,
}));
// Reached through the `@/context/wallet` barrel. The real module reads
// APPKIT_BTC_CONNECTOR_ID at module scope, which the wallet-connector mock
// does not carry, and nothing here renders the provider.
vi.mock("@/context/wallet/VaultWalletConnectionProvider", () => ({}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gate.value,
}));

vi.mock("@/hooks/useReclaimStatus", () => ({
  useReclaimStatus: vi.fn(() => ({ statusByDepositId: new Map() })),
}));

vi.mock("@/hooks/useReclaimVaultChainData", () => ({
  useReclaimVaultChainData: vi.fn(() => new Map()),
}));

// The claim-link query needs a QueryClient the sections never mount; what it
// resolves is driven per test.
vi.mock("@/hooks/useRedeemClaimTxids", () => ({
  useRedeemClaimTxids: vi.fn(() => new Map<string, string>()),
}));

// Same reason as the claim links: the redeem-reason queries need a QueryClient.
vi.mock("@/hooks/useActivationRedeemReasons", () => ({
  useActivationRedeemReasons: vi.fn(
    () => new Map<string, ActivationRedeemReason>(),
  ),
}));

// No presign fingerprint by default, so no row offers a download unless a
// test opts in.
vi.mock("@/storage/peginStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/storage/peginStorage")>()),
  getSignedGraphFingerprint: vi.fn(() => ({ status: "no-entry" })),
}));

// The decode itself is covered in utils/btc; here only the row's use of it.
vi.mock("@/utils/btc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/btc")>()),
  scriptPubKeyHexToBtcAddress: (scriptPubKeyHex: string) => {
    if (scriptPubKeyHex === PAYOUT_SCRIPT_PUBKEY) return PAYOUT_ADDRESS;
    throw new Error(`Unexpected scriptPubKey ${scriptPubKeyHex}`);
  },
}));

vi.mock("@/components/simple/PendingDepositModals", () => ({
  PendingDepositModals: () => null,
}));

vi.mock("@/components/simple/PostDepositContinuationContent", () => ({
  PostDepositContinuationContent: ({
    vaultIds,
    autoStartAction,
  }: {
    vaultIds: readonly string[];
    autoStartAction: string | null;
  }) => (
    <>
      <div data-testid="continuation-vault-ids">{vaultIds.join(",")}</div>
      <div data-testid="continuation-auto-start-action">
        {String(autoStartAction)}
      </div>
    </>
  ),
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
    storageReadError: null,
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
    claimExpiredModal: {
      claimingActivity: null,
      handleClaimClick: vi.fn(),
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
  // Selected by the page outside `usePendingDeposits` (utils/returnedVaults).
  returnedRedeemedActivities: VaultActivity[] = [],
) {
  mockUseDepositPollingResult.mockReturnValue(result);
  const deposits = makeDeposits(options, removePendingPegins);
  const view = render(
    <VaultsLifecycleSections
      deposits={deposits}
      returnedRedeemedActivities={returnedRedeemedActivities}
      onDownloadArtifacts={vi.fn()}
    />,
  );

  return {
    deposits,
    removePendingPegins,
    rerenderWith: (next: DepositsOptions) =>
      view.rerender(
        <VaultsLifecycleSections
          deposits={makeDeposits({ ...options, ...next }, removePendingPegins)}
          returnedRedeemedActivities={returnedRedeemedActivities}
          onDownloadArtifacts={vi.fn()}
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

  it("shows the returned message, not an activation estimate, on a returned vault's row", () => {
    const RETURNED_STATE: PeginState = {
      contractStatus: ContractStatus.VERIFIED,
      displayLabel: PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS,
      displayVariant: "pending",
      availableActions: [PeginAction.NONE],
      message: COPY.pegin.messages.activationReturned,
      activationReturned: true,
    };
    renderPendingRow(
      pollingResult(RETURNED_STATE, { prePeginConfirmations: 6 }),
    );

    expect(
      screen.getByText(COPY.pegin.messages.activationReturned),
    ).toBeInTheDocument();
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

describe("VaultsLifecycleSections deposit view", () => {
  it("adds a sibling listed after the view opened to the batch it shows", () => {
    const { rerenderWith } = renderPendingRow(pollingResult(PROCESSING_STATE), {
      activities: [BATCH_A],
    });

    fireEvent.click(
      screen.getByRole("button", { name: COPY.vaults.actions.viewDetails }),
    );
    expect(screen.getByTestId("continuation-vault-ids").textContent).toBe(
      BATCH_A.id,
    );

    rerenderWith({ activities: [BATCH_A, BATCH_B] });

    expect(screen.getByTestId("continuation-vault-ids").textContent).toBe(
      `${BATCH_A.id},${BATCH_B.id}`,
    );
  });

  it("keeps a vault in the batch it shows while a refetch drops that vault", () => {
    const first = { ...BATCH_A, constructionIndex: 0 };
    const second = { ...BATCH_B, constructionIndex: 1 };
    const { rerenderWith } = renderPendingRow(pollingResult(PROCESSING_STATE), {
      activities: [first, second],
    });

    fireEvent.click(
      screen.getAllByRole("button", {
        name: COPY.vaults.actions.viewDetails,
      })[0],
    );
    rerenderWith({ activities: [second] });

    expect(screen.getByTestId("continuation-vault-ids").textContent).toBe(
      `${first.id},${second.id}`,
    );
  });

  it("opens View Details without naming an action to start", () => {
    renderPendingRow(pollingResult(PROCESSING_STATE));

    fireEvent.click(
      screen.getByRole("button", { name: COPY.vaults.actions.viewDetails }),
    );

    expect(
      screen.getByTestId("continuation-auto-start-action").textContent,
    ).toBe("null");
  });

  it("opens a named row action with that action to start", () => {
    const payoutState: PeginState = {
      contractStatus: ContractStatus.PENDING,
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      displayVariant: "pending",
      availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS],
    };
    renderPendingRow(pollingResult(payoutState));

    fireEvent.click(screen.getByTestId("pending-deposit-resume-cta"));

    expect(
      screen.getByTestId("continuation-auto-start-action").textContent,
    ).toBe(PeginAction.SIGN_PAYOUT_TRANSACTIONS);
  });
});

describe("VaultsLifecycleSections reclaim connection", () => {
  let status: ReclaimStatus;

  beforeEach(() => {
    wallet.connected = false;
    wallet.publicKeyNoCoord = undefined;
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
    wallet.connected = true;
    wallet.publicKeyNoCoord = undefined;
    gate.value = UNBLOCKED_GATE;
    vi.mocked(useReclaimStatus).mockReturnValue({
      statusByDepositId: new Map(),
    });
    vi.mocked(useReclaimVaultChainData).mockReturnValue(new Map());
  });

  function renderReclaim() {
    return renderPendingRow(pollingResult(PROCESSING_STATE), {
      pendingActivities: [],
      reclaimableCandidates: [
        { ...ACTIVITY, contractStatus: ContractStatus.DEPOSITOR_WITHDRAWN },
      ],
    });
  }

  it("offers Reclaim for a settled vault with an unspent reserve", () => {
    wallet.connected = true;
    wallet.publicKeyNoCoord = ACTIVITY.depositorBtcPubkey;
    const { deposits } = renderReclaim();

    const button = screen.getByTestId("vault-reclaim-button");
    expect(button).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
    ).toBeInTheDocument();
    fireEvent.click(button);
    expect(deposits.reclaimModal.handleReclaimClick).toHaveBeenCalledWith(
      ACTIVITY_ID,
    );
  });

  it("removes the row and inactive heading when a reclaim confirms", () => {
    status.reserveSpend = { spent: true, confirmed: false };
    const { deposits, rerender } = renderReclaim();
    expect(
      screen.getByRole("button", { name: COPY.reclaim.rowButton }),
    ).toBeDisabled();

    vi.mocked(useReclaimStatus).mockReturnValue({
      statusByDepositId: new Map([
        [
          ACTIVITY_ID,
          { ...status, reserveSpend: { spent: true, confirmed: true } },
        ],
      ]),
    });
    rerender(
      <VaultsLifecycleSections
        deposits={deposits}
        returnedRedeemedActivities={[]}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: /Inactive Vaults/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.reclaim.rowButton }),
    ).not.toBeInTheDocument();
  });

  it("never renders a reserve reclaimed in an earlier session", () => {
    status.reserveSpend = { spent: true, confirmed: true };
    const { container } = renderReclaim();

    expect(
      screen.queryByRole("heading", { name: /Inactive Vaults/ }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("section")).toBeNull();
  });

  it.each(["chain", "Bitcoin"])(
    "does not mount a reclaim row before %s reads resolve",
    (missing) => {
      if (missing === "chain") {
        vi.mocked(useReclaimVaultChainData).mockReturnValue(new Map());
      } else {
        vi.mocked(useReclaimStatus).mockReturnValue({
          statusByDepositId: new Map(),
        });
      }
      const { container } = renderReclaim();

      expect(
        screen.queryByRole("heading", { name: /Inactive Vaults/ }),
      ).not.toBeInTheDocument();
      expect(container.querySelector("section")).toBeNull();
    },
  );

  it("keeps a broadcast reclaim visible with a disabled button", () => {
    status.reserveSpend = { spent: true, confirmed: false };
    renderReclaim();

    expect(
      screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.reclaim.rowButton }),
    ).toBeDisabled();
    expect(
      screen.getByText(COPY.reclaim.rowStatusReclaiming),
    ).toBeInTheDocument();
  });

  it("disables a locally broadcast reclaim before the next Bitcoin poll", () => {
    wallet.connected = true;
    wallet.publicKeyNoCoord = ACTIVITY.depositorBtcPubkey;
    const { deposits, rerender } = renderReclaim();
    expect(screen.getByTestId("vault-reclaim-button")).toBeEnabled();

    deposits.reclaimModal.inFlightVaultIds = new Set([ACTIVITY_ID]);
    rerender(
      <VaultsLifecycleSections
        deposits={deposits}
        returnedRedeemedActivities={[]}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.reclaim.rowButton }),
    ).toBeDisabled();
    expect(
      screen.getByText(COPY.reclaim.rowStatusReclaiming),
    ).toBeInTheDocument();
  });

  it("counts only reclaim rows with an action among completed vaults", () => {
    const completedId = "0xcompleted";
    vi.mocked(useReclaimVaultChainData).mockReturnValue(
      new Map([
        [
          ACTIVITY_ID,
          {
            peginTxid: ACTIVITY.prePeginTxHash!,
            onChainStatus: OnChainBtcVaultStatus.REDEEMED,
          },
        ],
        [
          completedId,
          {
            peginTxid: ACTIVITY.prePeginTxHash!,
            onChainStatus: OnChainBtcVaultStatus.REDEEMED,
          },
        ],
      ]),
    );
    vi.mocked(useReclaimStatus).mockReturnValue({
      statusByDepositId: new Map([
        [ACTIVITY_ID, status],
        [
          completedId,
          { ...status, reserveSpend: { spent: true, confirmed: true } },
        ],
      ]),
    });
    renderPendingRow(pollingResult(PROCESSING_STATE), {
      pendingActivities: [],
      reclaimableCandidates: [
        ACTIVITY,
        {
          ...ACTIVITY,
          id: completedId,
          collateral: { amount: "0.2", symbol: "BTC" },
        },
      ],
    });

    expect(
      screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("0.2 BTC")).not.toBeInTheDocument();
  });

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
    rerender(
      <VaultsLifecycleSections
        deposits={deposits}
        returnedRedeemedActivities={[]}
        onDownloadArtifacts={vi.fn()}
      />,
    );
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
      screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
    ).toBeInTheDocument();
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

  it.each(["unsettled", "spent", "missing", "in-flight"])(
    "does not offer connection for a %s reclaim",
    (condition) => {
      if (condition === "unsettled") status.payoutSpend.confirmed = false;
      if (condition === "spent") status.reserveSpend.spent = true;
      if (condition === "missing")
        vi.mocked(useReclaimVaultChainData).mockReturnValue(new Map());
      const { deposits, rerender } = renderReclaim();
      if (condition === "in-flight") {
        deposits.reclaimModal.inFlightVaultIds = new Set([ACTIVITY_ID]);
        rerender(
          <VaultsLifecycleSections
            deposits={deposits}
            returnedRedeemedActivities={[]}
            onDownloadArtifacts={vi.fn()}
          />,
        );
      }
      expect(
        screen.queryByRole("button", { name: COPY.wallet.btcAction.connect }),
      ).not.toBeInTheDocument();
      expect(deposits.reclaimModal.handleReclaimClick).not.toHaveBeenCalled();
    },
  );
});

describe("VaultsLifecycleSections returned vault", () => {
  // Redeemed by the registry at activation, so never collateral: the row the
  // page selects through utils/returnedVaults.
  const REDEEMED_ID = "0xredeemed" as Hex;
  const REDEEMED_ACTIVITY: VaultActivity = {
    ...ACTIVITY,
    id: REDEEMED_ID,
    contractStatus: ContractStatus.REDEEMED,
    displayLabel: PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS,
    peginTxHash: "0xpegin" as Hex,
    depositorPayoutBtcAddress: PAYOUT_SCRIPT_PUBKEY as Hex,
  };

  afterEach(() => {
    vi.mocked(useRedeemClaimTxids).mockReturnValue(new Map());
    vi.mocked(useActivationRedeemReasons).mockReturnValue(new Map());
  });

  function renderReturnedRow(activity = REDEEMED_ACTIVITY) {
    return renderPendingRow(
      pollingResult(getPeginState(ContractStatus.REDEEMED, {}), {
        depositId: REDEEMED_ID,
      }),
      { pendingActivities: [], allActivities: [activity] },
      undefined,
      [activity],
    );
  }

  it("lists the vault as redeem in progress, with its payout destination and no action", () => {
    renderReturnedRow();

    expect(
      screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS),
    ).toBeInTheDocument();
    expect(screen.getByTestId("row-hint")).toHaveTextContent(
      COPY.pegin.messages.redemptionInProgress,
    );
    expect(
      screen.getByText(COPY.vaults.payoutTo(truncateHash(PAYOUT_ADDRESS))),
    ).toHaveAttribute("title", COPY.vaults.payoutTo(PAYOUT_ADDRESS));
    // The Pre-PegIn stays the row's transaction until the provider's claim.
    expect(screen.getByRole("link")).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.vaults.claimTransactionLabel),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.vaults.actions.withdraw }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.vaults.actions.redeem }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vault-reclaim-button"),
    ).not.toBeInTheDocument();
  });

  it("links the vault provider's claim once it is broadcast", () => {
    const claimTxid = "ef".repeat(32);
    vi.mocked(useRedeemClaimTxids).mockReturnValue(
      new Map([[REDEEMED_ID, claimTxid]]),
    );

    renderReturnedRow();

    expect(
      screen.getByText(COPY.vaults.claimTransactionLabel),
    ).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `https://mempool.space/signet/tx/${claimTxid}`,
    );
  });

  it("the redeemed row's hint carries the reason sentence", () => {
    vi.mocked(useActivationRedeemReasons).mockReturnValue(
      new Map([[REDEEMED_ID, { kind: "cap_exceeded" }]]),
    );

    renderReturnedRow();

    expect(screen.getByTestId("row-hint")).toHaveTextContent(
      `${COPY.pegin.messages.redemptionInProgress} ${COPY.vaults.redeemReason.capExceeded}`,
    );
  });

  it("the hint carries no sentence for an unknown reason", () => {
    vi.mocked(useActivationRedeemReasons).mockReturnValue(
      new Map([[REDEEMED_ID, { kind: "unknown" }]]),
    );

    renderReturnedRow();

    expect(screen.getByTestId("row-hint").textContent).toBe(
      COPY.pegin.messages.redemptionInProgress,
    );
  });

  it("shows no payout destination when the indexer carries none", () => {
    renderReturnedRow({
      ...REDEEMED_ACTIVITY,
      depositorPayoutBtcAddress: undefined,
    });

    expect(
      screen.getByText(PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^To /)).not.toBeInTheDocument();
  });
});

describe("VaultsLifecycleSections expired refunds", () => {
  it.each(["pending", "confirmed", "locally broadcast"] as const)(
    "links the refund transaction while the refund is %s",
    (settlement) => {
      const broadcastAt = 1_800_000_000_000;
      const refundTxId = "cd".repeat(32);
      renderPendingRow(
        pollingResult(
          getPeginState(
            ContractStatus.EXPIRED,
            settlement === "locally broadcast"
              ? {
                  localStatus: LocalStorageStatus.REFUND_BROADCAST,
                  refundBroadcastAt: broadcastAt,
                  now: broadcastAt + 1_000,
                }
              : { refundSettlement: settlement },
          ),
          { refundTxId },
        ),
        {
          pendingActivities: [],
          expiredActivities: [
            { ...ACTIVITY, contractStatus: ContractStatus.EXPIRED },
          ],
        },
      );

      expect(
        screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          settlement === "confirmed"
            ? PEGIN_DISPLAY_LABELS.REFUNDED
            : PEGIN_DISPLAY_LABELS.REFUNDING,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.vaults.refundTransactionLabel),
      ).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        `https://mempool.space/signet/tx/${refundTxId}`,
      );
      expect(
        screen.getByRole("button", { name: /Copy BTC transaction hash/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: COPY.vaults.actions.withdraw }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(["pending", "confirmed"] as const)(
    "shows no deposit hash when the %s refund hash is unknown",
    (refundSettlement) => {
      renderPendingRow(
        pollingResult(
          getPeginState(ContractStatus.EXPIRED, { refundSettlement }),
        ),
        { pendingActivities: [], expiredActivities: [ACTIVITY] },
      );

      expect(
        screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Copy BTC transaction hash/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: COPY.vaults.actions.withdraw }),
      ).not.toBeInTheDocument();
    },
  );

  it("counts both an unrefunded expired deposit and a completed refund", () => {
    const completedId = "0xrefunded";
    const { deposits, rerender } = renderPendingRow(
      pollingResult(getPeginState(ContractStatus.EXPIRED)),
      {
        pendingActivities: [],
        expiredActivities: [
          { ...ACTIVITY, contractStatus: ContractStatus.EXPIRED },
          {
            ...ACTIVITY,
            id: completedId,
            contractStatus: ContractStatus.EXPIRED,
            collateral: { amount: "0.2", symbol: "BTC" },
          },
        ],
      },
    );
    mockUseDepositPollingResult.mockImplementation((id) =>
      pollingResult(
        getPeginState(
          ContractStatus.EXPIRED,
          id === completedId ? { refundSettlement: "confirmed" } : {},
        ),
      ),
    );
    rerender(
      <VaultsLifecycleSections
        deposits={{
          ...deposits,
          expiredActivities: [...deposits.expiredActivities],
        }}
        returnedRedeemedActivities={[]}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Inactive Vaults (2)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0.2 BTC")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://mempool.space/signet/tx/prepegin",
    );
  });
});

describe("VaultsLifecycleSections expired redeem", () => {
  it("offers Redeem on an expired vault the PegIn swept and opens the redeem modal for it", () => {
    const { deposits } = renderPendingRow(
      pollingResult(
        getPeginState(ContractStatus.EXPIRED, {
          peginSweptWhileExpired: true,
          canClaimExpired: true,
          claimExpiredWindow: { state: "open", blocksRemaining: 7_200 },
        }),
      ),
      {
        pendingActivities: [],
        expiredActivities: [
          { ...ACTIVITY, contractStatus: ContractStatus.EXPIRED },
        ],
      },
    );

    expect(
      screen.getByRole("heading", { name: "Inactive Vaults (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.vaults.actions.withdraw }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.vaults.actions.redeem }),
    );
    expect(deposits.claimExpiredModal.handleClaimClick).toHaveBeenCalledWith(
      ACTIVITY_ID,
    );
  });

  it("keeps the row without an action once the chain reports the window closed", () => {
    renderPendingRow(
      pollingResult(
        getPeginState(ContractStatus.EXPIRED, {
          peginSweptWhileExpired: true,
          canClaimExpired: false,
          claimExpiredWindow: { state: "closed" },
        }),
      ),
      {
        pendingActivities: [],
        expiredActivities: [
          { ...ACTIVITY, contractStatus: ContractStatus.EXPIRED },
        ],
      },
    );

    expect(
      screen.getByText(COPY.pegin.messages.peginSweptWindowClosedSubtext),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.vaults.actions.redeem }),
    ).not.toBeInTheDocument();
  });
});

describe("VaultsLifecycleSections expired artifact download", () => {
  const EXPIRED_ID = `0x${"aa".repeat(32)}` as Hex;
  const PEGIN_TXID = "bb".repeat(32);
  const EXPIRED_ACTIVITY: VaultActivity = {
    ...ACTIVITY,
    id: EXPIRED_ID,
    contractStatus: ContractStatus.EXPIRED,
    displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
    peginTxHash: `0x${PEGIN_TXID}` as Hex,
    expirationReason: "activation_timeout",
  };

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FF_HTTP_ARTIFACT_DOWNLOADS", "true");
    vi.mocked(getSignedGraphFingerprint).mockReturnValue({
      status: "found",
      fingerprint: "ee".repeat(32),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(getSignedGraphFingerprint).mockReturnValue({
      status: "no-entry",
    });
    window.localStorage.clear();
  });

  function renderExpiredRow(
    onDownloadArtifacts = vi.fn(),
    peginState: PeginState | null = getPeginState(ContractStatus.EXPIRED, {}),
  ) {
    mockUseDepositPollingResult.mockReturnValue(
      peginState
        ? pollingResult(peginState, { depositId: EXPIRED_ID })
        : undefined,
    );
    render(
      <VaultsLifecycleSections
        deposits={makeDeposits(
          {
            pendingActivities: [],
            expiredActivities: [EXPIRED_ACTIVITY],
            allActivities: [EXPIRED_ACTIVITY],
          },
          vi.fn((): RemovePendingPeginsResult => "removed"),
        )}
        returnedRedeemedActivities={[]}
        onDownloadArtifacts={onDownloadArtifacts}
      />,
    );
    return onDownloadArtifacts;
  }

  it("opens the download for a vault that expired at activation timeout", () => {
    const onDownloadArtifacts = renderExpiredRow();

    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.actions.downloadArtifacts,
      }),
    );

    expect(onDownloadArtifacts).toHaveBeenCalledWith({
      vaultId: EXPIRED_ID,
      providerAddress: "0xprovider",
      peginTxid: `0x${PEGIN_TXID}`,
      depositorPk: ACTIVITY.depositorBtcPubkey,
      unsignedPrePeginTxHex: ACTIVITY.unsignedPrePeginTx,
    });
  });

  it("hides the download until the row's state is known", () => {
    renderExpiredRow(vi.fn(), null);

    expect(
      screen.queryByRole("button", {
        name: COPY.vaults.actions.downloadArtifacts,
      }),
    ).not.toBeInTheDocument();
  });

  it("hides the download once the HTLC refund is broadcast", () => {
    renderExpiredRow(
      vi.fn(),
      getPeginState(ContractStatus.EXPIRED, { refundSettlement: "pending" }),
    );

    expect(
      screen.getByText(PEGIN_DISPLAY_LABELS.REFUNDING),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.vaults.actions.downloadArtifacts,
      }),
    ).not.toBeInTheDocument();
  });

  it("hides the download once this pegin's artifacts are saved", () => {
    saveArtifactDownloadReceipt(EXPIRED_ID, {
      version: 1,
      peginTxid: PEGIN_TXID,
      filename: "artifacts.json",
      byteLength: 1,
      sha256: "cc".repeat(32),
      savedAt: 1,
      method: "browser-download",
    });

    renderExpiredRow();

    expect(
      screen.queryByRole("button", {
        name: COPY.vaults.actions.downloadArtifacts,
      }),
    ).not.toBeInTheDocument();
  });
});
