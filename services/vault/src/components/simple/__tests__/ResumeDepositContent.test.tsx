/**
 * Tests for ResumeDepositContent — focused on the trust boundary around
 * `activity.unsignedPrePeginTx`. Both ResumeWotsContent and ResumeActivationContent
 * must verify the indexer-supplied tx hex against the on-chain prePeginTxHash
 * BEFORE invoking the wallet's deriveContextHash; otherwise a compromised
 * indexer can ask the wallet to derive over attacker-chosen funding outpoints.
 */

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import type { VaultActivity } from "@/types/activity";

import {
  ResumeActivationContent,
  ResumeSignContent,
  ResumeWotsContent,
} from "../ResumeDepositContent";

const mockCalculateBtcTxHash = vi.hoisted(() =>
  vi.fn(() => "0xmatching_pre_pegin_hash"),
);
const mockDeriveVaultRoot = vi.hoisted(() => vi.fn());
const mockParseFundingOutpointsFromTx = vi.hoisted(() => vi.fn(() => []));
const mockHandleActivation = vi.hoisted(() => vi.fn());
const mockSubmitWotsPublicKey = vi.hoisted(() => vi.fn());
const mockUseDepositPollingResult = vi.hoisted(() => vi.fn(() => undefined));
const mockGetPeginDisplayStep = vi.hoisted(() =>
  vi.fn<(state: unknown) => number | null>(() => null),
);

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  computeWotsBlockPublicKeysHash: vi.fn(() => "0xwotshash"),
  deriveVaultRoot: mockDeriveVaultRoot,
  deriveWotsBlocksFromSeed: vi.fn(() => Promise.resolve([])),
  expandAuthAnchor: vi.fn(() => new Uint8Array(32)),
  expandHashlockSecret: vi.fn(() => new Uint8Array(32)),
  expandWotsSeed: vi.fn(() => new Uint8Array(32)),
  hexToUint8Array: vi.fn(() => new Uint8Array(32)),
  isWotsMismatchError: vi.fn(() => false),
  isRegisteredVaultVersionMismatchError: vi.fn(() => false),
  parseFundingOutpointsFromTx: mockParseFundingOutpointsFromTx,
  stripHexPrefix: vi.fn((hex: string) => hex.replace(/^0x/, "")),
  uint8ArrayToHex: vi.fn(() => "00".repeat(32)),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", () => ({
  primeVpTokenRegistry: vi.fn(),
  // mapDepositError narrows on `instanceof JsonRpcError`; provide a real class
  // so the check is callable (these tests never throw a JsonRpcError).
  JsonRpcError: class JsonRpcError extends Error {},
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: mockCalculateBtcTxHash,
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: vi.fn(() => ({
    connectedWallet: {
      account: { address: "tb1test" },
      provider: {
        id: "btc-wallet",
        connectWallet: vi.fn().mockResolvedValue(undefined),
        getAddress: vi.fn().mockResolvedValue("tb1test"),
      },
    },
  })),
}));

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: vi.fn(),
}));

// Mirror the real derivation of `isProcessing`/`isComplete` from the
// (processing, isWaiting, error) inputs so the tests genuinely exercise how
// each Resume* view wires its state into DepositProgressView (a flat stub that
// always returns isProcessing:false would mask the spinner-vs-terminal split).
vi.mock("@/components/deposit/DepositSignModal/depositStepHelpers", () => ({
  computeDepositDerivedState: vi.fn(
    (
      currentStep: number,
      processing: boolean,
      isWaiting: boolean,
      error: string | null,
    ) => {
      const isComplete = currentStep === 16; // DepositFlowStep.COMPLETED
      return {
        isComplete,
        isProcessing: (processing || isWaiting) && !error && !isComplete,
        canClose: true,
        canContinueInBackground: isWaiting && !error,
      };
    },
  ),
}));

// Use the real numeric DepositFlowStep enum so ordered comparisons in
// production (`polledStep > SUBMIT_WOTS_KEYS`) behave as they do at runtime;
// a string-valued stub would make `9 > 8` compare as `"A" > "S"` and break
// the pastWots discriminator under test.
vi.mock("@/hooks/deposit/depositFlowSteps", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/deposit/depositFlowSteps/types")
  >("@/hooks/deposit/depositFlowSteps/types");
  return {
    DepositFlowStep: actual.DepositFlowStep,
    payoutSigningStep: (phase: "auth" | "claimers" | "graph") =>
      phase === "auth"
        ? actual.DepositFlowStep.SIGN_AUTH_ANCHOR
        : phase === "graph"
          ? actual.DepositFlowStep.SIGN_DEPOSITOR_GRAPH
          : actual.DepositFlowStep.SIGN_PAYOUTS,
  };
});

