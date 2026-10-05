/**
 * ExpiredWithdrawButton — the states of the expired deposit's action: the
 * refund's three, plus the redeem for a deposit the PegIn spent. The gating
 * itself lives in useRefundRowAction and useClaimExpiredRowAction (shared with
 * the Vaults page's inactive row); these lock in what this row renders for
 * each of their answers.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import type { RefundRowAction } from "@/hooks/deposit/useRefundRowAction";

const refundRowActionMock = vi.hoisted(() => vi.fn());
const claimExpiredRowActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/deposit/useRefundRowAction", () => ({
  useRefundRowAction: (vaultId: string) => refundRowActionMock(vaultId),
}));
vi.mock("@/hooks/deposit/useClaimExpiredRowAction", () => ({
  useClaimExpiredRowAction: (vaultId: string) =>
    claimExpiredRowActionMock(vaultId),
}));

import { ExpiredWithdrawButton } from "../ExpiredWithdrawButton";

function renderButton(
  action: RefundRowAction,
  onWithdraw = vi.fn(),
  { redeemAvailable = false, onRedeem = vi.fn() } = {},
) {
  refundRowActionMock.mockReturnValue(action);
  claimExpiredRowActionMock.mockReturnValue(redeemAvailable);
  render(
    <ExpiredWithdrawButton
      vaultId="0xvault1"
      onWithdraw={onWithdraw}
      onRedeem={onRedeem}
    />,
  );
  return onWithdraw;
}

describe("ExpiredWithdrawButton", () => {
  it("performs the refund for that vault when it is available", () => {
    const onWithdraw = renderButton({ available: true, blockedTooltip: null });

    const button = screen.getByRole("button", {
      name: COPY.vaults.actions.withdraw,
    });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onWithdraw).toHaveBeenCalledWith("0xvault1");
  });

  it("renders a disabled control while the refund is blocked", () => {
    renderButton({ available: false, blockedTooltip: "Not matured yet" });

    expect(
      screen.getByRole("button", { name: COPY.vaults.actions.withdraw }),
    ).toBeDisabled();
  });

  it("renders nothing when the row has no refund to offer", () => {
    renderButton({ available: false, blockedTooltip: null });

    expect(
      screen.queryByRole("button", { name: COPY.vaults.actions.withdraw }),
    ).not.toBeInTheDocument();
  });

  it("asks about the vault it was given", () => {
    renderButton({ available: false, blockedTooltip: null });

    expect(refundRowActionMock).toHaveBeenCalledWith("0xvault1");
  });

  it("performs the redeem for that vault when the PegIn spent the deposit", () => {
    const onRedeem = vi.fn();
    renderButton({ available: false, blockedTooltip: null }, vi.fn(), {
      redeemAvailable: true,
      onRedeem,
    });

    expect(
      screen.queryByRole("button", { name: COPY.vaults.actions.withdraw }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.vaults.actions.redeem }),
    );
    expect(onRedeem).toHaveBeenCalledWith("0xvault1");
  });
});
