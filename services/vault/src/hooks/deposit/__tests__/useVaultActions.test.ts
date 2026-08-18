/**
 * Tests for useVaultActions — focusing on transaction integrity validation
 * in handleBroadcast to prevent a compromised indexer from substituting
 * a malicious transaction for signing.
 */

import { PeginRegistrationNotFinalError } from "@babylonlabs-io/ts-sdk/tbv/core";
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { act, renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVaultFromChainWithGrace } from "@/clients/eth-contract/btc-vault-registry/query";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { COPY } from "@/copy";
import { ContractStatus } from "@/models/peginStateMachine";
import {
  assertUtxosAvailable,
  broadcastPrePeginTransaction,
  fetchVaultById,
} from "@/services/vault";
import { waitForEthRegistrationDepth } from "@/services/vault/ethConfirmationGate";
import { rebuildDepositTerms } from "@/services/vault/rebuildDepositTerms";
import { resolveFundedTxFeeAndUtxos } from "@/services/vault/resolveFundedTxFee";
import { activateVaultWithSecret } from "@/services/vault/vaultActivationService";
import { utxosToExpectedRecord } from "@/services/vault/vaultPeginBroadcastService";

import { useVaultActions } from "../useVaultActions";

const mockSignPsbt = vi.hoisted(() => vi.fn().mockResolvedValue("signedPsbt"));
const makeDefaultChainConnector = vi.hoisted(() => () => ({
  connectedWallet: {
    account: { address: "bc1qdepositor" },
    provider: {
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1qdepositor"),
      signPsbt: mockSignPsbt,
    },
  },
}));
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
  // Reached transitively: the resume broadcast's RFC-006 key resolution pulls
  // in the shared ETHClient, which reads the RPC config at construction.
  getNetworkConfigETH: vi.fn(() => ({ rpcUrl: "http://localhost:8545" })),
}));

const mockVerifyResumeParticipantKeys = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
vi.mock("@/services/vault/verifyResumeParticipantKeys", () => ({
  verifyResumeParticipantKeys: mockVerifyResumeParticipantKeys,
}));

// `captureFunnelFailure` reaches the logger through this barrel, so mocking it
// here intercepts the capture. `event` must be present: handleActivation's
// success path calls logger.event, and omitting it would fail the happy paths.
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: {
    error: mockLoggerError,
    event: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
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
  getVaultFromChainWithGrace: vi.fn(() =>
    Promise.resolve({
      prePeginTxHash: "0xmatching_pre_pegin_hash",
      hashlock: "0xonchain_hashlock",
      // ETH block the registration mined at. Feeds the finality gate; the
      // default pairs with a far-ahead tip so the common case (a deposit
      // registered long ago) takes the no-wait fast path.
      createdAt: 1_000n,
    }),
  ),
}));

