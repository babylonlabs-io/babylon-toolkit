/**
 * Tests for useVaultActions — focusing on transaction integrity validation
 * in handleBroadcast to prevent a compromised indexer from substituting
 * a malicious transaction for signing.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { act, renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVaultFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { ContractStatus } from "@/models/peginStateMachine";
import { broadcastPrePeginTransaction, fetchVaultById } from "@/services/vault";
import { activateVaultWithSecret } from "@/services/vault/vaultActivationService";

import { useVaultActions } from "../useVaultActions";

const mockSignPsbt = vi.hoisted(() => vi.fn().mockResolvedValue("signedPsbt"));
const mockCalculateBtcTxHash = vi.hoisted(() =>
  vi.fn(() => "0xmatching_pre_pegin_hash"),
);

// Local override of the global gate mock so we can drive a paused scope. Plain
// holder (not vi.fn) so `vi.clearAllMocks()` can't reset it; defaults unblocked.
const gateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

vi.mock("@/config/network", () => ({
  getETHChain: vi.fn(() => ({ id: 11155111 })),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/ts-sdk/tbv/core")>()),
  ensureHexPrefix: vi.fn((v: string) => (v.startsWith("0x") ? v : `0x${v}`)),
  processPublicKeyToXOnly: vi.fn((v: string) => v.replace(/^0x/, "")),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: mockCalculateBtcTxHash,
  UtxoNotAvailableError: class UtxoNotAvailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "UtxoNotAvailableError";
    }
  },
}));

vi.mock("@/clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(() =>
    Promise.resolve({
      prePeginTxHash: "0xmatching_pre_pegin_hash",
      hashlock: "0xonchain_hashlock",
    }),
  ),
}));

// Fresh on-chain pause read used by the activation preflight. Holder so tests
// can simulate a pause landing in the stale-gate window (cached gate unblocked,
// fresh read paused). Defaults unblocked.
const onChainPauseMock = vi.hoisted(() => ({
  value: { protocol: null, aave: null } as {
    protocol: string | null;
    aave: string | null;
  } | null,
}));
vi.mock("@/clients/eth-contract/pause-state/query", () => ({
  getOnChainPauseState: () => Promise.resolve(onChainPauseMock.value),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: vi.fn(() => ({})),
  useChainConnector: vi.fn(() => ({
    connectedWallet: {
      account: { address: "bc1qdepositor" },
      provider: {
        connectWallet: vi.fn().mockResolvedValue(undefined),
        getAddress: vi.fn().mockResolvedValue("bc1qdepositor"),
        signPsbt: mockSignPsbt,
      },
    },
  })),
}));

vi.mock("wagmi/actions", () => ({
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock("@/services/vault", () => ({
  assertUtxosAvailable: vi.fn().mockResolvedValue(undefined),
  broadcastPrePeginTransaction: vi.fn().mockResolvedValue("btcTxHash123"),
  fetchVaultById: vi.fn(),
  UtxoNotAvailableError: class UtxoNotAvailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "UtxoNotAvailableError";
    }
  },
}));

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: vi.fn(),
}));

vi.mock("@/services/vault/vaultActivationService", () => ({
  activateVaultWithSecret: vi.fn(),
}));

vi.mock("@/services/vault/vaultPeginBroadcastService", () => ({
  utxosToExpectedRecord: vi.fn(() => ({})),
}));

vi.mock("@/models/peginStateMachine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/models/peginStateMachine")>();
  return {
    ...actual,
    getNextLocalStatus: vi.fn(() => "CONFIRMING"),
    PeginAction: {
      SIGN_AND_BROADCAST_TO_BITCOIN: "SIGN_AND_BROADCAST_TO_BITCOIN",
      ACTIVATE_VAULT: "ACTIVATE_VAULT",
    },
    LocalStorageStatus: {
      PENDING: "PENDING",
      PAYOUT_SIGNED: "PAYOUT_SIGNED",
      CONFIRMING: "CONFIRMING",
    },
  };
});

const mockFetchVaultById = vi.mocked(fetchVaultById);
const mockBroadcastPrePeginTransaction = vi.mocked(
  broadcastPrePeginTransaction,
);
const mockGetVaultFromChain = vi.mocked(getVaultFromChain);
const mockGetVaultRegistryReader = vi.mocked(getVaultRegistryReader);
const mockActivateVaultWithSecret = vi.mocked(activateVaultWithSecret);

/**
 * Build a fake reader that returns a combined basic+protocol payload from
 * `getVaultData` (the single read used by `handleActivation`).
 * Defaults `basicInfo` to `status: VERIFIED` so existing happy-path tests
 * pass the on-chain status precondition unchanged.
 */
