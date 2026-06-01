import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PeginAction } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { PostDepositContinuationView } from "../PostDepositContinuationView";

const mockGetPollingResult = vi.hoisted(() => vi.fn());
const mockRefetch = vi.hoisted(() => vi.fn());

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({
    refetch: mockRefetch,
    getPollingResult: mockGetPollingResult,
  }),
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: () => ({
    config: { offchainParams: { minPrepeginDepth: 6 } },
    getOffchainParamsByVersion: () => undefined,
  }),
}));

vi.mock("../ActivationGate", () => ({
  ActivationGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/deposit/depositFlowSteps", () => ({
  DepositFlowStep: {
    AWAIT_BTC_CONFIRMATION: "AWAIT_BTC_CONFIRMATION",
    ACTIVATE_VAULT: "ACTIVATE_VAULT",
    COMPLETED: "COMPLETED",
  },
}));

vi.mock("@/models/peginStateMachine", () => ({
  PeginAction: {
    SUBMIT_WOTS_KEY: "SUBMIT_WOTS_KEY",
    SIGN_PAYOUT_TRANSACTIONS: "SIGN_PAYOUT_TRANSACTIONS",
    ACTIVATE_VAULT: "ACTIVATE_VAULT",
    NONE: "NONE",
  },
  ContractStatus: {
    PENDING: 0,
    VERIFIED: 1,
    ACTIVE: 2,
    REDEEMED: 3,
    LIQUIDATED: 4,
    INVALID: 5,
    DEPOSITOR_WITHDRAWN: 6,
    EXPIRED: 7,
  },
  LocalStorageStatus: {
    PENDING: "pending",
    PAYOUT_SIGNED: "payout_signed",
    CONFIRMING: "confirming",
    CONFIRMED: "confirmed",
    REFUND_BROADCAST: "refund_broadcast",
  },
  getPeginDisplayStep: vi.fn(() => "AWAIT_BTC_CONFIRMATION"),
  // Mirrors the production set; ContractStatus literals match the mock above.
  USER_ACTIONABLE_PEGIN_ACTIONS: new Set([
    "SUBMIT_WOTS_KEY",
    "SIGN_PAYOUT_TRANSACTIONS",
    "ACTIVATE_VAULT",
  ]),
  isVaultPastActivation: (
    state: { contractStatus: number; localStatus?: string } | undefined,
  ) => {
    if (!state) return false;
    // VERIFIED + CONFIRMED is the optimistic post-activation state.
    if (state.contractStatus === 1 && state.localStatus === "confirmed") {
      return true;
    }
    // ACTIVE, REDEEMED, LIQUIDATED, DEPOSITOR_WITHDRAWN.
    return [2, 3, 4, 6].includes(state.contractStatus);
  },
  // Narrower than isVaultPastActivation: only ACTIVE or optimistic
  // VERIFIED+CONFIRMED count as "activated".
  isVaultActivated: (
    state: { contractStatus: number; localStatus?: string } | undefined,
  ) => {
    if (!state) return false;
    if (state.contractStatus === 2) return true; // ACTIVE
    return state.contractStatus === 1 && state.localStatus === "confirmed";
  },
}));

vi.mock("@/copy", () => ({
  COPY: {
    deposit: {
      resume: {
        activationSuccessMessage: "Deposit successfully submitted!",
        activationSuccessMessagePlural: "Your BTC Vaults have been activated.",
      },
      errors: {
        defaultTitle: "Transaction failed",
        genericBody: "Something went wrong during your deposit.",
        signingRejected: { title: "Signing rejected", body: "You rejected." },
        walletNotConnected: {
          title: "Wallet not connected",
          body: "Reconnect.",
        },
        walletAccountChanged: {
          title: "Wallet account changed",
          body: "Restart.",
        },
        utxosUnavailable: { title: "Funds unavailable", body: "In use." },
        broadcastFailed: { title: "Broadcast failed", body: "Try again." },
        providerNotFound: { title: "Provider not found", body: "Refresh." },
        versionMismatch: { title: "Parameters changed", body: "Restart." },
        insufficientEthForGas: {
          title: "Transaction failed",
          body: "Not enough ETH.",
        },
      },
    },
    common: {
      somethingWentWrong: { body: "Please close this and try again." },
      // formatting.ts builds FRIENDLY_MESSAGES from these at module load, and
      // depositErrors.ts (imported transitively here) pulls formatting.ts in.
      classifiedErrors: {
        userRejection: "You rejected the request.",
        insufficientFunds: "Not enough funds.",
        walletDisconnected: "Wallet disconnected.",
        unauthorized: "Not authorized.",
        chainSwitchFailed: "Could not switch network.",
        receiptTimeout: "Confirmation timed out.",
        network: "Network error.",
        staleDeploy: "Reload the page.",
      },
    },
  },
}));

