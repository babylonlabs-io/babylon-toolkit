/**
 * VaultsLifecycleSections — the BTC-wallet gate on the pending rows.
 *
 * Every Bitcoin entry point on this page must ask an ETH-only session to
 * connect a BTC wallet instead of failing inside the flow. The multistepper is
 * not read-only (its resume screen broadcasts, its activation screen reads the
 * BTC connector), so both the row's "View details" and the advanced-withdraw
 * link inside it are gated.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import type { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { PEGIN_DISPLAY_LABELS } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { VaultsLifecycleSections } from "../VaultsLifecycleSections";

const ADVANCED_WITHDRAW_LABEL = "advanced withdraw";
const STEPPER_TESTID = "post-deposit-continuation";

const walletMock = vi.hoisted(() => ({
  requireBtcWallet: vi.fn(() => false),
}));
vi.mock("@/context/wallet", () => ({
  useRequireBtcWallet: () => ({
    btcConnected: false,
    requireBtcWallet: walletMock.requireBtcWallet,
  }),
}));

// The real provider blocks on a contract multicall; the rows under test read
// none of its values.
vi.mock("@/context/ProtocolParamsContext", () => ({
  ProtocolParamsProvider: ({ children }: { children: ReactNode }) => children,
}));

// No polling tree is mounted, which is the state a freshly loaded row is in:
// the row renders its loading status and offers "View details".
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: () => undefined,
}));

vi.mock("@/components/simple/PendingDepositModals", () => ({
  PendingDepositModals: () => null,
}));

vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

// The real chunk pulls bitcoinjs in through the lazy factory's ECC init.
vi.mock("@/utils/btc/ensureBtcEccInitialized", () => ({
  ensureBtcEccInitialized: () => Promise.resolve(),
}));
vi.mock("@/components/simple/PostDepositContinuationContent", () => ({
  PostDepositContinuationContent: ({
    vaultIds,
    onAdvancedWithdraw,
  }: {
    vaultIds: string[];
    onAdvancedWithdraw: (depositId: string) => void;
  }) => (
    <div data-testid={STEPPER_TESTID}>
      <button type="button" onClick={() => onAdvancedWithdraw(vaultIds[0])}>
        {ADVANCED_WITHDRAW_LABEL}
      </button>
    </div>
  ),
}));

const VAULT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

const activity: VaultActivity = {
  id: VAULT_ID,
  collateral: { amount: "0.5", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
  // Empty is the "no local Pre-PegIn tx" marker, which keeps the deposit a
  // batch of one.
  unsignedPrePeginTx: "",
  depositorWotsPkHash: "",
};

const handleWithdrawClick = vi.fn();

function buildDeposits(): ReturnType<typeof usePendingDeposits> {
  return {
    pendingActivities: [activity],
    expiredActivities: [],
    allActivities: [activity],
    vaultProviders: [],
    btcAddress: "",
    btcConnected: false,
    ethAddress: "0xdepositor",
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
    emergencyWithdrawModal: {
      withdrawing: null,
      handleWithdrawClick,
      handleClose: vi.fn(),
      handleSuccess: vi.fn(),
    },
    demo: null,
  };
}

const openStepper = async () => {
  fireEvent.click(
    screen.getByRole("button", { name: COPY.vaults.actions.viewDetails }),
  );
  return screen.findByTestId(STEPPER_TESTID);
};

describe("VaultsLifecycleSections — BTC wallet gate", () => {
  beforeEach(() => {
    walletMock.requireBtcWallet.mockReset();
    handleWithdrawClick.mockClear();
  });

  it("does not open the multistepper for a session without a BTC wallet", async () => {
    walletMock.requireBtcWallet.mockReturnValue(false);
    render(<VaultsLifecycleSections deposits={buildDeposits()} />);

    fireEvent.click(
      screen.getByRole("button", { name: COPY.vaults.actions.viewDetails }),
    );

    expect(walletMock.requireBtcWallet).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId(STEPPER_TESTID)).not.toBeInTheDocument(),
    );
  });

  it("keeps the multistepper open when the advanced withdraw link is refused", async () => {
    walletMock.requireBtcWallet.mockReturnValue(true);
    render(<VaultsLifecycleSections deposits={buildDeposits()} />);
    await openStepper();

    // The BTC wallet goes away (disconnected, locked, wrong account) while the
    // multistepper is open.
    walletMock.requireBtcWallet.mockReturnValue(false);
    fireEvent.click(
      screen.getByRole("button", { name: ADVANCED_WITHDRAW_LABEL }),
    );

    expect(handleWithdrawClick).not.toHaveBeenCalled();
    expect(screen.getByTestId(STEPPER_TESTID)).toBeInTheDocument();
  });

  it("swaps the multistepper for the withdraw modal once the wallet is available", async () => {
    walletMock.requireBtcWallet.mockReturnValue(true);
    render(<VaultsLifecycleSections deposits={buildDeposits()} />);
    await openStepper();

    fireEvent.click(
      screen.getByRole("button", { name: ADVANCED_WITHDRAW_LABEL }),
    );

    expect(handleWithdrawClick).toHaveBeenCalledWith(VAULT_ID, "advanced");
    expect(screen.queryByTestId(STEPPER_TESTID)).not.toBeInTheDocument();
  });
});