vi.mock("@/components/deposit/PayoutSignModal/usePayoutSigningState", () => ({
  usePayoutSigningState: vi.fn(() => ({
    signing: false,
    progress: { phase: "claimers", completed: 0, total: 0 },
    error: null,
    isComplete: false,
    handleSign: vi.fn(),
  })),
}));

vi.mock("@/hooks/deposit/depositFlowSteps/wotsSubmission", () => ({
  submitWotsPublicKey: mockSubmitWotsPublicKey,
}));

vi.mock("@/hooks/deposit/useActivationState", () => ({
  useActivationState: vi.fn(() => ({
    activating: false,
    activated: false,
    error: null,
    handleActivation: mockHandleActivation,
  })),
}));

vi.mock("@/hooks/deposit/useBroadcastState", () => ({
  useBroadcastState: vi.fn(() => ({
    broadcasting: false,
    error: null,
    handleBroadcast: vi.fn(),
  })),
}));

vi.mock("@/hooks/deposit/useReleaseVpTokenOnUnmount", () => ({
  useReleaseVpTokenOnUnmount: vi.fn(() => vi.fn()),
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/utils/rpc", () => ({
  getVpProxyUrl: vi.fn(() => "https://vp.example"),
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: mockUseDepositPollingResult,
  // useSplitVaultProgress (via the Resume components) reads sibling polling
  // state. These tests render standalone deposits (no siblingVaultIds), so the
  // derivation returns early and never calls getPollingResult — but the hook
  // still runs, so it must resolve to a usable shape.
  usePeginPolling: () => ({ getPollingResult: () => undefined }),
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: () => ({
    config: { offchainParams: { minPrepeginDepth: 6 } },
    getOffchainParamsByVersion: () => undefined,
  }),
}));

vi.mock("@/models/peginStateMachine", () => ({
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
  getPeginDisplayStep: mockGetPeginDisplayStep,
  isVaultActivated: (state: { contractStatus?: number } | undefined) =>
    state?.contractStatus === 2 /* ACTIVE */,
}));

vi.mock("../DepositProgressView", () => ({
  DepositProgressView: ({
    currentStep,
    error,
    isComplete,
    isProcessing,
    terminalMessage,
    canContinueInBackground,
  }: {
    currentStep?: string;
    error?: { title: string; body: string } | null;
    isComplete?: boolean;
    isProcessing?: boolean;
    terminalMessage?: string | null;
    canContinueInBackground?: boolean;
  }) => (
    <div data-testid="progress-view">
      <span data-testid="step">{String(currentStep)}</span>
      <span data-testid="error">{error?.body ?? ""}</span>
      <span data-testid="complete">{String(!!isComplete)}</span>
      <span data-testid="processing">{String(!!isProcessing)}</span>
      <span data-testid="terminal">{terminalMessage ?? ""}</span>
      <span data-testid="background">{String(!!canContinueInBackground)}</span>
    </div>
  ),
}));

const mockGetVaultRegistryReader = vi.mocked(getVaultRegistryReader);

const ON_CHAIN_HASH = "0xmatching_pre_pegin_hash";
const ATTACKER_HASH = "0xattacker_chosen_hash";

const baseActivity: VaultActivity = {
  id: "0xvaultId" as never,
  collateral: { amount: "0.01", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  displayLabel: "AwaitingDeposit" as never,
  peginTxHash: "0xpegintx" as never,
  unsignedPrePeginTx: "0xindexertx",
  depositorWotsPkHash: "0xwotshash",
};

function readerWith(prePeginTxHash: string) {
  return {
    getVaultData: vi.fn().mockResolvedValue({
      basic: { depositorBtcPubKey: "0xdepositorpub" },
      protocol: {
        htlcVout: 0,
        depositorWotsPkHash: "0xwotshash",
        prePeginTxHash,
      },
    }),
    getVaultProviderBtcPubKey: vi.fn().mockResolvedValue(null),
    getVaultBasicInfo: vi.fn(),
    getVaultProtocolInfo: vi.fn(),
  } as unknown as ReturnType<typeof getVaultRegistryReader>;
}

describe("ResumeWotsContent — Pre-PegIn tx hash trust boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue(ON_CHAIN_HASH);
  });

  it("aborts before deriveVaultRoot when indexer tx hash does not match on-chain", async () => {
    mockCalculateBtcTxHash.mockReturnValue(ATTACKER_HASH);
    mockGetVaultRegistryReader.mockReturnValue(readerWith(ON_CHAIN_HASH));

    const { getByTestId } = render(
      <ResumeWotsContent
        activity={baseActivity}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("progress-view").textContent).toContain(
        "Pre-PegIn transaction hash mismatch",
      );
    });

    expect(mockDeriveVaultRoot).not.toHaveBeenCalled();
    expect(mockParseFundingOutpointsFromTx).not.toHaveBeenCalled();
    expect(mockSubmitWotsPublicKey).not.toHaveBeenCalled();
  });

  it("proceeds to deriveVaultRoot when the indexer tx hash matches on-chain", async () => {
    mockCalculateBtcTxHash.mockReturnValue(ON_CHAIN_HASH);
    mockGetVaultRegistryReader.mockReturnValue(readerWith(ON_CHAIN_HASH));
    mockDeriveVaultRoot.mockResolvedValue(new Uint8Array(32));

    render(
      <ResumeWotsContent
        activity={baseActivity}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockDeriveVaultRoot).toHaveBeenCalledTimes(1);
    });
    expect(mockParseFundingOutpointsFromTx).toHaveBeenCalledWith("0xindexertx");
  });
});

