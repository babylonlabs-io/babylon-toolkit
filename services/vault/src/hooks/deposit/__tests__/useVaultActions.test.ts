/**
 * Tests for useVaultActions — focusing on transaction integrity validation
 * in handleBroadcast to prevent a compromised indexer from substituting
 * a malicious transaction for signing.
 */

import { act, renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { ContractStatus } from "@/models/peginStateMachine";
import { broadcastPrePeginTransaction, fetchVaultById } from "@/services/vault";
import { activateVaultWithSecret } from "@/services/vault/vaultActivationService";

import { useVaultActions } from "../useVaultActions";

vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: vi.fn(() => ({ id: 11155111 })),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  ensureHexPrefix: vi.fn((v: string) => (v.startsWith("0x") ? v : `0x${v}`)),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: vi.fn(() => ({})),
  useChainConnector: vi.fn(() => ({
    connectedWallet: {
      provider: {
        getAddress: vi.fn().mockResolvedValue("bc1qdepositor"),
        signPsbt: vi.fn().mockResolvedValue("signedPsbt"),
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

vi.mock("@/utils/btc", () => ({
  stripHexPrefix: vi.fn((hex: string) => hex.replace("0x", "")),
}));

vi.mock("@/models/peginStateMachine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/models/peginStateMachine")>();
  return {
    ...actual,
    getNextLocalStatus: vi.fn(() => "CONFIRMING"),
    PeginAction: {
      SIGN_AND_BROADCAST_TO_BITCOIN: "SIGN_AND_BROADCAST_TO_BITCOIN",
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
const mockGetVaultRegistryReader = vi.mocked(getVaultRegistryReader);
const mockActivateVaultWithSecret = vi.mocked(activateVaultWithSecret);

/** Build a fake reader that returns a fixed protocolInfo from getVaultProtocolInfo. */
function readerReturning(
  protocolInfo: Record<string, unknown>,
): ReturnType<typeof getVaultRegistryReader> {
  return {
    getVaultProtocolInfo: vi.fn().mockResolvedValue(protocolInfo),
    getVaultBasicInfo: vi.fn(),
    getVaultData: vi.fn(),
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

const baseBroadcastParams = {
  activityId: "0xvaultId" as Hex,
  activityAmount: "0.01",
  activityProviders: [{ id: "0xprovider" }],
  onRefetchActivities: vi.fn(),
  onShowSuccessModal: vi.fn(),
};

describe("useVaultActions — handleBroadcast transaction integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("broadcasts using local tx when it matches GraphQL", async () => {
    mockFetchVaultById.mockResolvedValue(baseVault as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: {
          id: "0xvaultId" as Hex,
          timestamp: Date.now(),
          status: "PENDING" as never,
          peginTxHash: "0xpeginTxHash" as Hex,
          unsignedTxHex: TRUSTED_TX_HEX,
        },
      });
    });

    expect(result.current.broadcastError).toBeNull();
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
        pendingPegin: {
          id: "0xvaultId" as Hex,
          timestamp: Date.now(),
          status: "PENDING" as never,
          peginTxHash: "0xpeginTxHash" as Hex,
          unsignedTxHex: TRUSTED_TX_HEX,
        },
      });
    });

    expect(result.current.broadcastError).toContain("Transaction mismatch");
  });

  it("uses GraphQL tx when no local copy is available (cross-device)", async () => {
    mockFetchVaultById.mockResolvedValue(baseVault as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: undefined,
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ unsignedTxHex: GRAPHQL_TX_HEX }),
    );
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
        pendingPegin: undefined,
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
        pendingPegin: undefined,
      });
    });

    expect(result.current.broadcastError).toContain("VERIFIED");
    expect(mockBroadcastPrePeginTransaction).not.toHaveBeenCalled();
  });

  it("uses GraphQL tx when pendingPegin has no unsignedTxHex (cross-device)", async () => {
    mockFetchVaultById.mockResolvedValue(baseVault as never);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleBroadcast({
        ...baseBroadcastParams,
        pendingPegin: {
          id: "0xvaultId" as Hex,
          timestamp: Date.now(),
          status: "PENDING" as never,
          peginTxHash: "0xpeginTxHash" as Hex,
          unsignedTxHex: "",
        },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ unsignedTxHex: GRAPHQL_TX_HEX }),
    );
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

    expect(reader.getVaultProtocolInfo).toHaveBeenCalledWith("0xvaultId");
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

    expect(reader.getVaultProtocolInfo).toHaveBeenCalled();
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
      "Vault hashlock not found. The vault may not support activation.",
    );
  });

  it("surfaces a vault-not-found error when on-chain depositorSignedPeginTx is empty", async () => {
    const reader = readerReturning({
      depositorSignedPeginTx: "0x",
      hashlock: ON_CHAIN_HASHLOCK,
    });
    mockGetVaultRegistryReader.mockReturnValue(reader);

    const { result } = renderHook(() => useVaultActions());

    await act(async () => {
      await result.current.handleActivation(baseActivationParams);
    });

    expect(mockActivateVaultWithSecret).not.toHaveBeenCalled();
    // Raw "not found on-chain" detail is normalized to a friendly message
    // and the vault id is not echoed back in the UI.
    expect(result.current.activationError).toBe(
      "Vault not found. The vault ID may be invalid.",
    );
    expect(result.current.activationError).not.toContain("0xvaultId");
  });
});
