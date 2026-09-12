/** Check application status before a wallet prompt or recovery transaction. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isVaultApplicationActive } from "@/clients/eth-contract/application-status/query";
import { COPY } from "@/copy";
import { deriveHtlcSecretHex } from "@/services/vault/htlcSecretDerivation";
import type { VaultActivity } from "@/types/activity";

import { EmergencyWithdrawModal } from "../index";

// The shared v3 shell renders the app's top bar, whose graph reaches
// wallet-connector and can't be transformed here.
vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/clients/eth-contract/application-status/query", () => ({
  isVaultApplicationActive: vi.fn(),
}));

vi.mock("@/services/vault/htlcSecretDerivation", () => ({
  deriveHtlcSecretHex: vi.fn(async () => `0x${"ab".repeat(32)}`),
}));

const handleActivation = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/hooks/deposit/useActivationState", () => ({
  useActivationState: () => ({
    activating: false,
    activated: false,
    error: null,
    errorTerminal: false,
    handleActivation,
  }),
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => ({ protocol: null, aave: null }),
}));

const btcActionWallet = vi.hoisted(() => ({ connected: true, open: vi.fn() }));

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

function makeQueryClient() {
  return new QueryClient({
    // The status query pins `retry: 1`; without a zero delay the fail-open
    // case would sit through the default backoff.
    defaultOptions: { queries: { retryDelay: 0 } },
  });
}

function Wrapper({
  client,
  children,
}: {
  client?: QueryClient;
  children: ReactNode;
}) {
  const fallback = useMemo(makeQueryClient, []);
  return (
    <QueryClientProvider client={client ?? fallback}>
      {children}
    </QueryClientProvider>
  );
}

function renderModal(client?: QueryClient) {
  render(
    <Wrapper client={client}>
      <EmergencyWithdrawModal
        open
        activity={ACTIVITY}
        stuckStateDetected
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </Wrapper>,
  );
  // The confirm button only ever enables after the risk acknowledgement.
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByTestId("emergency-withdraw-button"));
}

beforeEach(() => {
  btcActionWallet.connected = true;
  vi.clearAllMocks();
});

describe("EmergencyWithdrawModal — application status before the reveal", () => {
  it("requests Bitcoin without deriving or submitting the withdrawal", async () => {
    btcActionWallet.connected = false;
    vi.mocked(isVaultApplicationActive).mockResolvedValue(true);
    renderModal();
    await waitFor(() => {
      expect(btcActionWallet.open).toHaveBeenCalledWith("BTC");
    });
    expect(deriveHtlcSecretHex).not.toHaveBeenCalled();
    expect(handleActivation).not.toHaveBeenCalled();
    expect(isVaultApplicationActive).toHaveBeenCalledTimes(1);
  });

  it("blocks a connected wallet when the application resolves inactive after the click", async () => {
    // Resolve after the click to check the first request window.
    let resolveStatus: (active: boolean) => void = () => {};
    vi.mocked(isVaultApplicationActive).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveStatus = resolve;
      }),
    );

    renderModal();
    resolveStatus(false);

    await waitFor(() => {
      expect(screen.getByTestId("emergency-withdraw-button")).toBeDisabled();
    });
    expect(
      screen.getByText(COPY.deposit.emergencyWithdraw.applicationInactive),
    ).toBeInTheDocument();
    expect(deriveHtlcSecretHex).not.toHaveBeenCalled();
    expect(handleActivation).not.toHaveBeenCalled();
    expect(btcActionWallet.open).not.toHaveBeenCalled();
  });

  it("does not request Bitcoin when the application is inactive", async () => {
    btcActionWallet.connected = false;
    vi.mocked(isVaultApplicationActive).mockResolvedValue(false);
    renderModal();
    await screen.findByText(COPY.deposit.emergencyWithdraw.applicationInactive);
    expect(deriveHtlcSecretHex).not.toHaveBeenCalled();
    expect(handleActivation).not.toHaveBeenCalled();
    expect(btcActionWallet.open).not.toHaveBeenCalled();
  });

  it("derives the secret and submits when the application is active", async () => {
    vi.mocked(isVaultApplicationActive).mockResolvedValue(true);

    renderModal();

    await waitFor(() => {
      expect(handleActivation).toHaveBeenCalledOnce();
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledOnce();
  });

  it("re-reads a stale cached status instead of trusting it", async () => {
    // A paused application must override the saved active status on reopen.
    const client = makeQueryClient();
    client.setQueryData(
      // Keep the key literal to detect a change to the query key.
      ["vaultApplicationStatus", ACTIVITY.id],
      true,
      { updatedAt: Date.now() - 60_000 },
    );
    vi.mocked(isVaultApplicationActive).mockResolvedValue(false);

    renderModal(client);

    await waitFor(() => {
      expect(isVaultApplicationActive).toHaveBeenCalled();
    });
    expect(deriveHtlcSecretHex).not.toHaveBeenCalled();
    expect(handleActivation).not.toHaveBeenCalled();
  });

  it("still submits when the application status read fails", async () => {
    // A failed read permits recovery. The transaction simulation checks again.
    vi.mocked(isVaultApplicationActive).mockRejectedValue(
      new Error("rpc unavailable"),
    );

    renderModal();

    await waitFor(() => {
      expect(handleActivation).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByText(COPY.deposit.emergencyWithdraw.applicationInactive),
    ).not.toBeInTheDocument();
  });
});