function readerReturning(
  protocolInfo: Record<string, unknown>,
  basicInfo: Record<string, unknown> = {
    status: OnChainBtcVaultStatus.VERIFIED,
  },
): ReturnType<typeof getVaultRegistryReader> {
  return {
    getVaultData: vi
      .fn()
      .mockResolvedValue({ basic: basicInfo, protocol: protocolInfo }),
    getVaultProtocolInfo: vi.fn().mockResolvedValue(protocolInfo),
    getVaultBasicInfo: vi.fn().mockResolvedValue(basicInfo),
  } as unknown as ReturnType<typeof getVaultRegistryReader>;
}

// Local copy produced by WASM — no 0x prefix
const TRUSTED_TX_HEX = "70736274ff...trustedtx";
// Same transaction as returned by the indexer (viem Hex always has 0x prefix)
const GRAPHQL_TX_HEX = `0x${TRUSTED_TX_HEX}`;
// A genuinely different transaction returned by a compromised indexer
const ATTACKER_TX_HEX = "0x70736274ff...attackertx";

const baseVault = {
  unsignedPrePeginTx: GRAPHQL_TX_HEX,
  depositorBtcPubkey: "0xdepositorBtcPubkey",
  peginTxHash: "0xabcd1234",
  status: ContractStatus.PENDING,
};

const basePendingPegin = {
  id: "0xvaultId" as Hex,
  timestamp: Date.now(),
  status: "PENDING" as never,
  peginTxHash: "0xpeginTxHash" as Hex,
  unsignedTxHex: TRUSTED_TX_HEX,
  buildOffchainParamsVersion: 7,
  buildAppVaultKeepersVersion: 3,
  buildUniversalChallengersVersion: 5,
};

// Default on-chain reader response that matches `basePendingPegin`'s build
// versions exactly — happy-path tests use this; drift tests override it.
function makeMatchingProtocolInfoBatch() {
  return vi.fn().mockResolvedValue([
    {
      offchainParamsVersion: basePendingPegin.buildOffchainParamsVersion,
      appVaultKeepersVersion: basePendingPegin.buildAppVaultKeepersVersion,
      universalChallengersVersion:
        basePendingPegin.buildUniversalChallengersVersion,
    },
  ]);
}

const baseBroadcastParams = {
  vaultId: "0xvaultId" as Hex,
  onRefetchActivities: vi.fn(),
  onShowSuccessModal: vi.fn(),
};

