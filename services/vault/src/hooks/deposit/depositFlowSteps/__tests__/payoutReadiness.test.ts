import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  batchPollByProvider,
  batchGetPeginStatusByVaultId,
  createVpClient,
  statusesByCall,
  abortAfterFirstPoll,
} = vi.hoisted(() => ({
  batchPollByProvider: vi.fn(),
  batchGetPeginStatusByVaultId: vi.fn(),
  createVpClient: vi.fn(),
  statusesByCall: [] as Array<Record<string, string>>,
  abortAfterFirstPoll: { controller: null as AbortController | null },
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

import { waitForPayoutReadiness } from "../payoutReadiness";

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
        [VAULT_0]: "PendingPrePegInConfirmations",
        [VAULT_1]: "PendingPrePegInConfirmations",
      },
      {
        [VAULT_0]: "PendingDepositorSignatures",
        [VAULT_1]: "PendingDepositorSignatures",
      },
    );
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_0, VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(2);
  });

  it("returns only ready siblings when readiness times out", async () => {
    statusesByCall.push({
      [VAULT_0]: "PendingPrePegInConfirmations",
      [VAULT_1]: "PendingACKs",
    });
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 0,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([]);
  });

  it("returns terminal siblings separately", async () => {
    statusesByCall.push({
      [VAULT_0]: "IngestionRejected",
      [VAULT_1]: "PendingDepositorSignatures",
    });
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([VAULT_0]);
  });

  it("treats BabeSetupFailed as terminal", async () => {
    statusesByCall.push({
      [VAULT_0]: "BabeSetupFailed",
      [VAULT_1]: "PendingDepositorSignatures",
    });
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([VAULT_0]);
    expect(batchPollByProvider).toHaveBeenCalledTimes(1);
  });

  it("treats PegIn not found and missing statuses as waiting until timeout", async () => {
    statusesByCall.push({
      [VAULT_1]: "PendingDepositorSignatures",
    });
    setupBatchPoll();

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 0,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([]);
  });

  it("keeps a vault waiting when the status names another peg-in", async () => {
    createVpClient.mockReturnValue({ batchGetPeginStatusByVaultId });
    batchPollByProvider.mockImplementation(async ({ items, onItem }) => {
      onItem(items[0], {
        result: { status: "IngestionRejected", pegin_txid: "cd".repeat(32) },
        error: null,
      });
      onItem(items[1], {
        result: {
          status: "PendingDepositorSignatures",
          pegin_txid: PEGIN_1.slice(2).toUpperCase(),
        },
        error: null,
      });
    });

    const result = await waitForPayoutReadiness({
      vaults: VAULTS,
      providerAddress: "0xProvider",
      timeoutMs: 0,
      pollIntervalMs: 0,
    });

    expect([...result.readyVaultIds]).toEqual([VAULT_1]);
    expect([...result.terminalVaultIds]).toEqual([]);
  });

  it("aborts while waiting", async () => {
    const controller = new AbortController();
    abortAfterFirstPoll.controller = controller;
    statusesByCall.push({
      [VAULT_0]: "PendingPrePegInConfirmations",
      [VAULT_1]: "PendingPrePegInConfirmations",
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
