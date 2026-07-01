import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PeginAction } from "@/components/deposit/actionStatus";
import { COPY } from "@/copy";
import {
  ContractStatus,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";

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
    action,
    amountSubtext,
    belowHeader,
    disabled,
    disabledTooltip,
    onClick,
    txHashRow,
  }: {
    action?: ReactNode;
    amountSubtext?: ReactNode;
    belowHeader?: ReactNode;
    disabled?: boolean;
    disabledTooltip?: string;
    onClick?: () => void;
    txHashRow?: ReactNode;
  }) => (
    <div
      data-testid="vault-detail-card"
      data-disabled={disabled ? "true" : "false"}
      data-disabled-tooltip={disabledTooltip ?? ""}
      data-clickable={onClick ? "true" : "false"}
      onClick={onClick}
    >
      <div data-testid="amount-subtext">{amountSubtext}</div>
      <div data-testid="below-header">{belowHeader}</div>
      <div data-testid="tx-hash-row">{txHashRow}</div>
      <div data-testid="action-slot">{action}</div>
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
    // Wallet-ownership mismatch: a disabled card renders no CTA button — the
    // visual signal is dimming + a hover tooltip (the CTA is reserved for an
    // `available` action).
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

describe("PendingDepositCard — refunded cards are not clickable", () => {
  function renderWithClick(displayLabel: string) {
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: {
        contractStatus: ContractStatus.EXPIRED,
        displayLabel,
        displayVariant: "inactive",
        availableActions: [],
      },
    });
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
        onCardClick={vi.fn()}
      />,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActionStatus.mockReturnValue({ type: "noAction" });
  });

  it("drops the click handler once the deposit is refunded", () => {
    renderWithClick(PEGIN_DISPLAY_LABELS.REFUNDED);
    expect(screen.getByTestId("vault-detail-card")).toHaveAttribute(
      "data-clickable",
      "false",
    );
  });

  it("keeps the card clickable for an expired deposit still awaiting refund", () => {
    renderWithClick(PEGIN_DISPLAY_LABELS.EXPIRED);
    expect(screen.getByTestId("vault-detail-card")).toHaveAttribute(
      "data-clickable",
      "true",
    );
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

describe("PendingDepositCard — refunding (in-flight) cards are not clickable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActionStatus.mockReturnValue({ type: "noAction" });
  });

  it("is inert once a refund is in flight (Refunding)", () => {
    // Refunding = our own broadcast OR the HTLC-spend probe seeing the refund tx
    // in the mempool (so this also covers a refund broadcast from another
    // device). The refund is in flight, so the card must not reopen the modal.
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: {
        contractStatus: ContractStatus.EXPIRED,
        displayLabel: PEGIN_DISPLAY_LABELS.REFUNDING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
      },
    });
    const onCardClick = vi.fn();
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
        onCardClick={onCardClick}
      />,
    );

    const card = screen.getByTestId("vault-detail-card");
    expect(card).toHaveAttribute("data-clickable", "false");
    fireEvent.click(card);
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("stays clickable for a pending vault with no available action", () => {
    // Pending cards open the multistepper even with no primary action; the
    // refund gate (Refunding/Refunded only) must not touch them.
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: {
        contractStatus: ContractStatus.PENDING,
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
      },
    });
    const onCardClick = vi.fn();
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
        onCardClick={onCardClick}
      />,
    );

    const card = screen.getByTestId("vault-detail-card");
    expect(card).toHaveAttribute("data-clickable", "true");
    fireEvent.click(card);
    expect(onCardClick).toHaveBeenCalledWith("0xvault");
  });
});

describe("PendingDepositCard — action CTA button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: {
        contractStatus: ContractStatus.VERIFIED,
        displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
        displayVariant: "pending",
        availableActions: [PeginAction.ACTIVATE_VAULT],
      },
    });
  });

  it("renders the orange CTA for an available forward action and routes its click to the card handler", () => {
    mockGetActionStatus.mockReturnValue({
      type: "available",
      action: {
        action: PeginAction.ACTIVATE_VAULT,
        label: COPY.pegin.primaryAction.ACTIVATE_VAULT,
      },
    });
    const onCardClick = vi.fn();
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
        onCardClick={onCardClick}
      />,
    );

    const button = screen.getByRole("button", {
      name: COPY.pegin.primaryAction.ACTIVATE_VAULT,
    });
    // The orange CTA is the contained/secondary button (secondary.main is the
    // brand orange in this theme).
    expect(button.className).toContain("bbn-btn-contained");
    expect(button.className).toContain("bbn-btn-secondary");
    fireEvent.click(button);
    expect(onCardClick).toHaveBeenCalledWith("0xvault");
  });

  it("renders the HTLC refund as a lower-emphasis outlined button", () => {
    mockUseDepositPollingResult.mockReturnValue({
      loading: false,
      peginState: {
        contractStatus: ContractStatus.EXPIRED,
        displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
        displayVariant: "warning",
        availableActions: [PeginAction.REFUND_HTLC],
      },
    });
    mockGetActionStatus.mockReturnValue({
      type: "available",
      action: {
        action: PeginAction.REFUND_HTLC,
        label: COPY.pegin.primaryAction.REFUND_HTLC,
      },
    });
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
        onCardClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: COPY.pegin.primaryAction.REFUND_HTLC,
    });
    expect(button.className).toContain("bbn-btn-outlined");
  });

  it("renders no CTA when there is no available action", () => {
    mockGetActionStatus.mockReturnValue({ type: "noAction" });
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
        onCardClick={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: COPY.pegin.primaryAction.ACTIVATE_VAULT,
      }),
    ).not.toBeInTheDocument();
  });

  it("renders no CTA for a batched sibling with no card handler", () => {
    // Batched siblings have no `onCardClick` — the group wrapper owns the click
    // and hoists the shared broadcast, so the inner card stays CTA-free even
    // when an action is available.
    mockGetActionStatus.mockReturnValue({
      type: "available",
      action: {
        action: PeginAction.ACTIVATE_VAULT,
        label: COPY.pegin.primaryAction.ACTIVATE_VAULT,
      },
    });
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: COPY.pegin.primaryAction.ACTIVATE_VAULT,
      }),
    ).not.toBeInTheDocument();
  });

  it("renders no CTA when the action is disabled by an ownership mismatch", () => {
    mockGetActionStatus.mockReturnValue({
      type: "disabled",
      action: {
        action: PeginAction.ACTIVATE_VAULT,
        label: COPY.pegin.primaryAction.ACTIVATE_VAULT,
      },
      tooltip: "Switch to the owning wallet",
    });
    render(
      <PendingDepositCard
        depositId="0xvault"
        amount="0.05"
        providerId="0xprovider"
        vaultProviders={[]}
        onCardClick={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: COPY.pegin.primaryAction.ACTIVATE_VAULT,
      }),
    ).not.toBeInTheDocument();
  });
});