// Ethereum finality gate. Default: already final, so the gate is a no-op and
// the pre-existing broadcast tests are unaffected. The gate's own tests drive
// these two directly.
vi.mock("@/services/vault/ethConfirmationGate", () => ({
  waitForEthRegistrationDepth: vi.fn(async () => ({
    confirmations: 8,
    basicInfo: { status: OnChainBtcVaultStatus.PENDING },
  })),
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
const mockAssertVaultCoreVersionSupported = vi.hoisted(() => vi.fn());
mockAssertVaultCoreVersionSupported.mockResolvedValue(undefined);
vi.mock("@/utils/vaultCoreVersionSupport", () => ({
  assertVaultCoreVersionSupported: mockAssertVaultCoreVersionSupported,
}));

vi.mock("@/clients/eth-contract/pause-state/query", () => ({
  getOnChainPauseState: () => Promise.resolve(onChainPauseMock.value),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: vi.fn(() => ({})),
  useChainConnector: vi.fn(makeDefaultChainConnector),
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

vi.mock("@/services/vault/rebuildDepositTerms", () => ({
  rebuildDepositTerms: vi.fn(),
}));

vi.mock("@/services/vault/resolveFundedTxFee", () => ({
  resolveFundedTxFeeAndUtxos: vi.fn(),
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
const mockGetVaultFromChain = vi.mocked(getVaultFromChainWithGrace);
const mockGetVaultRegistryReader = vi.mocked(getVaultRegistryReader);
const mockActivateVaultWithSecret = vi.mocked(activateVaultWithSecret);
const mockWaitForEthRegistrationDepth = vi.mocked(waitForEthRegistrationDepth);
const mockAssertUtxosAvailable = vi.mocked(assertUtxosAvailable);

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
  buildVaultCoreVersion: 1,
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
      vaultCoreVersion: basePendingPegin.buildVaultCoreVersion,
    },
  ]);
}

const baseBroadcastParams = {
  vaultId: "0xvaultId" as Hex,
  depositorEthAddress: "0xconnected_depositor",
  onRefetchActivities: vi.fn(),
  onShowSuccessModal: vi.fn(),
};

// Re-assert the default connector before EVERY test so a describe that
// overrides useChainConnector's return value cannot leak a stale wallet into
// later tests. Idempotent for tests that never override it.
beforeEach(() => {
  vi.mocked(useChainConnector).mockImplementation(
    makeDefaultChainConnector as never,
  );
});

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
    mockVerifyResumeParticipantKeys.mockResolvedValue(undefined);
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
    expect(mockGetVaultFromChain).toHaveBeenCalledWith(
      "0xvaultId",
      expect.any(AbortSignal),
    );
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

    expect(result.current.broadcastError?.body).toContain(
      "Transaction mismatch",
    );
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

    expect(result.current.broadcastError?.body).toContain(
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

    expect(result.current.broadcastError?.body).toContain("EXPIRED");
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

    expect(result.current.broadcastError?.body).toContain("VERIFIED");
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

    expect(result.current.broadcastError?.body).toMatch(/on-chain.*EXPIRED/);
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

    expect(result.current.broadcastError?.body).toContain("EXPIRED");
    expect(result.current.broadcastError?.body).not.toContain("LIQUIDATED");
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

  it("aborts before signing when the stamped vaultCoreVersion is unsupported by this build", async () => {
    mockAssertVaultCoreVersionSupported.mockRejectedValueOnce(
      new Error(
        "This deposit requires a newer version of the app. Please refresh the page and try again — if the issue persists, an updated release is on its way.",
      ),
    );

    const { result } = renderHook(() => useVaultActions());
    await act(async () => {
      await result.current.handleBroadcast(baseBroadcastParams);
    });

    expect(result.current.broadcastError?.body).toMatch(
      /requires a newer version of the app/,
    );
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
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

    expect(result.current.broadcastError).toEqual(
      COPY.deposit.errors.versionMismatch,
    );
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

    expect(result.current.broadcastError).toEqual(
      COPY.deposit.errors.versionMismatch,
    );
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

    expect(result.current.broadcastError).toEqual(
      COPY.deposit.errors.versionMismatch,
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

    expect(result.current.broadcastError?.body).toContain(
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

    expect(result.current.broadcastError?.body).toContain("eth_call failed");
    expect(removePendingPegin).not.toHaveBeenCalled();
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });

  // The key stamp is the guard's only real precondition. A record that carries
  // the stamp but predates the build-version fields must still be checked —
  // the versions say nothing about whether an operator rotated.
  it("runs the RFC-006 key guard when the stamp is present but build versions are missing", async () => {
    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: {
          ...basePendingPegin,
          buildOffchainParamsVersion: undefined,
          buildAppVaultKeepersVersion: undefined,
          buildUniversalChallengersVersion: undefined,
          buildParticipantOperationKeys: {
            vaultProvider: "aa".repeat(32),
            vaultKeepers: ["bb".repeat(32)],
            universalChallengers: ["cc".repeat(32)],
          },
        },
      });
    });

    expect(mockVerifyResumeParticipantKeys).toHaveBeenCalledTimes(1);
    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
  });

  // Key drift must NOT clear the entry. The stamp it holds is the only thing
  // that makes this guard re-fire; without it the next attempt finds no local
  // copy, falls back to the indexer's transaction, passes the prePeginTxHash
  // check — it is the registered transaction — and broadcasts the Pre-PegIn
  // this just refused, locking BTC until the refund timelock.
  it("keeps the pending entry when the RFC-006 key guard reports drift", async () => {
    const drift = new Error(
      "Aborting Pre-PegIn broadcast: the vault keeper set changed since this deposit was built",
    );
    drift.name = "ParticipantKeyDriftError";
    mockVerifyResumeParticipantKeys.mockRejectedValue(drift);

    const removePendingPegin = vi.fn();
    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: {
          ...basePendingPegin,
          buildParticipantOperationKeys: {
            vaultProvider: "aa".repeat(32),
            vaultKeepers: ["bb".repeat(32)],
            universalChallengers: ["cc".repeat(32)],
          },
        },
        removePendingPegin,
      });
    });

    expect(removePendingPegin).not.toHaveBeenCalled();
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(result.current.broadcastError).toBeTruthy();
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
    // An empty record is far more often a lagging RPC node than a missing
    // vault, so the copy says "still confirming" rather than asserting the
    // vault is gone — and the raw vault id never reaches the UI.
    expect(result.current.activationError).toBe(
      COPY.deposit.errors.vaultRegistrationNotYetVisible.body,
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

  // handleActivation catches its own failures and never rethrows, so this catch
  // is the only place a reveal failure is observable. A capture in a caller's
  // catch (useActivationState) would never run.
  it("captures an on-chain reveal failure with the activation.reveal stage and a scrubbed vaultId", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);
    mockActivateVaultWithSecret.mockRejectedValue(
      new Error("execution reverted: InvalidSecret"),
    );

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const [err, ctx] = mockLoggerError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(ctx.tags.funnelStage).toBe("activation.reveal");
    expect(ctx.tags.vaultId).toBe("0xva...ltId");
    expect(result.current.activationError).toContain("execution reverted");
  });

  it("does not capture a wallet decline of the activation tx, but still surfaces it", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);
    // EIP-1193 4001 — the depositor hit Reject in their wallet. Routine
    // drop-off, not a reveal failure; it must not reach Sentry.
    mockActivateVaultWithSecret.mockRejectedValue(
      Object.assign(new Error("User rejected the request"), { code: 4001 }),
    );

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(result.current.activationError).not.toBeNull();
  });

  // A pause is operator action hitting every depositor at once — capturing it
  // would spike the exact rate the activation.reveal tag alerts on. It also
  // keeps the two paused paths consistent: the cached-gate early return never
  // captured, so the fresh-gate re-check must not either.
  it("does not capture the fresh-gate pause as a reveal failure, but still surfaces it", async () => {
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

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(result.current.activationError).not.toBeNull();
  });

  // The retryable non-VERIFIED branch exists to absorb the indexer-lag race
  // (indexer says VERIFIED, contract still PENDING) — a normal, self-resolving
  // transient, not a reveal failure. The user still sees the retryable error.
  it("does not capture the retryable non-VERIFIED status as a reveal failure", async () => {
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

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(result.current.activationError).toContain("PENDING");
    expect(result.current.activationErrorTerminal).toBe(false);
  });

  // Mutation check on the suppression scope: EXPIRED is a genuine dead-end
  // (retrying can't revert the status), so it must STILL be captured. Fails if
  // the expected-interruption marker is ever set before the EXPIRED branch.
  it("still captures the terminal EXPIRED status as a reveal failure", async () => {
    const reader = readerReturning(
      {
        depositorSignedPeginTx: "0xdeadbeef",
        hashlock: ON_CHAIN_HASHLOCK,
      },
      { status: OnChainBtcVaultStatus.EXPIRED },
    );
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const [, ctx] = mockLoggerError.mock.calls[0];
    expect(ctx.tags.funnelStage).toBe("activation.reveal");
    expect(result.current.activationErrorTerminal).toBe(true);
  });

  // Once `activateVaultWithSecret` resolves, the reveal has landed on-chain.
  // A throw in the post-success bookkeeping (success modal, refetch, txid
  // fallback parse) must not be captured as activation.reveal — that would
  // report a failure for an activation that succeeded, inverting the metric.
  it("does not capture a post-reveal bookkeeping throw once the reveal has landed on-chain", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0xdeadbeef",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);
    mockActivateVaultWithSecret.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation({
        ...baseActivationParams,
        onShowSuccessModal: vi.fn(() => {
          throw new Error("success modal blew up");
        }),
      });
    });

    expect(mockActivateVaultWithSecret).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});

