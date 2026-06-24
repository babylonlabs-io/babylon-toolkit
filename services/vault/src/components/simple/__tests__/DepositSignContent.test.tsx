import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { act, fireEvent, render } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import type { DepositProgressViewProps } from "../DepositProgressView";
import { DepositSignContent } from "../DepositSignContent";

const mockExecuteDeposit = vi.hoisted(() => vi.fn());
// Captures the latest `onSign` handed to DepositProgressView so a test can
// invoke it twice synchronously — the real double-click race that happens
// before the `started` re-render flips the button out of the pre-sign state.
const signHolder = vi.hoisted(() => ({ onSign: null as null | (() => void) }));
const lastProgressProps = vi.hoisted(() => ({
  current: {} as Partial<DepositProgressViewProps>,
}));

vi.mock("@/hooks/deposit/useDepositFlow", () => ({
  useDepositFlow: () => ({
    executeDeposit: mockExecuteDeposit,
    abort: vi.fn(),
    currentStep: "DERIVE_VAULT_SECRET",
    processing: false,
    error: null,
    lastWarnings: [],
    isWaiting: false,
    payoutSigningProgress: null,
    peginSigningProgress: null,
    btcConfirmationDetail: null,
  }),
}));

vi.mock("@/components/deposit/DepositSignModal/depositStepHelpers", () => ({
  computeDepositDerivedState: () => ({
    isComplete: false,
    canClose: true,
    isProcessing: true,
    canContinueInBackground: false,
  }),
}));

vi.mock("../PostDepositContinuationContent", () => ({
  PostDepositContinuationContent: ({ vaultIds }: { vaultIds: string[] }) => (
    <div data-testid="continuation" data-count={vaultIds.length} />
  ),
}));

// DepositProgressView now owns both the pre-sign entry state (started=false,
// renders the "Sign Transaction" CTA) and the in-flight stepper (started=true).
// The mock captures `onSign` so the double-click race can be exercised, and
// renders a stable marker so tests can tell the two states apart.
vi.mock("../DepositProgressView", () => ({
  DepositProgressView: (props: DepositProgressViewProps) => {
    lastProgressProps.current = props;
    if (props.started) {
      return <div data-testid="progress" />;
    }
    signHolder.onSign = props.onSign ?? null;
    return (
      <button type="button" data-testid="summary-sign" onClick={props.onSign}>
        {COPY.deposit.progress.buttons.signTransaction}
      </button>
    );
  },
}));

function renderContent(
  overrides: Partial<{ onRefetchActivities: () => Promise<void> }> = {},
) {
  return render(
    <DepositSignContent
      vaultAmounts={[100000n]}
      mempoolFeeRate={1}
      btcWalletProvider={{} as unknown as BitcoinWallet}
      depositorEthAddress={"0xeth" as Address}
      selectedApplication="0xapp"
      selectedProviders={["0xprovider"]}
      quotedCommissionBps={250}
      vaultProviderBtcPubkey="0xvp"
      vaultKeeperBtcPubkeys={["0xkeeper"]}
      universalChallengerBtcPubkeys={["0xchallenger"]}
      onClose={vi.fn()}
      onRefetchActivities={overrides.onRefetchActivities}
    />,
  );
}

describe("DepositSignContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signHolder.onSign = null;
    lastProgressProps.current = {};
  });

  it("renders DepositProgressView in the pre-sign state and only starts the flow on Sign Transaction", () => {
    mockExecuteDeposit.mockResolvedValue(null);

    const { getByTestId, queryByTestId } = renderContent();

    // Initial screen is the pre-sign entry; the flow has not started.
    expect(getByTestId("summary-sign")).toBeTruthy();
    expect(getByTestId("summary-sign").textContent).toBe(
      COPY.deposit.progress.buttons.signTransaction,
    );
    expect(queryByTestId("progress")).toBeNull();
    expect(mockExecuteDeposit).not.toHaveBeenCalled();
    expect(lastProgressProps.current.started).toBe(false);

    fireEvent.click(getByTestId("summary-sign"));

    expect(mockExecuteDeposit).toHaveBeenCalledTimes(1);
    expect(getByTestId("progress")).toBeTruthy();
  });

  it("starts the deposit at most once even when Sign fires twice synchronously", () => {
    mockExecuteDeposit.mockResolvedValue(null);

    renderContent();

    // Two clicks landing in the same tick, before the `started` re-render can
    // flip the button out of the pre-sign state — the double-broadcast race
    // the ref guards.
    act(() => {
      signHolder.onSign?.();
      signHolder.onSign?.();
    });

    expect(mockExecuteDeposit).toHaveBeenCalledTimes(1);
  });

  it("switches to the continuation view once the deposit returns pegins", async () => {
    mockExecuteDeposit.mockResolvedValue({
      pegins: [{ vaultId: "0xv0" }, { vaultId: "0xv1" }],
      batchId: "batch",
    });
    const onRefetchActivities = vi.fn().mockResolvedValue(undefined);

    const { findByTestId, getByTestId } = renderContent({
      onRefetchActivities,
    });

    fireEvent.click(getByTestId("summary-sign"));

    const continuation = await findByTestId("continuation");
    expect(continuation.getAttribute("data-count")).toBe("2");
    expect(onRefetchActivities).toHaveBeenCalledTimes(1);
  });

  it("stays on the progress view when the deposit returns null", async () => {
    mockExecuteDeposit.mockResolvedValue(null);

    const { findByTestId, getByTestId, queryByTestId } = renderContent();

    fireEvent.click(getByTestId("summary-sign"));

    await findByTestId("progress");
    expect(queryByTestId("continuation")).toBeNull();
  });
});