import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalculatorResult } from "@/applications/aave/positionNotifications";

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

vi.mock("@babylonlabs-io/config", () => ({
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

// Mock core-ui to avoid ESM transformation issues in test environment
vi.mock("@babylonlabs-io/core-ui", () => ({
  Text: (props: Record<string, unknown>) => {
    const { children, ...rest } = props;
    return <span {...rest}>{children as ReactNode}</span>;
  },
  Button: (props: Record<string, unknown>) => {
    const { children, ...rest } = props;
    return <button {...rest}>{children as ReactNode}</button>;
  },
  Hint: (props: Record<string, unknown>) => {
    const { children, tooltip } = props;
    return (
      <div data-testid="hint" data-tooltip={tooltip as string}>
        {children as ReactNode}
      </div>
    );
  },
  ResponsiveDialog: (props: Record<string, unknown>) =>
    props.open ? <div>{props.children as ReactNode}</div> : null,
  DialogHeader: (props: Record<string, unknown>) => (
    <div>{props.title as string}</div>
  ),
  DialogBody: (props: Record<string, unknown>) => (
    <div>{props.children as ReactNode}</div>
  ),
  DialogFooter: (props: Record<string, unknown>) => (
    <div>{props.children as ReactNode}</div>
  ),
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

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => ({
    result: null,
    status: "ready" as const,
    isLoading: false,
  }),
}));

vi.mock("@/config/featureFlags", () => ({
  default: { isPositionNotificationsEnabled: true },
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
    recommendedSacrificialBtc: 0.29,
    warnings: [],
    isFullLiquidation: false,
    suggestedVaultOrder: null,
    suggestedNewVaultBtc: null,
    suggestedRebalanceVaultBtc: null,
    suggestedRebalanceOrder: null,
    rebalanceImprovementBtc: 0,
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PositionNotificationBanner", () => {
  const onDeposit = vi.fn();
  const onRepay = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when result is null", () => {
    const { container } = render(
      <Wrapper>
        <PositionNotificationBanner
          result={null}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders green banner when no warnings", () => {
    const result = makeBaseResult();

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("green");
    expect(screen.getByText("Position optimally structured")).toBeTruthy();
  });

  it("renders red banner for cliff warning without reorder fix", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "No backup vault",
          detail: "Your entire position will be seized.",
          suggestion: "Add a 0.29 BTC sacrificial vault",
        },
      ],
      suggestedNewVaultBtc: 0.29,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("red");
    expect(screen.getByText("No backup vault")).toBeTruthy();
    expect(screen.getByText(/Add 0.2900 BTC Collateral/)).toBeTruthy();
    expect(screen.getByText("Repay Debt")).toBeTruthy();
  });

  it("renders red banner for cliff with reorder fix and shows Apply Suggested Order", () => {
    const suggestedOrder = [
      { id: "v-2", name: "Vault 2", btc: 0.6 },
      { id: "v-1", name: "Vault 1", btc: 0.1 },
    ];
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "All vaults seized — reordering fixes this",
          detail: "Reorder to protect your position.",
        },
      ],
      suggestedVaultOrder: suggestedOrder,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("red");
    expect(screen.getByText("Apply Suggested Order")).toBeTruthy();
    expect(screen.queryByText("Repay Debt")).toBeNull();
  });

  it("renders yellow banner for reorder warning", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "reorder",
          title: "Better vault ordering reduces seizure",
          detail: "Current order seizes more BTC than optimal.",
        },
      ],
      suggestedVaultOrder: [
        { id: "v-2", name: "Vault 2", btc: 0.65 },
        { id: "v-1", name: "Vault 1", btc: 0.35 },
      ],
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("yellow");
    expect(screen.getByText("Apply Suggested Order")).toBeTruthy();
  });

  it("renders yellow banner for rebalance with suggested amount", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "rebalance",
          title: "Vault sizes can be improved",
          detail: "Over-seizure exceeds protected BTC.",
        },
      ],
      suggestedRebalanceVaultBtc: 0.14,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("yellow");
    expect(screen.getByText(/Add 0.1400 BTC Vault/)).toBeTruthy();
  });

  it("renders red banner for urgent warning", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "urgent",
          title: "Critical — liquidation in 3%",
          detail: "BTC needs to drop only 3%.",
        },
      ],
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("red");
    expect(screen.getByText("Add Collateral")).toBeTruthy();
    expect(screen.getByText("Repay Debt")).toBeTruthy();
  });

  it("renders all three action buttons when urgent + reorder warnings are present", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "urgent",
          title: "Critical — liquidation in 4.3%",
          detail: "BTC needs to drop only 4.33%.",
        },
        {
          type: "reorder",
          title: "Better vault ordering",
          detail: "Reordering reduces seizure.",
        },
      ],
      suggestedVaultOrder: [
        { id: "v-2", name: "Vault 2", btc: 0.6 },
        { id: "v-1", name: "Vault 1", btc: 0.1 },
      ],
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    expect(screen.getByText("Add Collateral")).toBeTruthy();
    expect(screen.getByText("Repay Debt")).toBeTruthy();
    expect(screen.getByText("Apply Suggested Order")).toBeTruthy();
  });

  it("calls onDeposit with suggested amount when Add Collateral is clicked", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "No backup vault",
          detail: "Seized.",
        },
      ],
      suggestedNewVaultBtc: 0.29,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText(/Add 0.2900 BTC Collateral/));
    expect(onDeposit).toHaveBeenCalledWith("0.2900");
  });

  it("calls onRepay when Repay Debt is clicked", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "urgent",
          title: "Critical",
          detail: "Near liquidation.",
        },
      ],
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText("Repay Debt"));
    expect(onRepay).toHaveBeenCalled();
  });

  it("calls executeReorder with correct vault IDs when Apply Suggested Order is clicked", () => {
    const suggestedOrder = [
      { id: "0xabc", name: "Vault 2", btc: 0.6 },
      { id: "0xdef", name: "Vault 1", btc: 0.1 },
    ];
    const result = makeBaseResult({
      warnings: [
        {
          type: "reorder",
          title: "Better ordering",
          detail: "Reorder reduces seizure.",
        },
      ],
      suggestedVaultOrder: suggestedOrder,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText("Apply Suggested Order"));
    expect(mockExecuteReorder).toHaveBeenCalledWith(["0xabc", "0xdef"]);
  });

  it("renders secondary warnings below primary", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "All vaults seized",
          detail: "No vault covers target.",
        },
        {
          type: "weird-params",
          title: "Unusual protocol parameters",
          detail: "Results may be unreliable.",
        },
      ],
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    expect(screen.getByText("All vaults seized")).toBeTruthy();
    expect(screen.getByText(/Unusual protocol parameters/)).toBeTruthy();
  });

  it("disables deposit button with tooltip when suggested amount exceeds balance", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "No backup vault",
          detail: "Seized.",
        },
      ],
      suggestedNewVaultBtc: 0.29,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
          btcBalanceBtc={0.1}
        />
      </Wrapper>,
    );

    const addButton = screen.getByText(/Add 0.2900 BTC Collateral/);
    expect(addButton).toHaveProperty("disabled", true);
    const hint = screen.getByTestId("hint");
    expect(hint.dataset.tooltip).toBe("Insufficient BTC balance");
  });

  it("enables deposit button when balance is sufficient", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "No backup vault",
          detail: "Seized.",
        },
      ],
      suggestedNewVaultBtc: 0.29,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
          btcBalanceBtc={1.0}
        />
      </Wrapper>,
    );

    const addButton = screen.getByText(/Add 0.2900 BTC Collateral/);
    expect(addButton).toHaveProperty("disabled", false);
    expect(screen.queryByTestId("hint")).toBeNull();
  });

  it("enables deposit button when balance is undefined", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "cliff",
          title: "No backup vault",
          detail: "Seized.",
        },
      ],
      suggestedNewVaultBtc: 0.29,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const addButton = screen.getByText(/Add 0.2900 BTC Collateral/);
    expect(addButton).toHaveProperty("disabled", false);
    expect(screen.queryByTestId("hint")).toBeNull();
  });

  it("disables rebalance button when suggested amount exceeds balance", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "rebalance",
          title: "Vault sizes can be improved",
          detail: "Over-seizure.",
        },
      ],
      suggestedRebalanceVaultBtc: 0.14,
    });

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
          btcBalanceBtc={0.05}
        />
      </Wrapper>,
    );

    const addButton = screen.getByText(/Add 0.1400 BTC Vault/);
    expect(addButton).toHaveProperty("disabled", true);
    const hint = screen.getByTestId("hint");
    expect(hint.dataset.tooltip).toBe("Insufficient BTC balance");
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
    expect(
      screen.getByText("Position notifications temporarily unavailable"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "BTC price data is stale or unavailable. Notifications will resume when fresh price data is available.",
      ),
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
    expect(screen.queryByText("Apply Suggested Order")).toBeNull();
  });

  it("stale-price status overrides a valid result", () => {
    const result = makeBaseResult();

    render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          statusOverride="stale-price"
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    const banner = screen.getByTestId("position-notification-banner");
    expect(banner.dataset.severity).toBe("yellow");
    expect(
      screen.getByText("Position notifications temporarily unavailable"),
    ).toBeTruthy();
    expect(screen.queryByText("Position optimally structured")).toBeNull();
  });

  it("renders nothing for dust (hidden severity)", () => {
    const result = makeBaseResult({
      warnings: [
        {
          type: "dust",
          title: "Dust position",
          detail: "Too small for analysis.",
        },
      ],
    });

    const { container } = render(
      <Wrapper>
        <PositionNotificationBanner
          result={result}
          onDeposit={onDeposit}
          onRepay={onRepay}
        />
      </Wrapper>,
    );

    expect(
      container.querySelector("[data-testid='position-notification-banner']"),
    ).toBeNull();
  });
});
