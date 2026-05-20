import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionStatus } from "@/components/deposit/actionStatus";
import { PeginAction } from "@/components/deposit/actionStatus";

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
  VaultDetailCard: ({ action }: { action?: ReactNode }) => (
    <div data-testid="vault-detail-card">{action}</div>
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
