/**
 * Tests for the click-time application-status gate on the escape hatch.
 *
 * The confirm screen's own check reads the cache as of paint, so it is
 * `undefined` — button enabled — for the whole first round-trip after the modal
 * mounts. These cover what happens when the answer lands only after the click:
 * a CONFIRMED inactive application must stop before the BTC wallet is ever
 * opened, and anything else must let the withdrawal through, because this is
 * the only recovery left for a swept peg-in.
 */

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

vi.mock("@babylonlabs-io/wallet-connector", () => ({
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

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        // The status query pins `retry: 1`; without a zero delay the fail-open
        // case would sit through the default backoff.
        defaultOptions: { queries: { retryDelay: 0 } },
      }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderModal() {
  render(
    <Wrapper>
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
  vi.clearAllMocks();
});

describe("EmergencyWithdrawModal — application status before the reveal", () => {
  it("never opens the BTC wallet when the application resolves inactive after the click", async () => {
    // Resolve only after the click, reproducing a click inside the first
    // round-trip — the window the render-time gate cannot cover.
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
  });

  it("derives the secret and submits when the application is active", async () => {
    vi.mocked(isVaultApplicationActive).mockResolvedValue(true);

    renderModal();

    await waitFor(() => {
      expect(handleActivation).toHaveBeenCalledOnce();
    });
    expect(deriveHtlcSecretHex).toHaveBeenCalledOnce();
  });

  it("still submits when the application status read fails", async () => {
    // Fail OPEN: an RPC blip must not strand a depositor whose peg-in is
    // already swept. The pre-broadcast simulation refuses to sign into a
    // genuinely inactive application.
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