describe("ResumeWotsContent — polled-status terminal", () => {
  // Real numeric enum values (mirrors DepositFlowStep): SUBMIT_WOTS_KEYS=7,
  // AWAIT_PAYOUT_TRANSACTIONS=8.
  const SUBMIT_WOTS_KEYS = 7;
  const AWAIT_PAYOUT_TRANSACTIONS = 8;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue(ON_CHAIN_HASH);
    mockGetVaultRegistryReader.mockReturnValue(readerWith(ON_CHAIN_HASH));
    mockDeriveVaultRoot.mockResolvedValue(new Uint8Array(32));
    mockSubmitWotsPublicKey.mockResolvedValue(undefined);
    mockUseDepositPollingResult.mockReturnValue(undefined);
    mockGetPeginDisplayStep.mockReturnValue(null);
  });

  function renderWots() {
    return render(
      <ResumeWotsContent
        activity={baseActivity}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
  }

  it("advances to a closeable background wait once the VP is past WOTS", async () => {
    // VP has accepted the WOTS key and advanced; the modal moves off the WOTS
    // step to the next step as a "Close & continue later" background wait —
    // no separate success banner.
    mockUseDepositPollingResult.mockReturnValue({
      peginState: { contractStatus: 0 },
    } as never);
    mockGetPeginDisplayStep.mockReturnValue(AWAIT_PAYOUT_TRANSACTIONS);

    const { getByTestId } = renderWots();

    await waitFor(() =>
      expect(getByTestId("step").textContent).toBe(
        String(AWAIT_PAYOUT_TRANSACTIONS),
      ),
    );
    // No success banner — the closeable background wait carries the state.
    expect(getByTestId("terminal").textContent).toBe("");
    expect(getByTestId("background").textContent).toBe("true");
    expect(getByTestId("error").textContent).toBe("");
  });

  it("advances to the closeable background wait after the local submit resolves, before the VP confirms", async () => {
    mockUseDepositPollingResult.mockReturnValue({
      peginState: { contractStatus: 0 },
    } as never);
    mockGetPeginDisplayStep.mockReturnValue(SUBMIT_WOTS_KEYS);

    const { getByTestId } = renderWots();

    // The submit auto-fires; once it resolves the modal advances to the next
    // step as a "Close & continue later" background wait with no terminal
    // banner — even though the polled state has not yet confirmed acceptance.
    await waitFor(() =>
      expect(mockSubmitWotsPublicKey).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(getByTestId("step").textContent).toBe(
        String(AWAIT_PAYOUT_TRANSACTIONS),
      ),
    );
    expect(getByTestId("terminal").textContent).toBe("");
    expect(getByTestId("background").textContent).toBe("true");
    expect(getByTestId("processing").textContent).toBe("true");
  });

  it("shows the in-flight WOTS spinner with no terminal before any polled result", async () => {
    // No polling result yet (polledStep === null): pastWots must be false and
    // the in-flight submit shows the SUBMIT_WOTS_KEYS spinner.
    mockUseDepositPollingResult.mockReturnValue(undefined);
    // Keep the submit in flight so loading stays true on first render.
    mockSubmitWotsPublicKey.mockReturnValue(new Promise(() => {}));

    const { getByTestId } = renderWots();

    expect(getByTestId("step").textContent).toBe(String(SUBMIT_WOTS_KEYS));
    expect(getByTestId("terminal").textContent).toBe("");
    expect(getByTestId("processing").textContent).toBe("true");
  });
});

