/**
 * ClaimExpiredVaultModal — deriving the secret from the BTC wallet and handing
 * it to the redeem: one click, or two on a Ledger, with the success screen
 * held until the depositor acknowledges it. The redeem's own on-chain checks
 * live in `useClaimExpiredVault` and are stubbed here.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { captureFunnelFailure } from "@/infrastructure/telemetryEvents";
import { ContractStatus } from "@/models/peginStateMachine";
import { deriveHtlcSecretHex } from "@/services/vault/htlcSecretDerivation";
import type { VaultActivity } from "@/types/activity";

import { ClaimExpiredVaultModal } from "../index";

const SECRET = `0x${"ab".repeat(32)}`;

// The shared v3 shell renders the app's top bar, whose graph reaches
// wallet-connector and can't be transformed here.
vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/services/vault/htlcSecretDerivation", () => ({
  deriveHtlcSecretHex: vi.fn(async () => SECRET),
}));

const claimState = vi.hoisted(() => ({
  claimed: false,
  handleClaim: vi.fn(async () => {}),
}));
vi.mock("@/hooks/deposit/useClaimExpiredVault", () => ({
  useClaimExpiredVault: () => ({
    claiming: false,
    claimed: claimState.claimed,
    error: null,
    errorTerminal: false,
    handleClaim: claimState.handleClaim,
  }),
}));

const pollingResult = vi.hoisted(() => ({
  value: undefined as { peginState: { contractStatus: number } } | undefined,
}));
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: () => pollingResult.value,
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

vi.mock("@babylonlabs-io/wallet-connector", () => ({
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
  TELEMETRY_STAGE: { EXPIRED_VAULT_REDEEM: "activation.expired_redeem" },
}));

const ACTIVITY = {
  id: `0x${"11".repeat(32)}`,
  collateral: { amount: "0.01", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  unsignedPrePeginTx: "0x",
} as VaultActivity;

function renderModal(handlers = { onClose: vi.fn(), onSuccess: vi.fn() }) {
  const element = () => (
    <ClaimExpiredVaultModal
      open
      activity={ACTIVITY}
      onClose={handlers.onClose}
      onSuccess={handlers.onSuccess}
    />
  );
  const view = render(element());
  return { ...view, rerenderModal: () => view.rerender(element()), handlers };
}

function confirmButton() {
  return screen.getByRole("button", {
    name: COPY.deposit.claimExpired.confirmButton,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  claimState.claimed = false;
  pollingResult.value = undefined;
  btcActionWallet.connected = true;
  ledgerDevice.isLedgerVault = false;
});

describe("ClaimExpiredVaultModal", () => {
  it("derives the secret from the BTC wallet and hands it to the redeem", async () => {
    renderModal();

    fireEvent.click(confirmButton());

    await waitFor(() => {
      expect(claimState.handleClaim).toHaveBeenCalledWith(SECRET);
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: ACTIVITY,
        connectedBtcAddress: "bc1qtest",
      }),
    );
  });

  it("asks for the BTC wallet without deriving when none is connected", async () => {
    btcActionWallet.connected = false;
    renderModal();

    fireEvent.click(confirmButton());

    await waitFor(() => {
      expect(btcActionWallet.open).toHaveBeenCalledWith("BTC");
    });
    expect(deriveHtlcSecretHex).not.toHaveBeenCalled();
    expect(claimState.handleClaim).not.toHaveBeenCalled();
  });

  it("reports a failed derive under the expired-vault redeem stage", async () => {
    const failure = new Error("wallet refused to sign");
    vi.mocked(deriveHtlcSecretHex).mockRejectedValueOnce(failure);
    renderModal();

    fireEvent.click(confirmButton());

    await waitFor(() => {
      expect(captureFunnelFailure).toHaveBeenCalledWith(
        "activation.expired_redeem",
        failure,
        ACTIVITY.id,
      );
    });
    expect(claimState.handleClaim).not.toHaveBeenCalled();
  });

  it("never derives a secret once the indexer reports the vault redeemed", () => {
    pollingResult.value = {
      peginState: { contractStatus: ContractStatus.REDEEMED },
    };
    renderModal();

    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(deriveHtlcSecretHex).not.toHaveBeenCalled();
  });

  it("holds the success screen until Done, then reports success and closes", () => {
    const { rerenderModal, handlers } = renderModal();
    expect(confirmButton()).toBeInTheDocument();

    claimState.claimed = true;
    rerenderModal();
    expect(
      screen.getByText(COPY.deposit.claimExpired.success.heading),
    ).toBeInTheDocument();
    expect(handlers.onSuccess).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.deposit.claimExpired.success.doneButton,
      }),
    );
    expect(handlers.onSuccess).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});

describe("ClaimExpiredVaultModal — Ledger", () => {
  it("retrieves the secret, then redeems only after Continue", async () => {
    // The pause lets a depositor whose Ethereum account is on the same Ledger
    // switch from the Babylon Vault app to the Ethereum app.
    ledgerDevice.isLedgerVault = true;
    renderModal();

    fireEvent.click(confirmButton());

    await waitFor(() => {
      expect(
        screen.getByText(COPY.deposit.ledger.activationPause.hint),
      ).toBeInTheDocument();
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledOnce();
    expect(claimState.handleClaim).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.deposit.ledger.activationPause.continue,
      }),
    );

    await waitFor(() => {
      expect(claimState.handleClaim).toHaveBeenCalledWith(SECRET);
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

    fireEvent.click(confirmButton());
    await waitFor(() => {
      expect(
        screen.getByText(COPY.deposit.errors.deviceDisconnected.body),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: COPY.deposit.ledger.reconnectButton }),
    );

    await waitFor(() => {
      expect(deriveHtlcSecretHex).toHaveBeenCalledTimes(2);
    });
    expect(ledgerDevice.reconnect).toHaveBeenCalledOnce();
  });
});
