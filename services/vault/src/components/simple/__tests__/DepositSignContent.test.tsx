import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { render } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DepositSignContent } from "../DepositSignContent";

const mockExecuteDeposit = vi.hoisted(() => vi.fn());

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

  it("switches to the continuation view once the deposit returns pegins", async () => {
    mockExecuteDeposit.mockResolvedValue({
      pegins: [{ vaultId: "0xv0" }, { vaultId: "0xv1" }],
      batchId: "batch",
    });
    const onRefetchActivities = vi.fn().mockResolvedValue(undefined);

    const { findByTestId } = renderContent({ onRefetchActivities });

    const continuation = await findByTestId("continuation");
    expect(continuation.getAttribute("data-count")).toBe("2");
    expect(onRefetchActivities).toHaveBeenCalledTimes(1);
  });

  it("stays on the progress view when the deposit returns null", async () => {
    mockExecuteDeposit.mockResolvedValue(null);

    const { findByTestId, queryByTestId } = renderContent();

    await findByTestId("progress");
    expect(queryByTestId("continuation")).toBeNull();
  });
});
