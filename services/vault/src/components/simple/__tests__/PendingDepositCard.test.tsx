import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PeginAction } from "@/components/deposit/actionStatus";
import { COPY } from "@/copy";
import { ContractStatus, LocalStorageStatus } from "@/models/peginStateMachine";

import { PendingDepositCard } from "../PendingDepositCard";

const mockUseDepositPollingResult = vi.fn();
const mockGetActionStatus = vi.fn();

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: (id: string) => mockUseDepositPollingResult(id),
}));

vi.mock("@/components/deposit/actionStatus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/deposit/actionStatus")>();
  return {
    ...actual,
    getActionStatus: (...args: unknown[]) => mockGetActionStatus(...args),
  };
});

// Stub the layout card — expose disabled props plus the rendered slots so the
// test can assert what was passed in.
vi.mock("../VaultDetailCard", () => ({
  VaultDetailCard: ({
    amountSubtext,
    belowHeader,
    disabled,
    disabledTooltip,
    txHashRow,
  }: {
    amountSubtext?: ReactNode;
    belowHeader?: ReactNode;
    disabled?: boolean;
    disabledTooltip?: string;
    txHashRow?: ReactNode;
  }) => (
    <div
      data-testid="vault-detail-card"
      data-disabled={disabled ? "true" : "false"}
      data-disabled-tooltip={disabledTooltip ?? ""}
    >
      <div data-testid="amount-subtext">{amountSubtext}</div>
      <div data-testid="below-header">{belowHeader}</div>
      <div data-testid="tx-hash-row">{txHashRow}</div>
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
    availableActions: [],
  },
};

function renderCard() {
  render(
    <PendingDepositCard
      depositId="0xvault"
      amount="0.05"
      providerId="0xprovider"
      vaultProviders={[]}
    />,
  );
}

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
    mockGetActionStatus.mockReturnValue({ type: "noAction" });
  });

  it("renders the step label once the first poll has resolved", () => {
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: awaitingPayoutPrepState(),
    });
    renderCard();
    expect(
      screen.getByText(COPY.deposit.steps.awaitPayoutTransactions),
    ).toBeInTheDocument();
  });

  it("hides the step label while the first poll is still loading", () => {
    mockUseDepositPollingResult.mockReturnValue({
      loading: true,
      peginState: awaitingPayoutPrepState(),
    });
    renderCard();
    expect(
      screen.queryByText(COPY.deposit.steps.awaitPayoutTransactions),
    ).not.toBeInTheDocument();
  });
});

describe("PendingDepositCard — disabled (ownership mismatch) surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDepositPollingResult.mockReturnValue(POLLING_RESULT);
  });

  it("dims the card and surfaces the tooltip when the action is disabled", () => {
    // Wallet-ownership mismatch: the card has no in-card action button
    // anymore (clicking the card opens the multistepper), so the visual
    // signal is dimming + a hover tooltip.
    const TOOLTIP =
      "This BTC Vault was created with a different BTC public key (bcc5...f21c). Switch to that wallet to perform actions.";
    mockGetActionStatus.mockReturnValue({
      type: "disabled",
      action: { action: PeginAction.ACTIVATE_VAULT, label: "Activate" },
      tooltip: TOOLTIP,
    });
    renderCard();

    const card = screen.getByTestId("vault-detail-card");
    expect(card).toHaveAttribute("data-disabled", "true");
    expect(card).toHaveAttribute("data-disabled-tooltip", TOOLTIP);
  });

  it("leaves the card un-dimmed for noAction status", () => {
    mockGetActionStatus.mockReturnValue({ type: "noAction" });
    renderCard();

    const card = screen.getByTestId("vault-detail-card");
    expect(card).toHaveAttribute("data-disabled", "false");
  });
});

describe("PendingDepositCard — Pre-Pegin explorer link gating", () => {
  const PRE_PEGIN_TX_HASH = `0x${"2".repeat(64)}`;
  const PRE_PEGIN_TXID = "2".repeat(64);

  function renderWithPrePegin(availableActions: PeginAction[]) {
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: {
        displayLabel: "Pending",
        displayVariant: "pending",
        availableActions,
      },
    });
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        prePeginTxHash={PRE_PEGIN_TX_HASH}
        providerId="0xprovider"
        vaultProviders={[]}
      />,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActionStatus.mockReturnValue({ type: "unavailable" });
  });

  it("keeps the Pre-Pegin hash copy-only while the broadcast action is pending", () => {
    // Broadcast still pending → the Pre-PegIn tx is not on Bitcoin yet, so an
    // explorer link would 404. The hash must be copy-only.
    renderWithPrePegin([PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links the Pre-Pegin hash once the broadcast action is no longer pending", () => {
    renderWithPrePegin([]);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining(PRE_PEGIN_TXID),
    );
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
    mockGetActionStatus.mockReturnValue({
      type: "available",
      action: {
        action: PeginAction.SIGN_PAYOUT_TRANSACTIONS,
        label: COPY.pegin.primaryAction.SIGN_PAYOUT_TRANSACTIONS,
      },
    });
  });

  it("shows the authenticate-session step while it is still waiting to sign", () => {
    // The deposit is resting before it acts. Clicking the card runs the
    // auth-anchor step first, so the card sits on that step with that step's
    // label — not the next one, which would imply the auth-anchor step is
    // done.
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: readyToSignPayoutsState(),
    });
    renderCard();
    expect(
      screen.getByText(COPY.deposit.steps.authenticateSession),
    ).toBeInTheDocument();
  });
});
