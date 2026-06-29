import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PositionNotificationsStatus } from "@/applications/aave/hooks/usePositionNotifications";
import type { CalculatorResult } from "@/applications/aave/positionNotifications";

import { STALE_PRICE_BANNER_GRACE_MS } from "../constants";
import { PositionNotificationBanner } from "../PositionNotificationBanner";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULT_REGISTRY: "0x1234567890123456789012345678901234567890",
    AAVE_ADAPTER: "0x1234567890123456789012345678901234567890",
    GRAPHQL_ENDPOINT: "https://test.example.com/graphql",
  },
}));

vi.mock("@/config/network", () => ({
  getNetworkConfigETH: vi.fn(() => ({ chainId: 11155111, name: "sepolia" })),
  getNetworkConfigBTC: vi.fn(() => ({
    network: "signet",
    mempoolApiUrl: "https://mempool.space/signet/api",
  })),
  getETHChain: vi.fn(() => ({ id: 11155111, name: "Sepolia" })),
}));

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: { readContract: vi.fn(), getTransactionReceipt: vi.fn() },
}));

// Mock core-ui Notification to avoid ESM transformation issues in the test
// environment. Render the pieces the banner assertions depend on: title, body,
// the suggestion sub-box, and the action pills (label + onClick + disabled),
// and surface variant/severity as data-attributes.
vi.mock("@babylonlabs-io/core-ui", () => ({
  InfoIcon: () => <span data-testid="suggestion-info-icon" />,
  Notification: (props: Record<string, unknown>) => {
    const actions = (props.actions ?? []) as Array<{
      label: ReactNode;
      onClick: () => void;
      disabled?: boolean;
    }>;
    return (
      <div
        data-testid={props["data-testid"] as string}
        data-severity={props["data-severity"] as string}
        data-variant={props.variant as string}
      >
        <div>{props.title as ReactNode}</div>
        <div>{props.children as ReactNode}</div>
        {props.suggestion ? <div>{props.suggestion as ReactNode}</div> : null}
        {props.onClose ? (
          <button
            aria-label="Dismiss notification"
            onClick={props.onClose as () => void}
          >
            dismiss
          </button>
        ) : null}
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  },
}));

// Mock the ReorderSuccessModal to avoid deep dependency chain
vi.mock("../../ReorderVaults", () => ({
  ReorderSuccessModal: (props: Record<string, unknown>) =>
    props.isOpen ? (
      <div data-testid="reorder-success-modal">Success</div>
    ) : null,
}));

const mockExecuteReorder = vi.fn().mockResolvedValue(true);
vi.mock("@/applications/aave/hooks/useReorderVaults", () => ({
  useReorderVaults: () => ({
    executeReorder: mockExecuteReorder,
    isProcessing: false,
  }),
}));

const mockApplyReorderedOrder = vi.fn();
vi.mock("@/applications/aave/context", () => ({
  useReorderOverride: () => ({
    reorderedOrder: null,
    applyReorderedOrder: mockApplyReorderedOrder,
    clearReorderedOrder: vi.fn(),
  }),
}));

const mockReorderVerificationContext = {
  CF: 0.7,
  THF: 1.1,
  maxLB: 1.05,
  btcPrice: 60_000,
  totalDebtUsd: 10_000,
};

const mockUsePositionNotifications = vi.fn(() => ({
  result: null,
  status: "ready" as PositionNotificationsStatus,
  isLoading: false,
  reorderVerificationContext: mockReorderVerificationContext as
    | typeof mockReorderVerificationContext
    | null,
}));

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => mockUsePositionNotifications(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xTestAddress" }),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeBaseResult(
  overrides: Partial<CalculatorResult> = {},
): CalculatorResult {
  return {
    groups: [
      {
        index: 1,
        vaults: [{ id: "v-1", name: "Vault 1", btc: 0.65 }],
        combinedBtc: 0.65,
        liquidationPrice: 50000,
        distancePct: 10,
        targetSeizureBtc: 0.28,
        overSeizureBtc: 0.37,
        isFullLiquidation: false,
        debtToRepay: 10000,
        liquidatorProfitUsd: 500,
        debtRepaid: 10000,
        fairnessDebtRepay: 0,
        fairnessPaymentUsd: 0,
        debtRemainingAfter: 34000,
        btcRemainingAfter: 0.35,
      },
    ],
    currentHF: 1.2,
    collateralValue: 40000,
    targetSeizureBtc: 0.28,
    warnings: [],
    optimalVaultOrder: null,
    suggestedNewVaultBtc: null,
    suggestedRebalanceVaultBtc: null,
    ...overrides,
  };
}

const OPTIMAL_ORDER = [
  { id: "0xabc", name: "Vault 2", btc: 0.6 },
  { id: "0xdef", name: "Vault 1", btc: 0.1 },
];

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function renderBanner(
  result: CalculatorResult | null,
  onDeposit = vi.fn(),
  onRepay = vi.fn(),
) {
  return render(
    <Wrapper>
      <PositionNotificationBanner
        result={result}
        onDeposit={onDeposit}
        onRepay={onRepay}
      />
    </Wrapper>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PositionNotificationBanner", () => {
  const onDeposit = vi.fn();
  const onRepay = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the live status to "ready" so a per-test override (e.g. stale-price)
    // doesn't leak into other tests.
    mockUsePositionNotifications.mockReturnValue({
      result: null,
      status: "ready",
      isLoading: false,
      reorderVerificationContext: mockReorderVerificationContext,
    });
  });

  it("renders nothing when result is null", () => {
    const { container } = renderBanner(null, onDeposit, onRepay);
    expect(container.innerHTML).toBe("");
  });

  it("renders green banner when no warnings and order is optimal", () => {
    renderBanner(makeBaseResult(), onDeposit, onRepay);
    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("green");
    expect(banner.dataset.variant).toBe("success");
    expect(screen.getByText("Position optimally structured")).toBeTruthy();
    expect(screen.queryByText("Apply Optimal Order")).toBeNull();
  });

  it("renders red banner with Add Collateral + Repay Debt for an urgent warning", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "urgent",
          title: "Liquidation is 3.0% away",
          detail: "BTC needs to drop only 3%.",
        },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("red");
    expect(banner.dataset.variant).toBe("error");
    expect(screen.getByText("Add Collateral")).toBeTruthy();
    expect(screen.getByText("Repay Debt")).toBeTruthy();
    expect(screen.queryByText("Apply Optimal Order")).toBeNull();
  });

  it("renders soft banner for a weird-params advisory with no actions", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "weird-params",
          title: "Protocol parameters don't compute",
          detail: "THF must be greater than expected HF.",
          tone: "soft",
        },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("soft");
    expect(banner.dataset.variant).toBe("info");
    expect(screen.getByText("Protocol parameters don't compute")).toBeTruthy();
    expect(screen.queryByText("Add Collateral")).toBeNull();
    expect(screen.queryByText("Apply Optimal Order")).toBeNull();
  });

  it("hides the weird-params advisory after its dismiss control is clicked", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "weird-params",
          title: "Protocol parameters don't compute",
          detail: "THF must be greater than expected HF.",
          tone: "soft",
        },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    expect(screen.getByTestId("position-notification-banner")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    expect(screen.queryByTestId("position-notification-banner")).toBeNull();
  });

  it("does not render a dismiss control on the urgent banner", () => {
    const result = makeBaseResult({
      warnings: [
        { type: "urgent", title: "Liquidation is 3.0% away", detail: "..." },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    expect(
      screen.queryByRole("button", { name: "Dismiss notification" }),
    ).toBeNull();
  });

  it("does not render a dismiss control on the reorder suggestion", () => {
    const result = makeBaseResult({ optimalVaultOrder: OPTIMAL_ORDER });
    renderBanner(result, onDeposit, onRepay);

    expect(
      screen.queryByRole("button", { name: "Dismiss notification" }),
    ).toBeNull();
  });

  it("renders the gold reorder suggestion with a chip row + Apply Optimal Order for a healthy but suboptimal position", () => {
    const result = makeBaseResult({ optimalVaultOrder: OPTIMAL_ORDER });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("soft");
    // Standalone reorder uses the gold `suggestion` variant, not blue `info`.
    expect(banner.dataset.variant).toBe("suggestion");
    expect(screen.getByText("Reorder vaults to lose less")).toBeTruthy();
    // Optimal-order chip row renders each vault in order.
    expect(screen.getByText("Suggested order")).toBeTruthy();
    expect(screen.getByText(/Vault 2 ·/)).toBeTruthy();
    expect(screen.getByText(/Vault 1 ·/)).toBeTruthy();
    expect(screen.getByText("Apply Optimal Order")).toBeTruthy();
    // Reorder-only — no collateral/repay actions.
    expect(screen.queryByText("Add Collateral")).toBeNull();
    expect(screen.queryByText("Repay Debt")).toBeNull();
  });

  it("shows Add Collateral, Repay Debt and Apply Optimal Order when urgent + suboptimal", () => {
    const result = makeBaseResult({
      warnings: [
        { type: "urgent", title: "Liquidation is 4.3% away", detail: "..." },
      ],
      optimalVaultOrder: OPTIMAL_ORDER,
    });
    renderBanner(result, onDeposit, onRepay);

    expect(screen.getByText("Add Collateral")).toBeTruthy();
    expect(screen.getByText("Repay Debt")).toBeTruthy();
    expect(screen.getByText("Apply Optimal Order")).toBeTruthy();
  });

  it("calls onDeposit when Add Collateral is clicked", () => {
    const result = makeBaseResult({
      warnings: [{ type: "urgent", title: "Critical", detail: "..." }],
    });
    renderBanner(result, onDeposit, onRepay);

    fireEvent.click(screen.getByText("Add Collateral"));
    expect(onDeposit).toHaveBeenCalled();
  });

  it("calls onRepay when Repay Debt is clicked", () => {
    const result = makeBaseResult({
      warnings: [{ type: "urgent", title: "Critical", detail: "..." }],
    });
    renderBanner(result, onDeposit, onRepay);

    fireEvent.click(screen.getByText("Repay Debt"));
    expect(onRepay).toHaveBeenCalled();
  });

  it("calls executeReorder with vault IDs and verification context when Apply Optimal Order is clicked", () => {
    const result = makeBaseResult({ optimalVaultOrder: OPTIMAL_ORDER });
    renderBanner(result, onDeposit, onRepay);

    fireEvent.click(screen.getByText("Apply Optimal Order"));
    expect(mockExecuteReorder).toHaveBeenCalledWith(["0xabc", "0xdef"], {
      optimalOrderContext: mockReorderVerificationContext,
    });
  });

  it("does not call executeReorder when the verification context is unavailable", () => {
    mockUsePositionNotifications.mockReturnValueOnce({
      result: null,
      status: "ready" as const,
      isLoading: false,
      reorderVerificationContext: null,
    });
    const result = makeBaseResult({ optimalVaultOrder: OPTIMAL_ORDER });
    renderBanner(result, onDeposit, onRepay);

    fireEvent.click(screen.getByText("Apply Optimal Order"));
    expect(mockExecuteReorder).not.toHaveBeenCalled();
  });

  it("renders secondary warnings below the primary warning", () => {
    const result = makeBaseResult({
      warnings: [
        { type: "urgent", title: "Liquidation can trigger now", detail: "..." },
        {
          type: "weird-params",
          title: "Protocol parameters don't compute",
          detail: "...",
          tone: "soft",
        },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    expect(screen.getByText("Liquidation can trigger now")).toBeTruthy();
    expect(screen.getByText("Protocol parameters don't compute")).toBeTruthy();
  });

  it("renders yellow stale-price banner when statusOverride is stale-price", () => {
    render(
      <Wrapper>
        <PositionNotificationBanner
          statusOverride="stale-price"
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("yellow");
    expect(banner.dataset.variant).toBe("warning");
    expect(
      screen.getByText("Position notifications temporarily unavailable"),
    ).toBeTruthy();
  });

  it("stale-price banner has no action buttons", () => {
    render(
      <Wrapper>
        <PositionNotificationBanner
          statusOverride="stale-price"
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    expect(screen.queryByText("Add Collateral")).toBeNull();
    expect(screen.queryByText("Repay Debt")).toBeNull();
    expect(screen.queryByText("Apply Optimal Order")).toBeNull();
  });

  it("defers the live stale-price banner until the grace window elapses", () => {
    vi.useFakeTimers();
    // Live feed (no debug override) reports stale price.
    mockUsePositionNotifications.mockReturnValue({
      result: null,
      status: "stale-price",
      isLoading: false,
      reorderVerificationContext: null,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner onDeposit={onDeposit} onRepay={onRepay} />
      </Wrapper>,
    );

    // Within the grace window: nothing shown (no banner, no stale price used).
    expect(
      screen.queryByText("Position notifications temporarily unavailable"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(STALE_PRICE_BANNER_GRACE_MS);
    });

    // Condition persisted past the window → banner surfaces.
    expect(
      screen.getByText("Position notifications temporarily unavailable"),
    ).toBeTruthy();

    vi.useRealTimers();
  });

  it("renders the dust notice as a soft (info) banner with no actions", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "dust",
          title: "Position too small for vault analysis",
          detail:
            "Below $1,000 the cascade simplifies — all vaults are shown as one liquidation event.",
        },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("soft");
    expect(banner.dataset.variant).toBe("info");
    expect(
      screen.getByText("Position too small for vault analysis"),
    ).toBeTruthy();
    expect(screen.queryByText("Add Collateral")).toBeNull();
    expect(screen.queryByText("Apply Optimal Order")).toBeNull();
  });

  it("keeps a later weird-params advisory visible after the dust notice was dismissed", () => {
    // Dismissal is per warning type: dismissing dust must not suppress a
    // different advisory the position later transitions into while mounted.
    const queryClient = makeQueryClient();
    const dust = makeBaseResult({
      warnings: [
        {
          type: "dust",
          title: "Position too small for vault analysis",
          detail:
            "Below $1,000 the cascade simplifies — all vaults are shown as one liquidation event.",
        },
      ],
    });
    const weirdParams = makeBaseResult({
      warnings: [
        {
          type: "weird-params",
          title: "Protocol parameters don't compute",
          detail: "THF must be greater than expected HF.",
          tone: "soft",
        },
      ],
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <PositionNotificationBanner
          result={dust}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByTestId("position-notification-banner")).toBeNull();

    // Same mounted banner, position now reads as a weird-params advisory.
    rerender(
      <QueryClientProvider client={queryClient}>
        <PositionNotificationBanner
          result={weirdParams}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("position-notification-banner")).toBeTruthy();
    expect(screen.getByText("Protocol parameters don't compute")).toBeTruthy();
  });

  it("hides the dust notice after its dismiss control is clicked", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "dust",
          title: "Position too small for vault analysis",
          detail:
            "Below $1,000 the cascade simplifies — all vaults are shown as one liquidation event.",
        },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    expect(screen.getByTestId("position-notification-banner")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    expect(screen.queryByTestId("position-notification-banner")).toBeNull();
  });

  it("renders an orange cliff with the generic 'Add sacrificial vault' CTA and pre-fills the amount", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "First liquidation takes everything",
          detail:
            "With your current vaults, a single liquidation event seizes all your BTC — nothing remains protected behind it.",
          suggestion:
            "Adding a 0.72 BTC sacrificial vault creates a buffer — it gets liquidated first, your existing BTC survives.",
        },
      ],
      suggestedNewVaultBtc: 0.72,
    });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("yellow");
    expect(banner.dataset.variant).toBe("warning");
    // Affordable cliff (CLIFF A): info-icon suggestion box, no "Suggestion" label.
    expect(screen.getByTestId("suggestion-info-icon")).toBeTruthy();
    expect(screen.queryByText("Suggestion")).toBeNull();
    // Generic label per Figma; the amount lives in the suggestion text.
    fireEvent.click(screen.getByText("Add sacrificial vault"));
    expect(onDeposit).toHaveBeenCalledWith("0.72");
  });

  it("renders an unaffordable cliff (CLIFF B) with a SUGGESTION label and no CTA", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "First liquidation takes everything",
          detail:
            "With your current vaults, a single liquidation event seizes all your BTC — nothing remains protected behind it.",
          suggestion:
            "To enable partial liquidation, withdraw your 2.00 BTC and re-deposit as two smaller vaults: 1.28 BTC sacrificial + 0.72 BTC protected. Alternatively: add collateral or repay debt to manage the liquidation.",
        },
      ],
      // No affordable add → no CTA, "SUGGESTION"-labelled box.
      suggestedNewVaultBtc: null,
    });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("yellow");
    expect(banner.dataset.variant).toBe("warning");
    expect(screen.getByText("Suggestion")).toBeTruthy();
    expect(screen.queryByTestId("suggestion-info-icon")).toBeNull();
    expect(screen.queryByText("Add sacrificial vault")).toBeNull();
  });

  it("keeps the sacrificial CTA (secondary) when a single-vault cliff is also urgent", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "urgent",
          title: "Liquidation is 3.0% away",
          detail: "BTC needs to drop only 3%.",
        },
        {
          type: "cliff",
          title: "First liquidation takes everything",
          detail:
            "With your current vaults, a single liquidation event seizes all your BTC — nothing remains protected behind it.",
          suggestion:
            "Adding a 0.72 BTC sacrificial vault creates a buffer — it gets liquidated first, your existing BTC survives.",
        },
      ],
      suggestedNewVaultBtc: 0.72,
    });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("red");
    // Safety actions still lead, and the pre-filled cliff CTA is still offered.
    expect(screen.getByText("Add Collateral")).toBeTruthy();
    expect(screen.getByText("Repay Debt")).toBeTruthy();
    fireEvent.click(screen.getByText("Add sacrificial vault"));
    expect(onDeposit).toHaveBeenCalledWith("0.72");
  });

  it("renders an Add-a-vault CTA for a rebalance with the rebalance amount", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "rebalance",
          title: "Undersized sacrificial vault",
          detail: "Group 1 over-seizes.",
          suggestion: "Add a 0.38 BTC vault.",
        },
      ],
      suggestedRebalanceVaultBtc: 0.38,
    });
    renderBanner(result, onDeposit, onRepay);

    fireEvent.click(screen.getByText("Add a 0.38 BTC vault"));
    expect(onDeposit).toHaveBeenCalledWith("0.38");
  });

  it("renders too-many-vaults as an orange warning with no action button", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "too-many-vaults",
          title: "Too many vaults to optimize",
          detail: "You have 18 vaults.",
          suggestion:
            "Consider consolidating smaller vaults into fewer larger ones.",
        },
      ],
    });
    renderBanner(result, onDeposit, onRepay);

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("yellow");
    expect(banner.dataset.variant).toBe("warning");
    expect(screen.queryByText(/Add a .* BTC vault/)).toBeNull();
    expect(screen.queryByText("Apply Optimal Order")).toBeNull();
  });
});
