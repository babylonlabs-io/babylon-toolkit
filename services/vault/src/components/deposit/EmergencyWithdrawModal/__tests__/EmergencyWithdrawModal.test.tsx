/** The confirm handler: wallet checks, secret derivation and submission. */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { deriveHtlcSecretHex } from "@/services/vault/htlcSecretDerivation";
import type { VaultActivity } from "@/types/activity";
import type { ActivationFailureKind } from "@/utils/errors";

import { EmergencyWithdrawModal } from "../index";

// The shared v3 shell renders the app's top bar, whose graph reaches
// wallet-connector and can't be transformed here.
vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/services/vault/htlcSecretDerivation", () => ({
  deriveHtlcSecretHex: vi.fn(async () => `0x${"ab".repeat(32)}`),
}));

const handleActivation = vi.hoisted(() => vi.fn(async () => {}));
const activationState = vi.hoisted(() => ({
  outcome: null as "activated" | "returned" | "withdrawn" | null,
  error: null as string | null,
  errorOutcomeUnknown: false,
  errorKind: null as ActivationFailureKind | null,
}));
vi.mock("@/hooks/deposit/useActivationState", () => ({
  useActivationState: () => ({
    activating: false,
    outcome: activationState.outcome,
    error: activationState.error,
    errorTerminal: false,
    errorOutcomeUnknown: activationState.errorOutcomeUnknown,
    errorKind: activationState.errorKind,
    handleActivation,
  }),
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => ({ protocol: null, aave: null }),
}));

const btcActionWallet = vi.hoisted(() => ({ connected: true, open: vi.fn() }));

const ledgerDevice = vi.hoisted(() => ({
  isLedgerVault: false,
  appWait: { status: "ready" } as const,
  cancelAppWait: vi.fn(),
  reconnect: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useLedgerVaultDevice", () => ({
  useLedgerVaultDevice: () => ledgerDevice,
}));

vi.mock("@babylonlabs-io/wallet-connector/btc-eth", () => ({
  useWidgetState: () => ({ visible: false }),
  useBTCWallet: () => ({ connected: btcActionWallet.connected }),
  useWalletConnect: () => ({ connected: true, open: btcActionWallet.open }),
  useChainConnector: () => ({
    connectedWallet: {
      id: "test-btc-wallet",
      provider: {},
      account: { address: "bc1qtest" },
    },
  }),
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({ connected: btcActionWallet.connected }),
  useETHWallet: () => ({ address: "0xdepositor" }),
}));

vi.mock("@/infrastructure/telemetryEvents", () => ({
  captureFunnelFailure: vi.fn(),
  TELEMETRY_STAGE: { ACTIVATION_SECRET: "activation_secret" },
}));

