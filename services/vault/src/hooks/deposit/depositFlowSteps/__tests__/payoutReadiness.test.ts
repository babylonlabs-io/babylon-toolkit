import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  batchPollByProvider,
  batchGetPeginStatus,
  createVpClient,
  statusesByCall,
  abortAfterFirstPoll,
} = vi.hoisted(() => ({
  batchPollByProvider: vi.fn(),
  batchGetPeginStatus: vi.fn(),
  createVpClient: vi.fn(),
  statusesByCall: [] as Array<Record<string, string>>,
  abortAfterFirstPoll: { controller: null as AbortController | null },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", () => {
  const DaemonStatus = {
    PENDING_INGESTION: "PendingIngestion",
    PENDING_DEPOSITOR_WOTS_PK: "PendingDepositorWotsPK",
    PENDING_BABE_SETUP: "PendingBabeSetup",
    PENDING_CHALLENGER_PRESIGNING: "PendingChallengerPresigning",
    PENDING_PEGIN_SIGS_AVAILABILITY: "PendingPeginSigsAvailability",
    PENDING_PRE_PEGIN_CONFIRMATIONS: "PendingPrePegInConfirmations",
    PENDING_DEPOSITOR_SIGNATURES: "PendingDepositorSignatures",
    PENDING_ACKS: "PendingACKs",
    PENDING_ACTIVATION: "PendingActivation",
    ACTIVATED_PENDING_BROADCAST: "ActivatedPendingBroadcast",
    ACTIVATED: "Activated",
    EXPIRED: "Expired",
    INGESTION_REJECTED: "IngestionRejected",
  };
  return {
    DaemonStatus,
    VP_TERMINAL_FAILURE_STATUSES: new Set([DaemonStatus.INGESTION_REJECTED]),
    VpResponseValidationError: class extends Error {
      detail = "validation error";
    },
    batchPollByProvider,
  };
});

vi.mock("@/utils/rpc", () => ({ createVpClient }));
vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { waitForPayoutReadiness } from "../payoutReadiness";

const VAULTS = [
  { vaultId: "0xVault0" as Hex, peginTxHash: "0xPegin0" as Hex },
  { vaultId: "0xVault1" as Hex, peginTxHash: "0xPegin1" as Hex },
];

function setupBatchPoll() {
  createVpClient.mockReturnValue({ batchGetPeginStatus });
  batchPollByProvider.mockImplementation(async ({ items, onItem }) => {
    const callIndex = batchPollByProvider.mock.calls.length - 1;
    const statuses = statusesByCall[callIndex] ?? {};
    for (const item of items) {
      const status = statuses[item.vaultId];
      if (!status) {
        onItem(item, { result: null, error: "PegIn not found" });
        continue;
      }
      onItem(item, { result: { status }, error: null });
    }
    abortAfterFirstPoll.controller?.abort();
  });
}

describe("waitForPayoutReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusesByCall.length = 0;
    abortAfterFirstPoll.controller = null;
  });

  it("waits through pre-signature states until depositor signatures are ready", async () => {
    statusesByCall.push(
      {
        "0xVault0": "PendingPrePegInConfirmations",
        "0xVault1": "PendingPrePegInConfirmations",
      },
      {
        "0xVault0": "PendingDepositorSignatures",
        "0xVault1": "PendingDepositorSignatures",
      },
    );
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual(["0xVault0", "0xVault1"]);
    expect([...result.terminalVaultIds]).toEqual([]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(2);
  });

  it("returns only ready siblings when readiness times out", async () => {
    statusesByCall.push({
      "0xVault0": "PendingPrePegInConfirmations",
      "0xVault1": "PendingACKs",
    });
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 0,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual(["0xVault1"]);
    expect([...result.terminalVaultIds]).toEqual([]);
  });

  it("returns terminal siblings separately", async () => {
    statusesByCall.push({
      "0xVault0": "IngestionRejected",
      "0xVault1": "PendingDepositorSignatures",
    });
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual(["0xVault1"]);
    expect([...result.terminalVaultIds]).toEqual(["0xVault0"]);
  });

  it("treats PegIn not found and missing statuses as waiting until timeout", async () => {
    statusesByCall.push({
      "0xVault1": "PendingDepositorSignatures",
    });
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 0,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual(["0xVault1"]);
    expect([...result.terminalVaultIds]).toEqual([]);
  });

  it("aborts while waiting", async () => {
    const controller = new AbortController();
    abortAfterFirstPoll.controller = controller;
    statusesByCall.push({
      "0xVault0": "PendingPrePegInConfirmations",
      "0xVault1": "PendingPrePegInConfirmations",
    });
    setupBatchPoll();

    await expect(
      waitForPayoutReadiness({
        vaults: VAULTS,
        providerAddress: "0xProvider",
        signal: controller.signal,
        timeoutMs: 1_000,
        pollIntervalMs: 1_000,
      }),
    ).rejects.toThrow(/abort/i);
  });
});