describe("useVaultActions — handleBroadcast transaction integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue("0xmatching_pre_pegin_hash");
    mockGetVaultFromChain.mockResolvedValue({
      prePeginTxHash: "0xmatching_pre_pegin_hash",
      hashlock: "0xonchain_hashlock",
      status: OnChainBtcVaultStatus.PENDING,
    } as never);
    // Default reader: on-chain versions exactly match the build versions in
    // `basePendingPegin`. Tests that exercise drift override this per-case.
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: makeMatchingProtocolInfoBatch(),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);
  });

  it("broadcasts using local tx when it matches GraphQL", async () => {
    mockFetchVaultById.mockResolvedValue(baseVault as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockGetVaultFromChain).toHaveBeenCalledWith("0xvaultId");
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ unsignedTxHex: TRUSTED_TX_HEX }),
    );
  });

  it("throws when local tx hex differs from GraphQL tx hex", async () => {
    mockFetchVaultById.mockResolvedValue({
      ...baseVault,
      unsignedPrePeginTx: ATTACKER_TX_HEX,
    } as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain("Transaction mismatch");
  });

  it("throws when cached local tx matches GraphQL but mismatches on-chain hash", async () => {
    mockFetchVaultById.mockResolvedValue(baseVault as never);
    mockGetVaultFromChain.mockResolvedValue({
      prePeginTxHash: "0xonchain_hash",
      offchainParamsVersion: 7,
      appVaultKeepersVersion: 3,
      universalChallengersVersion: 5,
      vaultProvider: "0xvaultProvider" as `0x${string}`,
    } as never);

    mockCalculateBtcTxHash.mockReturnValue("0xdifferent_hash");

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain(
      "Transaction integrity check failed",
    );
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(mockSignPsbt).not.toHaveBeenCalled();
  });

  it("rejects broadcast when vault status is not PENDING", async () => {
    mockFetchVaultById.mockResolvedValue({
      ...baseVault,
      status: ContractStatus.EXPIRED,
    } as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain("EXPIRED");
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });

  it("rejects broadcast when vault has already progressed past PENDING", async () => {
    mockFetchVaultById.mockResolvedValue({
      ...baseVault,
      status: ContractStatus.VERIFIED,
    } as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain("VERIFIED");
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });

  // Regression: a poisoned/lagging indexer can report PENDING while the
  // contract has already moved off PENDING. The integrity hash check passes
  // (prePeginTxHash doesn't change across status transitions), so the
  // on-chain status read is the load-bearing gate that prevents BTC from
  // being signed and broadcast into a flow that can no longer activate.
  it("refuses to broadcast when GraphQL says PENDING but on-chain status is EXPIRED", async () => {
    mockFetchVaultById.mockResolvedValue(baseVault as never);
    mockGetVaultFromChain.mockResolvedValue({
      prePeginTxHash: "0xmatching_pre_pegin_hash",
      hashlock: "0xonchain_hashlock",
      status: OnChainBtcVaultStatus.EXPIRED,
    } as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toMatch(/on-chain.*EXPIRED/);
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(mockSignPsbt).not.toHaveBeenCalled();
  });

  // The on-chain BTCVaultStatus enum has Expired = 4. The app-side
  // `ContractStatus` enum reassigns 4 to LIQUIDATED (indexer-only), so a
  // naive `ContractStatus[status]` lookup mislabels on-chain Expired as
  // LIQUIDATED — sending users / support down the wrong recovery path.
  // handleBroadcast must use the on-chain label, not the app-side one.
  it("labels on-chain status 4 as EXPIRED (not LIQUIDATED) in the broadcast error", async () => {
    mockFetchVaultById.mockResolvedValue(baseVault as never);
    mockGetVaultFromChain.mockResolvedValue({
      prePeginTxHash: "0xmatching_pre_pegin_hash",
      hashlock: "0xonchain_hashlock",
      // 4 = on-chain BTCVaultStatus.Expired
      status: 4,
    } as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain("EXPIRED");
    expect(result.current.broadcastError).not.toContain("LIQUIDATED");
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });
});

// Resume broadcasts must re-assert the three on-chain versions against the
// values used to build the BTC scripts in `unsignedTxHex`. Comparing
// against the current local config would miss the case where both
// on-chain and local config rotated to N+1 while the BTC scripts stayed
// at N. The expected* args therefore come from the persisted
// `PendingPeginRequest`, not from runtime state.
describe("useVaultActions — handleBroadcast version drift guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue("0xmatching_pre_pegin_hash");
    mockFetchVaultById.mockResolvedValue(baseVault as never);
    // status: PENDING so the broadcast-status precondition (which runs before
    // the version check this describe block exercises) lets execution reach
    // the version drift logic.
    mockGetVaultFromChain.mockResolvedValue({
      prePeginTxHash: "0xmatching_pre_pegin_hash",
      hashlock: "0xonchain_hashlock",
      status: OnChainBtcVaultStatus.PENDING,
    } as never);
  });

  it("aborts resume broadcast when on-chain offchainParamsVersion drifted", async () => {
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: vi.fn().mockResolvedValue([
        {
          offchainParamsVersion:
            basePendingPegin.buildOffchainParamsVersion + 1,
          appVaultKeepersVersion: basePendingPegin.buildAppVaultKeepersVersion,
          universalChallengersVersion:
            basePendingPegin.buildUniversalChallengersVersion,
        },
      ]),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain("offchainParams expected");
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(mockSignPsbt).not.toHaveBeenCalled();
  });

  it("aborts resume broadcast when on-chain appVaultKeepersVersion drifted", async () => {
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: vi.fn().mockResolvedValue([
        {
          offchainParamsVersion: basePendingPegin.buildOffchainParamsVersion,
          appVaultKeepersVersion:
            basePendingPegin.buildAppVaultKeepersVersion + 1,
          universalChallengersVersion:
            basePendingPegin.buildUniversalChallengersVersion,
        },
      ]),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain("appVaultKeepers expected");
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(mockSignPsbt).not.toHaveBeenCalled();
  });

  it("aborts resume broadcast when on-chain universalChallengersVersion drifted", async () => {
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: vi.fn().mockResolvedValue([
        {
          offchainParamsVersion: basePendingPegin.buildOffchainParamsVersion,
          appVaultKeepersVersion: basePendingPegin.buildAppVaultKeepersVersion,
          universalChallengersVersion:
            basePendingPegin.buildUniversalChallengersVersion + 1,
        },
      ]),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toContain(
      "universalChallengers expected",
    );
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(mockSignPsbt).not.toHaveBeenCalled();
  });

  it("broadcasts when all three stored build versions match on-chain", async () => {
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: makeMatchingProtocolInfoBatch(),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
  });

  // Cross-device resume / Safe async / cleared storage: no local record
  // exists, so the resume path falls back to the indexer's tx — already
  // verified against the on-chain prePeginTxHash above. Broadcasting is safe
  // on the strength of that match; with no local build versions tied to the
  // tx, the on-chain version check is skipped rather than refusing.
  it("broadcasts on the on-chain hash match when no local pendingPegin is available, skipping the version check", async () => {
    const getProtocolInfoBatch = makeMatchingProtocolInfoBatch();
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch,
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        // No pendingPegin: cross-device / Safe-async resume case.
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
    expect(getProtocolInfoBatch).not.toHaveBeenCalled();
  });

  // The no-anchor path leans ENTIRELY on the on-chain prePeginTxHash match to
  // pin the (indexer-served) tx, since there is no local copy to compare. Pin
  // that this guard still refuses with no local record: a mismatch must abort
  // before any signing. Without this, a future refactor that gated the hash
  // check behind `if (pendingPegin)` would broadcast substituted indexer hex
  // with every other test still green.
  it("refuses the no-record broadcast when the on-chain prePeginTxHash mismatches", async () => {
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: makeMatchingProtocolInfoBatch(),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);
    // Indexer-served tx hashes to the beforeEach default
    // ("0xmatching_pre_pegin_hash"); make the on-chain commitment differ.
    mockGetVaultFromChain.mockResolvedValue({
      prePeginTxHash: "0xonchain_hash_that_differs",
      hashlock: "0xonchain_hashlock",
      status: OnChainBtcVaultStatus.PENDING,
    } as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        // No pendingPegin: relaxed no-anchor path.
      });
    });

    expect(result.current.broadcastError).toContain(
      "Transaction integrity check failed",
    );
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(mockSignPsbt).not.toHaveBeenCalled();
  });

  // An entry whose `unsignedTxHex === ""` carries no local tx, so the resume
  // path broadcasts the indexer's tx (verified against on-chain prePeginTxHash
  // above). Any stored build versions are floating — not tied to that tx — so
  // the version check is skipped and broadcast proceeds on the hash match.
  it("broadcasts the indexer tx and skips the version check when pendingPegin has empty unsignedTxHex", async () => {
    const getProtocolInfoBatch = makeMatchingProtocolInfoBatch();
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch,
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin, unsignedTxHex: "" },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
    expect(getProtocolInfoBatch).not.toHaveBeenCalled();
  });

  // When we fall back to the indexer tx (empty local unsignedTxHex), the
  // locally stored selectedUTXOs are NOT guaranteed to be that tx's inputs.
  // Passing them as trusted `expectedUtxos` would make broadcast throw on
  // any input they don't cover, recreating a dead-end. We must ignore them
  // and let the broadcast resolve inputs from the mempool (expectedUtxos
  // undefined).
  it("ignores stale local UTXOs and uses the mempool fallback when broadcasting the indexer tx", async () => {
    const getProtocolInfoBatch = makeMatchingProtocolInfoBatch();
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch,
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: {
          ...basePendingPegin,
          unsignedTxHex: "",
          selectedUTXOs: [
            {
              txid: "abc123",
              vout: 0,
              value: "100000",
              scriptPubKey: "0014abcdef",
            },
          ],
        },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUtxos: undefined }),
    );
  });

  // Legacy entry: a local tx is present but predates the build-version fields.
  // The tx is verified against on-chain prePeginTxHash above, so broadcast
  // proceeds; the version check is skipped because the versions are absent.
  it("broadcasts and skips the version check when a local tx is present but build versions are missing", async () => {
    const getProtocolInfoBatch = makeMatchingProtocolInfoBatch();
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch,
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: {
          ...basePendingPegin,
          buildOffchainParamsVersion: undefined,
          buildAppVaultKeepersVersion: undefined,
          buildUniversalChallengersVersion: undefined,
        },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
    expect(getProtocolInfoBatch).not.toHaveBeenCalled();
  });

  // Mirrors the inline deposit path's cleanup: a confirmed mismatch
  // means this entry can never be safely broadcast, so the in-app
  // Broadcast button must stop offering it and the selectedUTXOs must
  // be freed for new deposits.
  it("removes the pending entry when on-chain version drift is confirmed on resume", async () => {
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: vi.fn().mockResolvedValue([
        {
          offchainParamsVersion:
            basePendingPegin.buildOffchainParamsVersion + 1,
          appVaultKeepersVersion: basePendingPegin.buildAppVaultKeepersVersion,
          universalChallengersVersion:
            basePendingPegin.buildUniversalChallengersVersion,
        },
      ]),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const removePendingPegin = vi.fn();
    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
        removePendingPegin,
      });
    });

    expect(removePendingPegin).toHaveBeenCalledTimes(1);
    expect(removePendingPegin).toHaveBeenCalledWith(
      baseBroadcastParams.vaultId,
    );
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });

  // Transient RPC failures must keep the entry — the user should be
  // able to retry once the RPC recovers. Only a confirmed mismatch
  // clears it.
  it("keeps the pending entry when the resume version check throws a transient (non-mismatch) error", async () => {
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: vi
        .fn()
        .mockRejectedValue(new Error("eth_call failed: connection reset")),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const removePendingPegin = vi.fn();
    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
        removePendingPegin,
      });
    });

    expect(result.current.broadcastError).toContain("eth_call failed");
    expect(removePendingPegin).not.toHaveBeenCalled();
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });
});

