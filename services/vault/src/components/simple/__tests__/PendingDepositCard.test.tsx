import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionStatus } from "@/components/deposit/actionStatus";
import { PeginAction } from "@/components/deposit/actionStatus";
import { COPY } from "@/copy";
import { ContractStatus, LocalStorageStatus } from "@/models/peginStateMachine";

import { PendingDepositCard } from "../PendingDepositCard";

const mockUseDepositPollingResult = vi.fn();
const mockGetActionStatus = vi.fn();
const mockIsArtifactDownloadAvailable = vi.fn(() => false);

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: (id: string) => mockUseDepositPollingResult(id),
}));

vi.mock("@/components/deposit/actionStatus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/deposit/actionStatus")>();
  return {
    ...actual,
    getActionStatus: (...args: unknown[]) => mockGetActionStatus(...args),
    isArtifactDownloadAvailable: () => mockIsArtifactDownloadAvailable(),
  };
});

// Stub the layout card — expose the `action` slot so the test can assert
// whether an action button was passed in.
vi.mock("../VaultDetailCard", () => ({
  VaultDetailCard: ({
    action,
    amountSubtext,
    belowHeader,
  }: {
    action?: ReactNode;
    amountSubtext?: ReactNode;
    belowHeader?: ReactNode;
  }) => (
    <div data-testid="vault-detail-card">
      {action}
      <div data-testid="amount-subtext">{amountSubtext}</div>
      <div data-testid="below-header">{belowHeader}</div>
    </div>
  ),
  VaultStatusBadge: () => <div data-testid="status-badge" />,
}));

const POLLING_RESULT = {
  loading: false,
  peginState: {
    displayLabel: "Pending",
    displayVariant: "pending",
    message: undefined,
  },
};

function broadcastAvailable(): ActionStatus {
  return {
    type: "available",
    action: {
      action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      label: "Broadcast Pre-Pegin",
    },
  };
}

function activateAvailable(): ActionStatus {
  return {
    type: "available",
    action: { action: PeginAction.ACTIVATE_VAULT, label: "Activate" },
  };
}

function renderCard(suppressBroadcastAction: boolean) {
  render(
    <PendingDepositCard
      depositId="0xvault"
      amount="0.05"
      providerId="0xprovider"
      vaultProviders={[]}
      onSignClick={vi.fn()}
      onBroadcastClick={vi.fn()}
      onWotsKeyClick={vi.fn()}
      onActivationClick={vi.fn()}
      onRefundClick={vi.fn()}
      suppressBroadcastAction={suppressBroadcastAction}
    />,
  );
}

describe("PendingDepositCard — suppressBroadcastAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDepositPollingResult.mockReturnValue(POLLING_RESULT);
    mockIsArtifactDownloadAvailable.mockReturnValue(false);
  });

  it("hides the broadcast button when suppressBroadcastAction is set", () => {
    mockGetActionStatus.mockReturnValue(broadcastAvailable());
    renderCard(true);
    expect(
      screen.queryByRole("button", { name: /broadcast pre-pegin/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the broadcast button when suppressBroadcastAction is not set", () => {
    mockGetActionStatus.mockReturnValue(broadcastAvailable());
    renderCard(false);
    expect(
      screen.getByRole("button", { name: /broadcast pre-pegin/i }),
    ).toBeInTheDocument();
  });

  it("still renders a non-broadcast action when suppressBroadcastAction is set", () => {
    // Suppression is scoped to the batch-level broadcast only — per-vault
    // actions such as activation must still surface on the card.
    mockGetActionStatus.mockReturnValue(activateAvailable());
    renderCard(true);
    expect(
      screen.getByRole("button", { name: /activate/i }),
    ).toBeInTheDocument();
  });
});

describe("PendingDepositCard — step gating during first load", () => {
  const awaitingPayoutPrepState = () => ({
    contractStatus: ContractStatus.PENDING,
    availableActions: [PeginAction.NONE],
    localStatus: LocalStorageStatus.CONFIRMING,
    displayVariant: "pending",
    displayLabel: "Processing",
    message: COPY.pegin.messages.waitingForPayoutPrep,
    awaitingPayoutPrep: true,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsArtifactDownloadAvailable.mockReturnValue(false);
    mockGetActionStatus.mockReturnValue({ type: "unavailable", reasons: [] });
  });

  it("renders the step label once the first poll has resolved", () => {
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: awaitingPayoutPrepState(),
    });
    renderCard(false);
    expect(screen.getByText(/^Step \d+ of \d+$/)).toBeInTheDocument();
  });

  it("hides the step label while the first poll is still loading", () => {
    mockUseDepositPollingResult.mockReturnValue({
      loading: true,
      peginState: awaitingPayoutPrepState(),
    });
    renderCard(false);
    expect(screen.queryByText(/^Step \d+ of \d+$/)).not.toBeInTheDocument();
  });
});

describe("PendingDepositCard — payout signing step number", () => {
  const readyToSignPayoutsState = () => ({
    contractStatus: ContractStatus.PENDING,
    availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS],
    localStatus: undefined,
    displayVariant: "pending",
    displayLabel: "Signing required",
    message: COPY.pegin.messages.payoutsReadyForSigning,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsArtifactDownloadAvailable.mockReturnValue(false);
    mockGetActionStatus.mockReturnValue({
      type: "available",
      action: {
        action: PeginAction.SIGN_PAYOUT_TRANSACTIONS,
        label: COPY.pegin.primaryAction.SIGN_PAYOUT_TRANSACTIONS,
      },
    });
  });

  it("shows step 9 (authenticate session) while it is still waiting to sign", () => {
    // The deposit is resting before it acts. Clicking "Sign Payouts" runs the
    // auth-anchor step (9) first, so the card sits on step 9 with that step's
    // label — not step 10, which would imply the auth-anchor step is done. The
    // action button still reads "Sign Payouts".
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: readyToSignPayoutsState(),
    });
    renderCard(false);
    expect(screen.getByText("Step 9 of 16")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.steps.authenticateSession),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign payouts/i }),
    ).toBeInTheDocument();
  });
});