describe("useVaultActions — handleBroadcast intent (Ledger) resume branch", () => {
  const RESOLVED = {
    expectedUtxos: {
      ["ab".repeat(32) + ":0"]: { scriptPubKey: "5120aa", value: 500_000 },
    },
    fundedTxFee: 1234n,
  };
  const REBUILT_TERMS = { prepeginTxid: "ff".repeat(32) };
  // Single fixture for the chain read AND the `target` the hook must forward
  // to the rebuild — the same object, not a re-read.
  const ONCHAIN_VAULT = {
    prePeginTxHash: "0xmatching_pre_pegin_hash",
    hashlock: "0xonchain_hashlock",
    status: OnChainBtcVaultStatus.PENDING,
  };

  function connectIntentWallet() {
    vi.mocked(useChainConnector).mockReturnValue({
      connectedWallet: {
        account: { address: "bc1qdepositor" },
        provider: {
          connectWallet: vi.fn().mockResolvedValue(undefined),
          getAddress: vi.fn().mockResolvedValue("bc1qdepositor"),
          signPsbt: mockSignPsbt,
          deriveContextHash: vi.fn().mockResolvedValue("ab".repeat(32)),
          approveDepositTerms: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue("0xmatching_pre_pegin_hash");
    mockGetVaultFromChain.mockResolvedValue(ONCHAIN_VAULT as never);
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: makeMatchingProtocolInfoBatch(),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);
    mockVerifyResumeParticipantKeys.mockResolvedValue(undefined);
    vi.mocked(resolveFundedTxFeeAndUtxos).mockResolvedValue(RESOLVED as never);
    vi.mocked(rebuildDepositTerms).mockResolvedValue(REBUILT_TERMS as never);
    mockFetchVaultById.mockResolvedValue(baseVault as never);
  });

  it("rebuilds terms from chain and forwards them (with approval capability) to the broadcast", async () => {
    connectIntentWallet();

    const { result } = renderHook(() => useVaultActions());
    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    // Prevouts resolved once, mempool-only (no same-device record argument).
    expect(resolveFundedTxFeeAndUtxos).toHaveBeenCalledWith(TRUSTED_TX_HEX);
    expect(rebuildDepositTerms).toHaveBeenCalledWith({
      vaultId: "0xvaultId",
      target: ONCHAIN_VAULT,
      fundedPrePeginTxHex: TRUSTED_TX_HEX,
      connectedDepositorAddress: "0xconnected_depositor",
      depositorBtcPubkey: "depositorBtcPubkey",
      fundedTxFee: 1234n,
    });
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        unsignedTxHex: TRUSTED_TX_HEX,
        depositTerms: REBUILT_TERMS,
        expectedUtxos: RESOLVED.expectedUtxos,
        btcWalletProvider: expect.objectContaining({
          approveDepositTerms: expect.any(Function),
          deriveContextHash: expect.any(Function),
        }),
      }),
    );
  });

  it("does not broadcast (and reports the error) when the rebuild fails", async () => {
    connectIntentWallet();
    vi.mocked(rebuildDepositTerms).mockRejectedValue(
      new Error(
        "Sibling vaults of this Pre-PegIn disagree on offchainParamsVersion",
      ),
    );

    const { result } = renderHook(() => useVaultActions());
    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(result.current.broadcastError?.body).toContain("disagree on");
  });

  it("skips the rebuild entirely for a software (signPsbt-only) wallet", async () => {
    vi.mocked(useChainConnector).mockReturnValue({
      connectedWallet: {
        account: { address: "bc1qdepositor" },
        provider: {
          connectWallet: vi.fn().mockResolvedValue(undefined),
          getAddress: vi.fn().mockResolvedValue("bc1qdepositor"),
          signPsbt: mockSignPsbt,
        },
      },
    } as never);

    const { result } = renderHook(() => useVaultActions());
    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(rebuildDepositTerms).not.toHaveBeenCalled();
    expect(resolveFundedTxFeeAndUtxos).not.toHaveBeenCalled();
    const broadcastArg = mockBroadcastPrePeginTransaction.mock.calls[0][0];
    expect("depositTerms" in broadcastArg).toBe(false);
  });

  // The seam guard (ensurePrePeginTermsApproval) must see the capability
  // absent — an always-present wrapper property would turn its typed error
  // into a mid-ceremony TypeError.
  it("does not forward deriveContextHash when the intent wallet lacks it", async () => {
    vi.mocked(useChainConnector).mockReturnValue({
      connectedWallet: {
        account: { address: "bc1qdepositor" },
        provider: {
          connectWallet: vi.fn().mockResolvedValue(undefined),
          getAddress: vi.fn().mockResolvedValue("bc1qdepositor"),
          signPsbt: mockSignPsbt,
          approveDepositTerms: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as never);

    const { result } = renderHook(() => useVaultActions());
    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    const broadcastArg = mockBroadcastPrePeginTransaction.mock.calls[0][0];
    expect("deriveContextHash" in broadcastArg.btcWalletProvider).toBe(false);
    expect("approveDepositTerms" in broadcastArg.btcWalletProvider).toBe(true);
  });

  // The intent path resolves prevouts mempool-only; the local UTXO record
  // helper belongs to the software branch and must never run here.
  it("broadcasts even when the local UTXO record helper would throw", async () => {
    connectIntentWallet();
    vi.mocked(utxosToExpectedRecord).mockImplementation(() => {
      throw new Error("stale local UTXO record");
    });

    const { result } = renderHook(() => useVaultActions());
    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: {
          ...basePendingPegin,
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
    expect(rebuildDepositTerms).toHaveBeenCalledTimes(1);
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
    // Restore the factory default — implementations survive clearAllMocks.
    vi.mocked(utxosToExpectedRecord).mockImplementation(() => ({}));
  });
});

// ============================================================================
// Ethereum finality gate on the resume broadcast path
//
// The resume path can broadcast a Pre-PegIn moments after the ETH registration
// mined (user closes the modal, clicks Broadcast from the dashboard). Doing so
// while the registration is still reorg-exposed can leave BTC locked in an
// HTLC whose vault record no longer exists, so the broadcast waits for depth
// first — including on a cross-device resume, where there is no local record
// and no ETH transaction hash to wait on.
// ============================================================================
describe("useVaultActions — handleBroadcast Ethereum finality gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateBtcTxHash.mockReturnValue("0xmatching_pre_pegin_hash");
    mockGetVaultFromChain.mockResolvedValue({
      prePeginTxHash: "0xmatching_pre_pegin_hash",
      hashlock: "0xonchain_hashlock",
      status: OnChainBtcVaultStatus.PENDING,
      createdAt: 1_000n,
    } as never);
    mockGetVaultRegistryReader.mockReturnValue({
      getProtocolInfoBatch: makeMatchingProtocolInfoBatch(),
    } as unknown as ReturnType<typeof getVaultRegistryReader>);
    mockVerifyResumeParticipantKeys.mockResolvedValue(undefined);
    mockFetchVaultById.mockResolvedValue(baseVault as never);
    // Implementations survive clearAllMocks, so re-assert the default here
    // rather than at the end of the test that overrides it — a failing test
    // would otherwise leak a never-resolving mock into the rest of the file.
    mockAssertUtxosAvailable.mockResolvedValue(undefined);
    mockWaitForEthRegistrationDepth.mockResolvedValue({
      confirmations: 8,
      basicInfo: { status: OnChainBtcVaultStatus.PENDING },
    } as never);
  });

  it("consults the gate before broadcasting, even for an already-deep registration", async () => {
    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    // No "already deep enough" shortcut computed from the earlier vault read:
    // the gate re-reads live registry state and supplies the observation the
    // post-wait status check uses.
    expect(mockWaitForEthRegistrationDepth).toHaveBeenCalledWith(
      expect.objectContaining({ vaultIds: ["0xvaultId"] }),
    );
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
    expect(result.current.broadcastError).toBeNull();
  });

  it("shows no confirmation counter for a registration that is already final", async () => {
    // The gate reports the (large) depth once on its way out. Rendering that
    // would flash a nonsensical counter over a deposit that never waited.
    mockWaitForEthRegistrationDepth.mockImplementation((async (params: {
      onProgress?: (p: { confirmations: number; required: number }) => void;
    }) => {
      params.onProgress?.({ confirmations: 50_000, required: 8 });
      return {
        confirmations: 50_000,
        basicInfo: { status: OnChainBtcVaultStatus.PENDING },
      };
    }) as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(result.current.ethConfirmationDetail).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
  });

  it("waits for depth before broadcasting", async () => {
    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(
      mockWaitForEthRegistrationDepth.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockBroadcastPrePeginTransaction.mock.invocationCallOrder[0],
    );
  });

  it("does not touch the BTC wallet while waiting for depth", async () => {
    mockWaitForEthRegistrationDepth.mockRejectedValue(
      new Error("still waiting for Ethereum confirmations"),
    );

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    // The gate sits ahead of the wallet-liveness probe and everything after
    // it, so a deposit we refuse to broadcast never produces a wallet popup.
    expect(mockSignPsbt).not.toHaveBeenCalled();
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(result.current.broadcastError?.body).toBe(
      "still waiting for Ethereum confirmations",
    );
  });

  it("publishes live confirmation progress while waiting and clears it after", async () => {
    const observed: Array<{ confirmations: number; required: number }> = [];
    mockWaitForEthRegistrationDepth.mockImplementation((async (params: {
      onProgress?: (p: { confirmations: number; required: number }) => void;
    }) => {
      for (const confirmations of [5, 6, 7, 8]) {
        params.onProgress?.({ confirmations, required: 8 });
        observed.push({ confirmations, required: 8 });
      }
      return {
        confirmations: 8,
        basicInfo: { status: OnChainBtcVaultStatus.PENDING },
      };
    }) as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(observed.map((p) => p.confirmations)).toEqual([5, 6, 7, 8]);
    // Cleared once the gate releases, so the panel does not linger over the
    // BTC signing step that follows.
    expect(result.current.ethConfirmationDetail).toBeNull();
  });

  it("passes an abort signal and stops before the wallet when the modal unmounts", async () => {
    let capturedSignal: AbortSignal | undefined;
    let releaseWait: (() => void) | undefined;
    mockWaitForEthRegistrationDepth.mockImplementation((async (params: {
      signal?: AbortSignal;
    }) => {
      capturedSignal = params.signal;
      await new Promise<void>((resolve) => {
        releaseWait = resolve;
      });
      return {
        confirmations: 8,
        basicInfo: { status: OnChainBtcVaultStatus.PENDING },
      };
    }) as never);

    const { result, unmount } = renderHook(() => useVaultActions());

    let broadcastPromise: Promise<void> | undefined;
    await act(async () => {
      broadcastPromise = result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
      await Promise.resolve();
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    // Closing the resume modal must cancel the wait, not leave it running to
    // raise a BTC wallet popup with no UI behind it.
    await act(async () => {
      unmount();
      await new Promise((resolve) => queueMicrotask(() => resolve(null)));
    });

    expect(capturedSignal!.aborted).toBe(true);

    await act(async () => {
      releaseWait?.();
      await broadcastPromise;
    });

    expect(mockSignPsbt).not.toHaveBeenCalled();
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });

  it("does not start signing when the modal unmounts after finality but before the broadcast", async () => {
    // Several network round-trips sit between the finality gate and the
    // signature (UTXO availability, version and key re-checks). Unmounting
    // during one of them must not still raise a signing popup.
    let releaseUtxoCheck: (() => void) | undefined;
    mockAssertUtxosAvailable.mockImplementation((async () => {
      await new Promise<void>((resolve) => {
        releaseUtxoCheck = resolve;
      });
    }) as never);

    const { result, unmount } = renderHook(() => useVaultActions());

    let broadcastPromise: Promise<void> | undefined;
    await act(async () => {
      broadcastPromise = result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
      await Promise.resolve();
    });

    await act(async () => {
      unmount();
      await new Promise((resolve) => queueMicrotask(() => resolve(null)));
    });

    await act(async () => {
      releaseUtxoCheck?.();
      await broadcastPromise;
    });

    expect(mockSignPsbt).not.toHaveBeenCalled();
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });

  it("re-checks the on-chain status after the wait and refuses a vault that left PENDING", async () => {
    // The PENDING gate ran before the wait; a wait spanning minutes can outlive
    // that reading, so the post-wait observation is authoritative.
    mockWaitForEthRegistrationDepth.mockResolvedValue({
      confirmations: 8,
      basicInfo: { status: OnChainBtcVaultStatus.VERIFIED },
    } as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
      });
    });

    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(result.current.broadcastError?.body).toContain("VERIFIED");
  });

  it("applies the gate on a cross-device resume that has no local record", async () => {
    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      // No pendingPegin: the depth proof comes from the chain read, not from
      // localStorage, which is what makes this path gate-able at all.
      await result.current.handleBroadcast({ ...baseBroadcastParams });
    });

    expect(mockWaitForEthRegistrationDepth).toHaveBeenCalledWith(
      expect.objectContaining({ vaultIds: ["0xvaultId"] }),
    );
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledTimes(1);
  });

  it("surfaces a depth timeout as the Ethereum-confirmation copy, not a broadcast failure", async () => {
    // The typed error must survive the catch with its prototype intact. If it
    // is flattened to a string first, the mapper falls through to message
    // matching and the user is told their Bitcoin broadcast failed — when no
    // broadcast was ever attempted.
    mockWaitForEthRegistrationDepth.mockRejectedValue(
      new PeginRegistrationNotFinalError(
        "Peg-in registration did not reach 8 Ethereum confirmations within 600000ms.",
      ),
    );
    const removePendingPeginTyped = vi.fn();

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
        removePendingPegin: removePendingPeginTyped,
      });
    });

    expect(result.current.broadcastError).toEqual(
      COPY.deposit.errors.ethRegistrationNotFinal,
    );
    expect(result.current.broadcastError).not.toEqual(
      COPY.deposit.errors.broadcastFailed,
    );
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    expect(removePendingPeginTyped).not.toHaveBeenCalled();
  });

  it("keeps the pending entry when the depth wait fails", async () => {
    mockWaitForEthRegistrationDepth.mockRejectedValue(
      new Error("Peg-in registration did not reach 8 Ethereum confirmations"),
    );
    const removePendingPegin = vi.fn();

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: { ...basePendingPegin },
        removePendingPegin,
      });
    });

    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
    // The registration is valid and retryable — dropping the record would
    // discard the build-version and key stamps the next attempt needs.
    expect(removePendingPegin).not.toHaveBeenCalled();
    expect(result.current.ethConfirmationDetail).toBeNull();
  });
});