describe("useVaultActions — handleActivation hashlock source", () => {
  // SHA-256 of 0x000000...01 (32-byte preimage)
  const SECRET =
    "0x0000000000000000000000000000000000000000000000000000000000000001";
  const ON_CHAIN_HASHLOCK =
    "0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5";

  const baseActivationParams = {
    vaultId: "0xvaultId" as Hex,
    secretHex: SECRET,
    depositorEthAddress: "0xdepositor",
    onRefetchActivities: vi.fn(),
    onShowSuccessModal: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    gateMock.value = { protocol: null, aave: null };
    onChainPauseMock.value = { protocol: null, aave: null };
  });

  it("does not reveal the secret on-chain when a scope is paused", async () => {
    // Activation is an EXIT blocked under Pause (either scope). The guard must
    // short-circuit before any on-chain read or the secret-revealing tx.
    gateMock.value = { protocol: null, aave: "paused" };
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(reader.getVaultData).not.toHaveBeenCalled();
    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
  });

  it("re-checks pause on-chain before revealing the secret (catches a pause in the stale-gate window)", async () => {
    // Cached gate is unblocked, but a FRESH read shows a pause landed while the
    // user sat on the activate screen. The secret must not reach the tx.
    gateMock.value = { protocol: null, aave: null };
    onChainPauseMock.value = { protocol: null, aave: "paused" };
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
    expect(result.current.activationError).not.toBeNull();
  });

  it("uses the on-chain hashlock and never reads the indexer hashlock", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);
    mockActivateVaultWithSecret.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(reader.getVaultData).toHaveBeenCalledWith("0xvaultId");
    // fetchVaultById must not be called for activation — indexer is untrusted
    // for this validation step.
    expect(mockFetchVaultById).not.toHaveBeenCalled();
    expect(mockActivateVaultWithSecret).toHaveBeenCalledTimes(1);
    expect(result.current.activationError).toBeNull();
  });

  it("rejects an invalid secret using the on-chain hashlock without sending the tx", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      // Different hash — user's secret won't match
      hashlock:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(reader.getVaultData).toHaveBeenCalled();
    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
    expect(result.current.activationError).toContain("Invalid secret");
  });

  it("rejects when on-chain hashlock is missing with a specific diagnostic", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: "0x",
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
    // Distinct error from the generic "Invalid secret" path so the user
    // isn't misled into re-entering a correct secret.
    expect(result.current.activationError).toBe(
      "BTC Vault hashlock not found. The BTC Vault may not support activation.",
    );
  });

  it("surfaces a vault-not-found error when on-chain depositorSignedPeginTx is empty", async () => {
    // The SDK's `getVaultData` is the one that throws with the
    // "not found on-chain" message when `depositorSignedPeginTx === '0x'`.
    // Mock that directly here rather than relying on the helper to
    // replicate SDK-internal validation.
    mockGetVaultRegistryReader.mockReturnValue({
      getVaultData: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Vault 0xvaultId not found on-chain or has no pegin transaction",
          ),
        ),
      getVaultProtocolInfo: vi.fn(),
      getVaultBasicInfo: vi.fn(),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
    // Raw "not found on-chain" detail is normalized to a friendly message
    // and the vault id is not echoed back in the UI.
    expect(result.current.activationError).toBe(
      "BTC Vault not found. The BTC Vault ID may be invalid.",
    );
    expect(result.current.activationError).not.toContain("0xvaultId");
  });

  // Regression: a poisoned/lagging indexer can report VERIFIED while the
  // contract is still PENDING, which would surface the "Activate" button
  // prematurely. handleActivation must read on-chain status and refuse to
  // hand the secret to `activateVaultWithSecret` (and therefore to
  // simulateContract calldata) until the contract itself reports VERIFIED.
  it("refuses to activate when on-chain status is PENDING even if hashlock matches", async () => {
    const reader = readerReturning(
      {
        depositorSignedPeginTx: "0xdeadbeef",
        hashlock: ON_CHAIN_HASHLOCK,
      },
      { status: OnChainBtcVaultStatus.PENDING },
    );
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(reader.getVaultData).toHaveBeenCalledWith("0xvaultId");
    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
    expect(result.current.activationError).toContain("PENDING");
  });

  // The on-chain BTCVaultStatus enum has Expired = 4. The app-side
  // `ContractStatus` enum reassigns 4 to LIQUIDATED (indexer-only), so a
  // naive `ContractStatus[status]` lookup mislabels on-chain Expired as
  // LIQUIDATED — sending users / support down the wrong recovery path.
  // handleActivation must use the on-chain label, not the app-side one.
  it("labels on-chain status 4 as EXPIRED (not LIQUIDATED) in the activation error", async () => {
    const reader = readerReturning(
      {
        depositorSignedPeginTx: "0xdeadbeef",
        hashlock: ON_CHAIN_HASHLOCK,
      },
      // 4 = on-chain BTCVaultStatus.Expired
      { status: 4 },
    );
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
    expect(result.current.activationError).toContain("EXPIRED");
    expect(result.current.activationError).not.toContain("LIQUIDATED");
  });

  it("forwards the on-chain hashlock to activateVaultWithSecret for SDK-side defense in depth", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);
    mockActivateVaultWithSecret.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockActivateVaultWithSecret).toHaveBeenCalledWith(
      expect.objectContaining({ hashlock: ON_CHAIN_HASHLOCK }),
    );
  });
});
