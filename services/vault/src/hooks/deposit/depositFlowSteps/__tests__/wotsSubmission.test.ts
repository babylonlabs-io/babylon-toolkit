import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  batchPollByProvider,
  batchGetPeginStatusByVaultId,
  createVpClient,
  statusesByCall,
} = vi.hoisted(() => ({
  batchPollByProvider: vi.fn(),
  batchGetPeginStatusByVaultId: vi.fn(),
  createVpClient: vi.fn(),
  statusesByCall: [] as Array<Record<string, string>>,
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
  >()),
  batchPollByProvider,
}));

vi.mock("@/utils/rpc", () => ({ createVpClient }));
vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { waitForWotsReadiness } from "../wotsSubmission";

const VAULT_0: Hex = `0x${"a0".repeat(32)}`;
const VAULT_1: Hex = `0x${"a1".repeat(32)}`;
const PEGIN_0: Hex = `0x${"b0".repeat(32)}`;
const PEGIN_1: Hex = `0x${"b1".repeat(32)}`;
const VAULTS = [
  { vaultId: VAULT_0, peginTxHash: PEGIN_0 },
  { vaultId: VAULT_1, peginTxHash: PEGIN_1 },
];

function setupBatchPoll() {
  createVpClient.mockReturnValue({ batchGetPeginStatusByVaultId });
  batchPollByProvider.mockImplementation(async ({ items, onItem }) => {
    const callIndex = batchPollByProvider.mock.calls.length - 1;
    const statuses = statusesByCall[callIndex] ?? {};
    for (const item of items) {
      const status = statuses[item.vaultId];
      if (!status) {
        onItem(item, { result: null, error: "PegIn not found" });
        continue;
      }
      onItem(item, {
        result: { status, pegin_txid: item.peginTxHash.slice(2) },
        error: null,
      });
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
        [VAULT_0]: "PendingIngestion",
        [VAULT_1]: "PendingIngestion",
      },
      {
        [VAULT_0]: "PendingDepositorWotsPK",
        [VAULT_1]: "PendingDepositorWotsPK",
      },
    );
    setupBatchPoll();

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_0, VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(2);
  });

  it("returns only ready or post-WOTS vaults when readiness times out", async () => {
    statusesByCall.push({
      [VAULT_0]: "PendingIngestion",
      [VAULT_1]: "PendingBabeSetup",
    });
    setupBatchPoll();

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 0,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(1);
  });

  it("returns terminal vaults separately from ready vaults", async () => {
    statusesByCall.push({
      [VAULT_0]: "IngestionRejected",
      [VAULT_1]: "PendingDepositorWotsPK",
    });
    setupBatchPoll();

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([VAULT_0]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(1);
  });

  it("treats BabeSetupFailed as terminal", async () => {
    statusesByCall.push({
      [VAULT_0]: "BabeSetupFailed",
      [VAULT_1]: "PendingDepositorWotsPK",
    });
    setupBatchPoll();

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([VAULT_0]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(1);
  });

  it("treats an unrecognized status as terminal for that vault only", async () => {
    createVpClient.mockReturnValue({ batchGetPeginStatusByVaultId });
    batchPollByProvider.mockImplementation(async ({ items, onItem }) => {
      onItem(items[0], {
        result: null,
        error:
          'VP response validation failed: unrecognized status "FutureStatus". Expected one of: Activated',
      });
      onItem(items[1], {
        result: {
          status: "PendingDepositorWotsPK",
          pegin_txid: PEGIN_1.slice(2),
        },
        error: null,
      });
    });

    const result = await waitForWotsReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([VAULT_0]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(1);
  });
});
