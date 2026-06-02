import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  batchPollByProvider,
  batchGetPeginStatus,
  createVpClient,
  statusesByCall,
} = vi.hoisted(() => ({
  batchPollByProvider: vi.fn(),
  batchGetPeginStatus: vi.fn(),
  createVpClient: vi.fn(),
  statusesByCall: [] as Array<Record<string, string>>,
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", () => {
  const DaemonStatus = {
    PENDING_INGESTION: "PendingIngestion",
    PENDING_DEPOSITOR_WOTS_PK: "PendingDepositorWotsPK",
    PENDING_BABE_SETUP: "PendingBabeSetup",
    PENDING_DEPOSITOR_SIGNATURES: "PendingDepositorSignatures",
    EXPIRED: "Expired",
    INGESTION_REJECTED: "IngestionRejected",
    INVALID_SIG_IN_CONTRACT: "InvalidSigInContract",
  };
  return {
    DaemonStatus,
    VP_TRANSIENT_STATUSES: new Set([DaemonStatus.PENDING_BABE_SETUP]),
    VP_TERMINAL_FAILURE_STATUSES: new Set([
      DaemonStatus.INGESTION_REJECTED,
      DaemonStatus.INVALID_SIG_IN_CONTRACT,
    ]),
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

import { waitForWotsReadiness } from "../wotsSubmission";

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
  });
}

describe("waitForWotsReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusesByCall.length = 0;
  });

  it("waits through ingestion and returns all vaults once WOTS-ready", async () => {
    statusesByCall.push(
      {
        "0xVault0": "PendingIngestion",
        "0xVault1": "PendingIngestion",
      },
      {
        "0xVault0": "PendingDepositorWotsPK",
        "0xVault1": "PendingDepositorWotsPK",
      },
    );
    setupBatchPoll();

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual(["0xVault0", "0xVault1"]);
    expect([...result.terminalVaultIds]).toEqual([]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(2);
  });

  it("returns only ready or post-WOTS vaults when readiness times out", async () => {
    statusesByCall.push({
      "0xVault0": "PendingIngestion",
      "0xVault1": "PendingBabeSetup",
    });
    setupBatchPoll();

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 0,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual(["0xVault1"]);
    expect([...result.terminalVaultIds]).toEqual([]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(1);
  });

  it("returns terminal vaults separately from ready vaults", async () => {
    statusesByCall.push({
      "0xVault0": "IngestionRejected",
      "0xVault1": "PendingDepositorWotsPK",
    });
    setupBatchPoll();

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual(["0xVault1"]);
    expect([...result.terminalVaultIds]).toEqual(["0xVault0"]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(1);
  });
});
