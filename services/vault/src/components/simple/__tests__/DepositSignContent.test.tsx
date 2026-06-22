import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { act, fireEvent, render } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DepositSignContent } from "../DepositSignContent";

const mockExecuteDeposit = vi.hoisted(() => vi.fn());
// Captures the latest `onSign` handed to the summary card so a test can invoke
// it twice synchronously — the real double-click race that happens before the
// `started` re-render unmounts the Sign button.
const signHolder = vi.hoisted(() => ({ onSign: null as null | (() => void) }));

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

vi.mock("../DepositProgressView", () => ({
  DepositProgressView: () => <div data-testid="progress" />,
  DepositSummaryCard: ({ onSign }: { onSign: () => void }) => {
    signHolder.onSign = onSign;
    return (
      <button type="button" data-testid="summary-sign" onClick={onSign}>
        Sign
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
  });

  it("shows the summary card first and only starts the flow on Sign", () => {
    mockExecuteDeposit.mockResolvedValue(null);

    const { getByTestId, queryByTestId } = renderContent();

    // Initial screen is the summary card; the flow has not started.
    expect(getByTestId("summary-sign")).toBeTruthy();
    expect(queryByTestId("progress")).toBeNull();
    expect(mockExecuteDeposit).not.toHaveBeenCalled();

    fireEvent.click(getByTestId("summary-sign"));

    expect(mockExecuteDeposit).toHaveBeenCalledTimes(1);
    expect(getByTestId("progress")).toBeTruthy();
  });

  it("starts the deposit at most once even when Sign fires twice synchronously", () => {
    mockExecuteDeposit.mockResolvedValue(null);

    renderContent();

    // Two clicks landing in the same tick, before the `started` re-render can
    // unmount the Sign button — the double-broadcast race the ref guards.
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
