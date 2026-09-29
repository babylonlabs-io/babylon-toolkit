/**
 * Batch withdrawal (issue #2432). The flow now opens on a selection step, so
 * these pin what that step decides: which vaults start checked, what the action
 * totals, and when it refuses to hand a selection to Review.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
import type { CollateralVaultEntry } from "@/types/collateral";

import WithdrawFlow, { type WithdrawFlowProps } from "../index";

// The shared v3 shell renders the app top bar, whose graph reaches
// wallet-connector and can't be transformed here.
vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({
    open,
    onBack,
    children,
  }: {
    open: boolean;
    onBack?: () => void;
    children: ReactNode;
  }) =>
    open ? (
      <div>
        {onBack && <button type="button" aria-label="Back" onClick={onBack} />}
        {children}
      </div>
    ) : null,
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  ProtocolParamsProvider: ({ children }: { children: ReactNode }) => children,
  useProtocolParamsContext: () => ({
    minVpCommissionBps: 250,
    getOffchainParamsByVersion: () => undefined,
    config: { offchainParams: { timelockAssert: 144 } },
  }),
}));

vi.mock("@/hooks/useNetworkFees", () => ({
  useNetworkFees: () => ({ defaultFeeRate: 3 }),
}));

vi.mock("@/applications/aave/hooks/useWithdrawHubBlockMessage", () => ({
  useWithdrawHubBlockMessage: () => null,
}));

vi.mock("@/applications/aave/hooks/useWithdrawCollateralTransaction", () => ({
  useWithdrawCollateralTransaction: vi.fn(),
}));

const FIRST_VAULT = "0xaaa";
const SECOND_VAULT = "0xbbb";

const VAULTS: CollateralVaultEntry[] = [
  {
    id: "1",
    vaultId: FIRST_VAULT,
    amountBtc: 0.6,
    addedAt: 0,
    inUse: true,
    lifecycle: "active",
    providerAddress: "0xvp",
    providerName: "VP",
    liquidationIndex: 0,
  },
  {
    id: "2",
    vaultId: SECOND_VAULT,
    amountBtc: 0.2,
    addedAt: 0,
    inUse: true,
    lifecycle: "active",
    providerAddress: "0xvp",
    providerName: "VP",
    liquidationIndex: 1,
  },
];

function renderFlow(overrides: Partial<WithdrawFlowProps> = {}) {
  const executeWithdraw = vi.fn(async () => true);
  vi.mocked(useWithdrawCollateralTransaction).mockReturnValue({
    executeWithdraw,
    isProcessing: false,
    error: null,
  } as unknown as ReturnType<typeof useWithdrawCollateralTransaction>);

  const props: WithdrawFlowProps = {
    open: true,
    onClose: vi.fn(),
    collateralVaults: VAULTS,
    collateralBtc: 0.8,
    collateralValueUsd: 80_000,
    currentHealthFactor: null,
    preSelectedVaultIds: [FIRST_VAULT],
    ...overrides,
  };
  const { rerender } = render(<WithdrawFlow {...props} />);
  return {
    executeWithdraw,
    rerenderWith: (next: Partial<WithdrawFlowProps>) =>
      rerender(<WithdrawFlow {...props} {...next} />),
  };
}

const rowCheckbox = (vaultId: string) =>
  screen.getByTestId(`withdraw-select-row-${vaultId}`);
const continueButton = () => screen.getByTestId("withdraw-select-continue");
const acknowledgeCheckbox = () =>
  screen.getByTestId("withdraw-select-acknowledge");

describe("WithdrawFlow selection step", () => {
  it("starts with only the vault whose row opened the flow checked", () => {
    renderFlow();

    expect(rowCheckbox(FIRST_VAULT)).toBeChecked();
    expect(rowCheckbox(SECOND_VAULT)).not.toBeChecked();
    expect(continueButton()).toHaveTextContent("Withdraw 0.6 sBTC");
  });

  it("adds a newly checked vault's amount to the action total", () => {
    renderFlow();

    fireEvent.click(rowCheckbox(SECOND_VAULT));

    expect(continueButton()).toHaveTextContent("Withdraw 0.8 sBTC");
  });

  it("refuses to continue once the last vault is unchecked", () => {
    renderFlow();

    fireEvent.click(rowCheckbox(FIRST_VAULT));

    expect(rowCheckbox(FIRST_VAULT)).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
  });

  it("blocks the selection and explains the floor when the projection breaches it", () => {
    // 0.6 of 0.8 BTC leaves a quarter of the collateral, so a health factor of
    // 2 projects to 0.5 — under the on-chain floor.
    renderFlow({ currentHealthFactor: 2 });

    expect(
      screen.getByText(/would drop your health factor below 1\.0/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Continue anyway")).not.toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it("holds the at-risk selection until the risk is acknowledged", () => {
    // Same quarter-of-collateral withdrawal: 4.2 projects to 1.05, inside the
    // at-risk band.
    renderFlow({ currentHealthFactor: 4.2 });

    expect(
      screen.getByText(/Your health factor will drop to 1\.05/),
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Continue anyway/ }));

    expect(continueButton()).toBeEnabled();
  });

  it("keeps the acknowledgement when the projection moves away and back to the same number", () => {
    renderFlow({ currentHealthFactor: 4.2 });
    fireEvent.click(acknowledgeCheckbox());
    expect(continueButton()).toBeEnabled();

    // Out of the at-risk band (0.8 of 0.8 BTC breaches the floor) and back to
    // the same 1.05 projection: the tick covers that displayed value, and it
    // is the value on screen again.
    fireEvent.click(rowCheckbox(SECOND_VAULT));
    fireEvent.click(rowCheckbox(SECOND_VAULT));

    expect(acknowledgeCheckbox()).toBeChecked();
    expect(continueButton()).toBeEnabled();
  });

  it("re-asks for the acknowledgement when a price move changes the projection", () => {
    const { rerenderWith } = renderFlow({ currentHealthFactor: 4.2 });
    fireEvent.click(acknowledgeCheckbox());
    expect(continueButton()).toBeEnabled();

    // The position's own health factor drifts while the step is open, with the
    // selection untouched: the same quarter-of-collateral withdrawal now shows
    // 1.07 instead of 1.05, still inside the at-risk band.
    rerenderWith({ currentHealthFactor: 4.3 });

    expect(acknowledgeCheckbox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
  });

  it("keeps the acknowledgement when a refetch moves the projection below the displayed precision", () => {
    const { rerenderWith } = renderFlow({ currentHealthFactor: 4.2 });
    fireEvent.click(acknowledgeCheckbox());

    // 4.204 projects to 1.051, which still reads as 1.05 — the number the user
    // ticked for has not changed.
    rerenderWith({ currentHealthFactor: 4.204 });

    expect(acknowledgeCheckbox()).toBeChecked();
    expect(continueButton()).toBeEnabled();
  });

  it("blocks Confirm on Review until the moved projection is acknowledged again", () => {
    const { rerenderWith } = renderFlow({ currentHealthFactor: 4.2 });
    fireEvent.click(acknowledgeCheckbox());
    fireEvent.click(continueButton());

    rerenderWith({ currentHealthFactor: 4.3 });

    const reviewAcknowledge = screen.getByTestId("withdraw-review-acknowledge");
    expect(reviewAcknowledge).not.toBeChecked();
    expect(screen.getByTestId("withdraw-confirm-button")).toBeDisabled();

    fireEvent.click(reviewAcknowledge);

    expect(screen.getByTestId("withdraw-confirm-button")).toBeEnabled();
  });

  it("returns to Select from Review with the selection intact", () => {
    renderFlow();

    fireEvent.click(rowCheckbox(SECOND_VAULT));
    fireEvent.click(continueButton());
    expect(screen.getByText("Review Withdraw")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(rowCheckbox(FIRST_VAULT)).toBeChecked();
    expect(rowCheckbox(SECOND_VAULT)).toBeChecked();
    expect(continueButton()).toHaveTextContent("Withdraw 0.8 sBTC");
  });

  it("omits a vault that no longer backs the position", () => {
    renderFlow({
      collateralVaults: [VAULTS[0], { ...VAULTS[1], inUse: false }],
    });

    expect(rowCheckbox(FIRST_VAULT)).toBeInTheDocument();
    expect(
      screen.queryByTestId(`withdraw-select-row-${SECOND_VAULT}`),
    ).not.toBeInTheDocument();
  });

  it("carries every selected vault into the review and the withdraw call", async () => {
    const { executeWithdraw } = renderFlow();

    fireEvent.click(rowCheckbox(SECOND_VAULT));
    fireEvent.click(continueButton());

    expect(screen.getByText("Review Withdraw")).toBeInTheDocument();
    expect(screen.getByText("0.8 sBTC")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("withdraw-confirm-button"));

    await vi.waitFor(() =>
      expect(executeWithdraw).toHaveBeenCalledWith([FIRST_VAULT, SECOND_VAULT]),
    );
  });
});