vi.mock("../DepositProgressView", () => ({
  DepositProgressView: ({
    currentStep,
    error,
    isComplete,
    successMessage,
    onClose,
  }: {
    currentStep: string;
    error?: { title: string; body: string } | null;
    isComplete?: boolean;
    successMessage?: string;
    onClose: () => void;
  }) => (
    <div data-testid="progress-view">
      <span data-testid="step">{String(currentStep)}</span>
      <span data-testid="error">{error?.body ?? ""}</span>
      <span data-testid="complete">{String(!!isComplete)}</span>
      <span data-testid="success-message">{successMessage ?? ""}</span>
      <button type="button" data-testid="progress-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

function resumeMock(testId: string) {
  return ({
    activity,
    onSuccess,
    onClose,
  }: {
    activity: VaultActivity;
    onSuccess: () => void;
    onClose: () => void;
  }) => (
    <div data-testid={testId} data-vault={activity?.id}>
      <button
        type="button"
        data-testid={`${testId}-success`}
        onClick={onSuccess}
      >
        success
      </button>
      <button type="button" data-testid={`${testId}-close`} onClick={onClose}>
        close
      </button>
    </div>
  );
}

vi.mock("../ResumeDepositContent", () => ({
  ResumeWotsContent: resumeMock("wots"),
  ResumeSignContent: resumeMock("payout"),
  ResumeActivationContent: resumeMock("activate"),
}));

function activityWithId(id: string): VaultActivity {
  return {
    id,
    collateral: { amount: "0.01", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    displayLabel: "Pending",
    peginTxHash: "0xpegintx",
    unsignedPrePeginTx: "0xindexertx",
    depositorBtcPubkey: "0xdepositorpk",
  } as unknown as VaultActivity;
}

function resultWith(opts: {
  availableActions: string[];
  contractStatus?: number;
  localStatus?: string;
  displayVariant?: "pending" | "active" | "inactive" | "warning";
  message?: string;
}) {
  return {
    depositId: "x",
    loading: false,
    error: null,
    peginState: {
      contractStatus: opts.contractStatus ?? 0,
      localStatus: opts.localStatus,
      availableActions: opts.availableActions,
      displayVariant: opts.displayVariant ?? "pending",
      displayLabel: "x",
      message: opts.message,
    },
    isOwnedByCurrentWallet: true,
    depositorBtcPubkey: undefined,
  };
}

const ETH = "0xeth" as Address;

function renderView(
  overrides: Partial<{
    vaultIds: Hex[];
    activities: VaultActivity[];
    btcPublicKey: string | undefined;
    onClose: () => void;
  }> = {},
) {
  const vaultIds = overrides.vaultIds ?? ["0xvault0" as Hex];
  return render(
    <PostDepositContinuationView
      vaultIds={vaultIds}
      activities={
        overrides.activities ?? vaultIds.map((id) => activityWithId(id))
      }
      depositorEthAddress={ETH}
      btcPublicKey={
        "btcPublicKey" in overrides ? overrides.btcPublicKey : "btcpub"
      }
      onClose={overrides.onClose ?? vi.fn()}
    />,
  );
}

describe("PostDepositContinuationView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits while the vault has no actionable step", () => {
    mockGetPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.NONE] }),
    );
    const { getByTestId, queryByTestId } = renderView();
    expect(getByTestId("progress-view")).toBeTruthy();
    expect(queryByTestId("wots")).toBeNull();
    expect(queryByTestId("payout")).toBeNull();
    expect(queryByTestId("activate")).toBeNull();
  });

  it("auto-mounts WOTS submission when the VP needs the WOTS key", () => {
    mockGetPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.SUBMIT_WOTS_KEY] }),
    );
    expect(renderView().getByTestId("wots")).toBeTruthy();
  });

  it("auto-mounts payout signing when the VP is ready for signatures", () => {
    mockGetPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS] }),
    );
    expect(renderView().getByTestId("payout")).toBeTruthy();
  });

  it("waits (no payout) when the BTC public key is unavailable", () => {
    mockGetPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS] }),
    );
    const { queryByTestId, getByTestId } = renderView({
      btcPublicKey: undefined,
    });
    expect(queryByTestId("payout")).toBeNull();
    expect(getByTestId("progress-view")).toBeTruthy();
  });

  it("routes activation through the activation gate when the vault is verified", () => {
    mockGetPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.ACTIVATE_VAULT] }),
    );
    expect(renderView().getByTestId("activate")).toBeTruthy();
  });

  it("shows the completed view once the last vault finishes activating", () => {
    const VERIFIED = 1;
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          availableActions: [PeginAction.ACTIVATE_VAULT],
          contractStatus: VERIFIED,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const { getByTestId, rerender } = renderView({
      vaultIds: ["0xvault0" as Hex],
    });
    expect(getByTestId("activate")).toBeTruthy();

    // Activation submitted: the polling layer reports the vault as
    // VERIFIED + CONFIRMED, which drops ACTIVATE_VAULT from its actions.
    states.set(
      "0xvault0",
      resultWith({
        availableActions: [PeginAction.NONE],
        contractStatus: VERIFIED,
        localStatus: "confirmed",
      }),
    );
    rerender(
      <PostDepositContinuationView
        vaultIds={["0xvault0" as Hex]}
        activities={[activityWithId("0xvault0")]}
        depositorEthAddress={ETH}
        btcPublicKey="btcpub"
        onClose={vi.fn()}
      />,
    );

    // With no vault left to continue, the modal lands on the completed view
    // rather than parking on a generic "awaiting confirmation" step.
    expect(getByTestId("step").textContent).toBe("COMPLETED");
    expect(getByTestId("complete").textContent).toBe("true");
    // Single deposit → singular success copy.
    expect(getByTestId("success-message").textContent).toBe(
      "Deposit successfully submitted!",
    );
  });

  it("uses the plural success message when a whole split batch is complete", () => {
    const VERIFIED = 1;
    const done = () =>
      resultWith({
        availableActions: [PeginAction.NONE],
        contractStatus: VERIFIED,
        localStatus: "confirmed",
      });
    const states = new Map<string, ReturnType<typeof resultWith>>([
      ["0xvault0", done()],
      ["0xvault1", done()],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const { getByTestId } = renderView({
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    });

    // No candidate vault remains → complete view; a 2-vault batch reads plural.
    expect(getByTestId("step").textContent).toBe("COMPLETED");
    expect(getByTestId("success-message").textContent).toBe(
      "Your BTC Vaults have been activated.",
    );
  });

  it("advances to the next vault once the current vault finishes activating", () => {
    const VERIFIED = 1;
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          availableActions: [PeginAction.ACTIVATE_VAULT],
          contractStatus: VERIFIED,
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.ACTIVATE_VAULT],
          contractStatus: VERIFIED,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const props = {
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    };
    const { getByTestId, rerender } = renderView(props);
    expect(getByTestId("activate").getAttribute("data-vault")).toBe("0xvault0");

    // First vault's activation completes — its actions drop to NONE while the
    // optimistic CONFIRMED status is reflected by the polling layer.
    states.set(
      "0xvault0",
      resultWith({
        availableActions: [PeginAction.NONE],
        contractStatus: VERIFIED,
        localStatus: "confirmed",
      }),
    );
    rerender(
      <PostDepositContinuationView
        vaultIds={props.vaultIds}
        activities={props.activities}
        depositorEthAddress={ETH}
        btcPublicKey="btcpub"
        onClose={vi.fn()}
      />,
    );

    // The continuation must advance to the second vault, not stall on the first.
    expect(getByTestId("activate").getAttribute("data-vault")).toBe("0xvault1");
  });

  it("does not preempt the vault being driven when an earlier sibling becomes actionable", () => {
    // User is mid-signing vault 1 (payout); vault 0 is waiting on the VP.
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          availableActions: [PeginAction.NONE],
          contractStatus: 0,
          localStatus: "payout_signed",
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS],
          contractStatus: 0,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const props = {
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    };
    const { getByTestId, queryByTestId, rerender } = renderView(props);
    expect(getByTestId("payout").getAttribute("data-vault")).toBe("0xvault1");

    // A polling tick lands vault 0's VP verification → vault 0 becomes
    // actionable (ACTIVATE) while vault 1's signing is still in flight.
    states.set(
      "0xvault0",
      resultWith({
        availableActions: [PeginAction.ACTIVATE_VAULT],
        contractStatus: 1,
      }),
    );
    rerender(
      <PostDepositContinuationView
        vaultIds={props.vaultIds}
        activities={props.activities}
        depositorEthAddress={ETH}
        btcPublicKey="btcpub"
        onClose={vi.fn()}
      />,
    );

    // Must stay on vault 1 (don't unmount the in-progress signing) even though
    // vault 0 is now actionable and lower-indexed.
    expect(getByTestId("payout").getAttribute("data-vault")).toBe("0xvault1");
    expect(queryByTestId("activate")).toBeNull();

    // Once vault 1 finishes (no longer actionable), the held vault is released
    // and the view advances to the actionable vault 0 — proving the stickiness
    // isn't a permanent lock.
    states.set(
      "0xvault1",
      resultWith({
        availableActions: [PeginAction.NONE],
        contractStatus: 1,
        localStatus: "payout_signed",
      }),
    );
    rerender(
      <PostDepositContinuationView
        vaultIds={props.vaultIds}
        activities={props.activities}
        depositorEthAddress={ETH}
        btcPublicKey="btcpub"
        onClose={vi.fn()}
      />,
    );
    expect(getByTestId("activate").getAttribute("data-vault")).toBe("0xvault0");
  });

  it("re-selects the first actionable vault after passing through a wait state", () => {
    // Stickiness must not outlive a wait: once no vault is actionable, the held
    // pick is cleared, so when actions reappear the lowest-index actionable
    // vault wins — not whichever vault happened to be driven last.
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          availableActions: [PeginAction.NONE],
          contractStatus: 0,
          localStatus: "payout_signed",
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.SUBMIT_WOTS_KEY],
          contractStatus: 0,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const props = {
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    };
    // Fresh element each render — reusing one element object makes React bail
    // out of the re-render (no prop-identity change) and skip re-reading state.
    const view = () => (
      <PostDepositContinuationView
        vaultIds={props.vaultIds}
        activities={props.activities}
        depositorEthAddress={ETH}
        btcPublicKey="btcpub"
        onClose={vi.fn()}
      />
    );

    // Initially only vault 1 is actionable → it's driven (and held).
    const { getByTestId, queryByTestId, rerender } = renderView(props);
    expect(getByTestId("wots").getAttribute("data-vault")).toBe("0xvault1");

    // Both vaults drop to a wait → nothing actionable, held pick cleared.
    states.set(
      "0xvault0",
      resultWith({ availableActions: [PeginAction.NONE], contractStatus: 0 }),
    );
    states.set(
      "0xvault1",
      resultWith({
        availableActions: [PeginAction.NONE],
        contractStatus: 0,
        localStatus: "payout_signed",
      }),
    );
    rerender(view());
    expect(queryByTestId("wots")).toBeNull();

    // Both become actionable at once → re-select fresh: lowest-index (vault 0)
    // wins, not the previously-held vault 1.
    states.set(
      "0xvault0",
      resultWith({
        availableActions: [PeginAction.SUBMIT_WOTS_KEY],
        contractStatus: 0,
      }),
    );
    states.set(
      "0xvault1",
      resultWith({
        availableActions: [PeginAction.SUBMIT_WOTS_KEY],
        contractStatus: 0,
      }),
    );
    rerender(view());
    expect(getByTestId("wots").getAttribute("data-vault")).toBe("0xvault0");
  });

  it("surfaces a closeable error on a warning state with no signing popup", () => {
    mockGetPollingResult.mockReturnValue(
      resultWith({
        availableActions: [PeginAction.NONE],
        displayVariant: "warning",
        message: "This deposit has expired.",
      }),
    );
    const { getByTestId, queryByTestId } = renderView();
    expect(getByTestId("error").textContent).toBe("This deposit has expired.");
    expect(queryByTestId("wots")).toBeNull();
    expect(queryByTestId("payout")).toBeNull();
    expect(queryByTestId("activate")).toBeNull();
  });

  it("drives a later actionable vault instead of stalling on an earlier warning vault", () => {
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          availableActions: [PeginAction.NONE],
          contractStatus: 7,
          displayVariant: "warning",
          message: "This deposit has expired.",
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.ACTIVATE_VAULT],
          contractStatus: 1,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const { getByTestId, queryByTestId } = renderView({
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    });
    expect(queryByTestId("progress-view")).toBeNull();
    expect(getByTestId("activate").getAttribute("data-vault")).toBe("0xvault1");
  });

  it("drives a later actionable vault instead of stalling on an earlier waiting vault", () => {
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          // Waiting on the VP: no actionable step, not a warning.
          availableActions: [PeginAction.NONE],
          contractStatus: 0,
          localStatus: "payout_signed",
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.SUBMIT_WOTS_KEY],
          contractStatus: 0,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const { getByTestId, queryByTestId } = renderView({
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    });
    expect(queryByTestId("progress-view")).toBeNull();
    expect(getByTestId("wots").getAttribute("data-vault")).toBe("0xvault1");
  });

  it("skips a payout-only vault when btcPublicKey is unavailable and picks the next actionable sibling", () => {
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          // Payout signing is available, but the prereq btcPublicKey is missing,
          // so this vault must not win actionableIndex.
          availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS],
          contractStatus: 0,
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.SUBMIT_WOTS_KEY],
          contractStatus: 0,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const { getByTestId, queryByTestId } = render(
      <PostDepositContinuationView
        vaultIds={["0xvault0" as Hex, "0xvault1" as Hex]}
        activities={[activityWithId("0xvault0"), activityWithId("0xvault1")]}
        depositorEthAddress={ETH}
        btcPublicKey={undefined}
        onClose={vi.fn()}
      />,
    );
    expect(queryByTestId("payout")).toBeNull();
    expect(queryByTestId("progress-view")).toBeNull();
    expect(getByTestId("wots").getAttribute("data-vault")).toBe("0xvault1");
  });

  it("falls back to a waiting vault's progress view when no sibling is actionable", () => {
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          availableActions: [PeginAction.NONE],
          contractStatus: 0,
          localStatus: "payout_signed",
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.NONE],
          contractStatus: 0,
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const { getByTestId, queryByTestId } = renderView({
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    });
    expect(queryByTestId("wots")).toBeNull();
    expect(queryByTestId("payout")).toBeNull();
    expect(queryByTestId("activate")).toBeNull();
    expect(getByTestId("progress-view")).not.toBeNull();
  });

  it("surfaces the warning once no other vault is actionable", () => {
    const states = new Map<string, ReturnType<typeof resultWith>>([
      [
        "0xvault0",
        resultWith({
          availableActions: [PeginAction.NONE],
          contractStatus: 7,
          displayVariant: "warning",
          message: "This deposit has expired.",
        }),
      ],
      [
        "0xvault1",
        resultWith({
          availableActions: [PeginAction.NONE],
          contractStatus: 1,
          localStatus: "confirmed",
        }),
      ],
    ]);
    mockGetPollingResult.mockImplementation((id: string) => states.get(id));

    const { getByTestId } = renderView({
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
    });
    expect(getByTestId("error").textContent).toBe("This deposit has expired.");
  });

  it("closing during the wait fires no signing popup", () => {
    mockGetPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.NONE] }),
    );
    const onClose = vi.fn();
    fireEvent.click(renderView({ onClose }).getByTestId("progress-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a completed view when there are no vaults to continue", () => {
    mockGetPollingResult.mockReturnValue(undefined);
    const { getByTestId } = renderView({ vaultIds: [], activities: [] });
    expect(getByTestId("step").textContent).toBe("COMPLETED");
    expect(getByTestId("complete").textContent).toBe("true");
  });
});
