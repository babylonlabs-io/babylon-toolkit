/**
 * Vaults summary strip (issue #2068). The populated /vaults page keeps its
 * Deposit CTA in this card, so the blocked-deposit state has to reach it — and
 * only it: freeze blocks entry, not the reorder the user can still perform.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { VaultsSummaryCard } from "../VaultsSummaryCard";

const onDeposit = vi.fn();
const onReorder = vi.fn();

function renderCard(overrides: Record<string, unknown> = {}) {
  return render(
    <VaultsSummaryCard
      totalCollateralBtc="1.1 BTC"
      totalCollateralUsd="$90,600 USD"
      activeVaultsCount={3}
      liquidationOrder={null}
      healthFactor={1.02}
      healthFactorStatus="danger"
      onDeposit={onDeposit}
      isDepositDisabled={false}
      onReorder={onReorder}
      isReorderDisabled={false}
      {...overrides}
    />,
  );
}

describe("VaultsSummaryCard", () => {
  it("keeps the Deposit CTA usable while deposits are allowed", () => {
    renderCard();

    const deposit = screen.getByRole("button", {
      name: COPY.vaults.empty.depositAction,
    });
    expect(deposit).toBeEnabled();
    fireEvent.click(deposit);
    expect(onDeposit).toHaveBeenCalledTimes(1);
  });

  it("greys the Deposit CTA out while deposits are blocked, leaving Reorder alone", () => {
    renderCard({ isDepositDisabled: true });

    const deposit = screen.getByRole("button", {
      name: COPY.vaults.empty.depositAction,
    });
    expect(deposit).toBeDisabled();

    expect(
      screen.getByRole("button", { name: COPY.vaults.actions.reorder }),
    ).toBeEnabled();
  });
});
