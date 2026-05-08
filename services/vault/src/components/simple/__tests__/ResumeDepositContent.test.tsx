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
import type { VaultActivity } from "@/types/activity";

import {
  ResumeActivationContent,
  ResumeWotsContent,
} from "../ResumeDepositContent";

const mockCalculateBtcTxHash = vi.hoisted(() =>
  vi.fn(() => "0xmatching_pre_pegin_hash"),
);
const mockDeriveVaultRoot = vi.hoisted(() => vi.fn());
const mockParseFundingOutpointsFromTx = vi.hoisted(() => vi.fn(() => []));
const mockHandleActivation = vi.hoisted(() => vi.fn());
const mockSubmitWotsPublicKey = vi.hoisted(() => vi.fn());

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  computeWotsBlockPublicKeysHash: vi.fn(() => "0xwotshash"),
  deriveVaultRoot: mockDeriveVaultRoot,
  deriveWotsBlocksFromSeed: vi.fn(() => Promise.resolve([])),
  expandAuthAnchor: vi.fn(() => new Uint8Array(32)),
  expandHashlockSecret: vi.fn(() => new Uint8Array(32)),
  expandWotsSeed: vi.fn(() => new Uint8Array(32)),
  hexToUint8Array: vi.fn(() => new Uint8Array(32)),
  isWotsMismatchError: vi.fn(() => false),
  parseFundingOutpointsFromTx: mockParseFundingOutpointsFromTx,
  uint8ArrayToHex: vi.fn(() => "00".repeat(32)),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", () => ({
  primeVpTokenRegistry: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: mockCalculateBtcTxHash,
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: vi.fn(() => ({
    connectedWallet: { provider: { id: "btc-wallet" } },
  })),
}));

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: vi.fn(),
}));

vi.mock("@/components/deposit/DepositSignModal/depositStepHelpers", () => ({
  computeDepositDerivedState: vi.fn(() => ({
    isComplete: false,
    isProcessing: false,
    canClose: true,
    canContinueInBackground: false,
  })),
}));

vi.mock("@/hooks/deposit/depositFlowSteps", () => ({
  DepositFlowStep: {
    SIGN_PAYOUTS: "SIGN_PAYOUTS",
    BROADCAST_PRE_PEGIN: "BROADCAST_PRE_PEGIN",
    ACTIVATE_VAULT: "ACTIVATE_VAULT",
    COMPLETED: "COMPLETED",
    SUBMIT_WOTS_KEYS: "SUBMIT_WOTS_KEYS",
    ARTIFACT_DOWNLOAD: "ARTIFACT_DOWNLOAD",
  },
}));

vi.mock("@/components/deposit/PayoutSignModal/usePayoutSigningState", () => ({
  usePayoutSigningState: vi.fn(() => ({
    signing: false,
    progress: null,
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

vi.mock("@/utils/btc", () => ({
  stripHexPrefix: vi.fn((hex: string) => hex.replace(/^0x/, "")),
}));

vi.mock("@/utils/rpc", () => ({
  getVpProxyUrl: vi.fn(() => "https://vp.example"),
}));

vi.mock("../DepositProgressView", () => ({
  DepositProgressView: ({ error }: { error?: string | null }) => (
    <div data-testid="progress-view">{error ?? ""}</div>
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
