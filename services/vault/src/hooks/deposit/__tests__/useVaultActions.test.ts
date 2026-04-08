/**
 * Tests for useVaultActions — focusing on transaction integrity validation
 * in handleBroadcast to prevent a compromised indexer from substituting
 * a malicious transaction for signing.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be declared before imports of the module under test
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

vi.mock("@/services/vault/vaultActivationService", () => ({
  activateVaultWithSecret: vi.fn(),
}));

vi.mock("@/utils/btc", () => ({
  stripHexPrefix: vi.fn((hex: string) => hex.replace("0x", "")),
}));

vi.mock("@/utils/htlcSecret", () => ({
  validateSecretAgainstHashlock: vi.fn(),
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

import type { Hex } from "viem";

import { broadcastPrePeginTransaction, fetchVaultById } from "@/services/vault";

import { useVaultActions } from "../useVaultActions";

const mockFetchVaultById = vi.mocked(fetchVaultById);
const mockBroadcastPrePeginTransaction = vi.mocked(
  broadcastPrePeginTransaction,
);

// Local copy produced by WASM — no 0x prefix
const TRUSTED_TX_HEX = "70736274ff...trustedtx";
// Same transaction as returned by the indexer (viem Hex always has 0x prefix)
const GRAPHQL_TX_HEX = `0x${TRUSTED_TX_HEX}`;
// A genuinely different transaction returned by a compromised indexer
const ATTACKER_TX_HEX = "0x70736274ff...attackertx";

const baseVault = {
  unsignedPrePeginTx: GRAPHQL_TX_HEX,
  depositorBtcPubkey: "0xdepositorBtcPubkey",
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
        },
      });
    });

    expect(result.current.broadcastError).toBeNull();
    expect(mockBroadcastPrePeginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ unsignedTxHex: GRAPHQL_TX_HEX }),
    );
  });
});