const ACTIVITY: VaultActivity = {
  id: `0x${"11".repeat(32)}`,
  collateral: { amount: "0.01", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  displayLabel: "Pending",
  unsignedPrePeginTx: "0x",
  depositorWotsPkHash: "0x",
} as VaultActivity;

function renderModal() {
  render(
    <EmergencyWithdrawModal
      open
      activity={ACTIVITY}
      stuckProof="proven"
      splitProtectionLost={false}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
  // The confirm button only ever enables after the risk acknowledgement.
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByTestId("emergency-withdraw-button"));
}

beforeEach(() => {
  activationState.outcome = null;
  activationState.error = null;
  activationState.errorOutcomeUnknown = false;
  activationState.errorKind = null;
  btcActionWallet.connected = true;
  ledgerDevice.isLedgerVault = false;
  vi.clearAllMocks();
});

describe("EmergencyWithdrawModal — success", () => {
  it("switches from the confirm screen to the success screen once the withdrawal lands", () => {
    // A fresh element per render: React skips a rerender of the same one.
    const modal = () => (
      <EmergencyWithdrawModal
        open
        activity={ACTIVITY}
        stuckProof="proven"
        splitProtectionLost={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const { rerender } = render(modal());
    expect(screen.getByTestId("emergency-withdraw-button")).toBeInTheDocument();

    activationState.outcome = "withdrawn";
    rerender(modal());

    expect(
      screen.getByText(COPY.deposit.emergencyWithdraw.success.heading),
    ).toBeInTheDocument();
  });
});

describe("EmergencyWithdrawModal — outcome unknown", () => {
  it("shows a withdraw the wallet may have broadcast as a status-unknown warning with the action disabled", () => {
    // Not the classified constant: the kind, not the text, picks the body.
    activationState.error = "The wallet lost track of the send";
    activationState.errorOutcomeUnknown = true;
    activationState.errorKind = "other";
    render(
      <EmergencyWithdrawModal
        open
        activity={ACTIVITY}
        stuckProof="proven"
        splitProtectionLost={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));

    expect(
      screen.getByText(COPY.deposit.errors.sendOutcomeUnknown.body),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The wallet lost track of the send"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("emergency-withdraw-button")).toBeDisabled();
  });

  it("shows an unconfirmed withdraw's own message instead of the send-unknown body", () => {
    // Not the copy constant: the kind, not the text, picks the body.
    activationState.error = "Withdraw mined without a redeem log";
    activationState.errorOutcomeUnknown = true;
    activationState.errorKind = "withdraw-unconfirmed";
    render(
      <EmergencyWithdrawModal
        open
        activity={ACTIVITY}
        stuckProof="proven"
        splitProtectionLost={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Withdraw mined without a redeem log"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.errors.sendOutcomeUnknown.body),
    ).not.toBeInTheDocument();
  });
});

describe("EmergencyWithdrawModal — before the reveal", () => {
  it("requests Bitcoin without deriving or submitting the withdrawal", async () => {
    btcActionWallet.connected = false;
    renderModal();
    await waitFor(() => {
      expect(btcActionWallet.open).toHaveBeenCalledWith("BTC");
    });
    expect(deriveHtlcSecretHex).not.toHaveBeenCalled();
    expect(handleActivation).not.toHaveBeenCalled();
  });

  it("derives the secret and submits once acknowledged and confirmed", async () => {
    renderModal();

    await waitFor(() => {
      expect(handleActivation).toHaveBeenCalledOnce();
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledOnce();
  });

  it("shows the original-account guidance when secret recovery fails", async () => {
    vi.mocked(deriveHtlcSecretHex).mockRejectedValueOnce(
      new Error("Secret recovery failed", {
        cause: { code: "WALLET_ACCOUNT_NOT_SUPPORTED" },
      }),
    );
    renderModal();
    expect(
      await screen.findByText(
        COPY.deposit.payoutSignatureErrors.walletAccountNotSupported.message,
      ),
    ).toBeInTheDocument();
    expect(handleActivation).not.toHaveBeenCalled();
  });

  it("derives and submits once when a second click lands before the re-render", async () => {
    render(
      <EmergencyWithdrawModal
        open
        activity={ACTIVITY}
        stuckProof="proven"
        splitProtectionLost={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    const button = screen.getByTestId("emergency-withdraw-button");

    // Both clicks inside one act: the second runs against the render the
    // first one has not yet replaced, so the button is still enabled.
    act(() => {
      button.click();
      button.click();
    });

    await waitFor(() => {
      expect(handleActivation).toHaveBeenCalledOnce();
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledOnce();
  });
});

describe("EmergencyWithdrawModal — Ledger", () => {
  it("retrieves the secret, then submits only after Continue", async () => {
    // The pause lets a depositor whose Ethereum account is on the same Ledger
    // switch from the Babylon Vault app to the Ethereum app.
    ledgerDevice.isLedgerVault = true;
    renderModal();

    await waitFor(() => {
      expect(
        screen.getByText(COPY.deposit.ledger.recoveryActivationPause.hint),
      ).toBeInTheDocument();
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledOnce();
    expect(handleActivation).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue",
      }),
    );

    await waitFor(() => {
      expect(handleActivation).toHaveBeenCalledWith(`0x${"ab".repeat(32)}`);
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledOnce();
  });

  it("reconnects the device before retrying after a lost session", async () => {
    ledgerDevice.isLedgerVault = true;
    vi.mocked(deriveHtlcSecretHex).mockRejectedValueOnce(
      Object.assign(new Error("Ledger Vault is not connected"), {
        code: "DEVICE_DISCONNECTED",
      }),
    );

    renderModal();
    await waitFor(() => {
      expect(
        screen.getByText(COPY.deposit.errors.deviceDisconnected.body),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: COPY.deposit.ledger.reconnectButton }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("emergency-withdraw-button"));

    await waitFor(() => {
      expect(deriveHtlcSecretHex).toHaveBeenCalledTimes(2);
    });
    expect(ledgerDevice.reconnect).toHaveBeenCalledOnce();
  });
});
