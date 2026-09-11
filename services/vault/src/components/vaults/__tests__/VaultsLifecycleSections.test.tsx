import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VaultsLifecycleSections } from "@/components/vaults/VaultsLifecycleSections";
import { COPY } from "@/copy";
import type { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { useReclaimStatus, type ReclaimStatus } from "@/hooks/useReclaimStatus";
import { useReclaimVaultChainData } from "@/hooks/useReclaimVaultChainData";
import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
  type PeginState,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";
import { formatDurationShort } from "@/utils/formatting";

const mockUseDepositPollingResult = vi.hoisted(() =>
  vi.fn<(depositId: string) => DepositPollingResult | undefined>(
    () => undefined,
  ),
);
const wallet = vi.hoisted(() => ({ connected: true, open: vi.fn() }));

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

vi.mock("@/hooks/deposit/useReclaimRowAction", () => ({
  useReclaimRowAction: () => ({
    available: false,
    reclaiming: false,
    blockedTooltip: null,
    reclaimableSats: null,
  }),
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

function renderPendingRow(
  result: DepositPollingResult,
  overrides: Partial<ReturnType<typeof usePendingDeposits>> = {},
) {
  mockUseDepositPollingResult.mockReturnValue(result);
  const deposits = {
    pendingActivities: [ACTIVITY],
    expiredActivities: [],
    reclaimableCandidates: [],
    allActivities: [ACTIVITY],
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
    demo: null,
    ...overrides,
  } satisfies ReturnType<typeof usePendingDeposits>;

  return {
    ...render(<VaultsLifecycleSections deposits={deposits} />),
    deposits,
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