describe("ResumeActivationContent — Pre-PegIn tx hash trust boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue(ON_CHAIN_HASH);
  });

  it("aborts before deriveVaultRoot when indexer tx hash does not match on-chain", async () => {
    mockCalculateBtcTxHash.mockReturnValue(ATTACKER_HASH);
    mockGetVaultRegistryReader.mockReturnValue(readerWith(ON_CHAIN_HASH));

    const { getByTestId } = render(
      <ResumeActivationContent
        activity={baseActivity}
        depositorEthAddress="0xdepositor"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("progress-view").textContent).toContain(
        "Pre-PegIn transaction hash mismatch",
      );
    });

    expect(mockDeriveVaultRoot).not.toHaveBeenCalled();
    expect(mockParseFundingOutpointsFromTx).not.toHaveBeenCalled();
    expect(mockHandleActivation).not.toHaveBeenCalled();
  });

  it("proceeds to deriveVaultRoot when the indexer tx hash matches on-chain", async () => {
    mockCalculateBtcTxHash.mockReturnValue(ON_CHAIN_HASH);
    mockGetVaultRegistryReader.mockReturnValue(readerWith(ON_CHAIN_HASH));
    mockDeriveVaultRoot.mockResolvedValue(new Uint8Array(32));

    render(
      <ResumeActivationContent
        activity={baseActivity}
        depositorEthAddress="0xdepositor"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockDeriveVaultRoot).toHaveBeenCalledTimes(1);
    });
    expect(mockParseFundingOutpointsFromTx).toHaveBeenCalledWith("0xindexertx");
    expect(mockHandleActivation).toHaveBeenCalledTimes(1);
  });
});

describe("ResumeSignContent — reactive verification terminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDepositPollingResult.mockReturnValue(undefined);
    vi.mocked(usePayoutSigningState).mockReturnValue({
      signing: false,
      progress: { phase: "claimers", completed: 0, total: 0 },
      error: null,
      isComplete: true,
      handleSign: vi.fn(),
    });
  });

  function renderSign() {
    return render(
      <ResumeSignContent
        activity={baseActivity}
        btcPublicKey="0xbtcpub"
        depositorEthAddress={"0xdepositor" as never}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
  }

  it("stays on the verification wait while the contract is still PENDING", () => {
    mockUseDepositPollingResult.mockReturnValue({
      peginState: { contractStatus: 0 },
    } as never);

    const { getByTestId } = renderSign();

    // AWAIT_VP_VERIFICATION
    expect(getByTestId("step").textContent).toBe("12");
    expect(getByTestId("terminal").textContent).toBe("");
  });

  it("advances to ready-to-activate once the contract is VERIFIED", () => {
    mockUseDepositPollingResult.mockReturnValue({
      peginState: { contractStatus: 1 },
    } as never);

    const { getByTestId } = renderSign();

    // RETRIEVE_SECRET
    expect(getByTestId("step").textContent).toBe("13");
    expect(getByTestId("terminal").textContent?.toLowerCase()).toContain(
      "ready to activate",
    );
  });

  it("marks the flow complete if the deposit advances to ACTIVE while parked", () => {
    mockUseDepositPollingResult.mockReturnValue({
      peginState: { contractStatus: 2 }, // ACTIVE — already activated elsewhere
    } as never);

    const { getByTestId } = renderSign();

    // COMPLETED — the whole flow is done, so no stale "ready to activate".
    expect(getByTestId("step").textContent).toBe("16");
    expect(getByTestId("terminal").textContent).toBe("");
  });
});

describe("ResumeActivationContent — reactive activation terminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue(ON_CHAIN_HASH);
    mockGetVaultRegistryReader.mockReturnValue(readerWith(ON_CHAIN_HASH));
    mockDeriveVaultRoot.mockResolvedValue(new Uint8Array(32));
    mockUseDepositPollingResult.mockReturnValue(undefined);
    vi.mocked(useActivationState).mockReturnValue({
      activating: false,
      activated: true,
      error: null,
      handleActivation: mockHandleActivation,
    });
  });

  function renderActivation() {
    return render(
      <ResumeActivationContent
        activity={baseActivity}
        depositorEthAddress="0xdepositor"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
  }

  it("keeps awaiting confirmation after broadcast until the contract is ACTIVE", async () => {
    mockUseDepositPollingResult.mockReturnValue({
      peginState: { contractStatus: 1 }, // VERIFIED — broadcast landed, not yet ACTIVE
    } as never);

    const { getByTestId } = renderActivation();

    // AWAIT_ACTIVATION_CONFIRMATION
    await waitFor(() => expect(getByTestId("step").textContent).toBe("15"));
  });

  it("completes once the contract reports ACTIVE", async () => {
    mockUseDepositPollingResult.mockReturnValue({
      peginState: { contractStatus: 2 }, // ACTIVE
    } as never);

    const { getByTestId } = renderActivation();

    // COMPLETED
    await waitFor(() => expect(getByTestId("step").textContent).toBe("16"));
  });
});
