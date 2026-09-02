import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcError } from "../../../clients/vault-provider/json-rpc-client";
import { DaemonStatus, RpcErrorCode } from "../../../clients/vault-provider/types";
import type { PeginStatusReader } from "../interfaces";
import { waitForPeginStatus } from "../waitForPeginStatus";

const VALID_TXID = "a".repeat(64);
const VALID_VAULT_ID = `0x${"1".repeat(64)}`;
const TEST_TIMEOUT_MS = 60_000;
const TEST_POLL_INTERVAL_MS = 100;
/** Enough mock responses to outlast the timeout in timeout tests */
const MOCK_RESPONSES_COUNT = 100;

function createMockStatusReader(
  responses: Array<
    { status: string; vault_id?: string; pegin_txid?: string } | Error
  >,
): PeginStatusReader {
  let callIdx = 0;
  return {
    getPeginStatusByVaultId: vi.fn(async () => {
      const response = responses[callIdx++];
      if (response instanceof Error) throw response;
      return {
        pegin_txid: response.pegin_txid ?? VALID_TXID,
        vault_id: response.vault_id ?? VALID_VAULT_ID,
        status: response.status,
        progress: {},
        health_info: "ok",
      };
    }),
  };
}

describe("waitForPeginStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately when status matches on first poll", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES },
    ]);

    const result = await waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.PENDING_DEPOSITOR_SIGNATURES);
    expect(reader.getPeginStatusByVaultId).toHaveBeenCalledOnce();
  });

  it("polls until target status is reached", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_INGESTION },
      { status: DaemonStatus.PENDING_BABE_SETUP },
      { status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES },
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    });

    // Advance past two poll intervals
    await vi.advanceTimersByTimeAsync(250);

    const result = await resultPromise;
    expect(result).toBe(DaemonStatus.PENDING_DEPOSITOR_SIGNATURES);
    expect(reader.getPeginStatusByVaultId).toHaveBeenCalledTimes(3);
  });

  it("treats PEGIN_NOT_FOUND RPC error code as transient and keeps polling", async () => {
    const reader = createMockStatusReader([
      new JsonRpcError(RpcErrorCode.PEGIN_NOT_FOUND, "pegin not found"),
      { status: DaemonStatus.PENDING_DEPOSITOR_WOTS_PK },
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_WOTS_PK]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await resultPromise;
    expect(result).toBe(DaemonStatus.PENDING_DEPOSITOR_WOTS_PK);
    expect(reader.getPeginStatusByVaultId).toHaveBeenCalledTimes(2);
  });

  it("throws non-transient errors immediately", async () => {
    const reader = createMockStatusReader([new Error("Database error")]);

    await expect(
      waitForPeginStatus({
        statusReader: reader,
        vaultId: VALID_VAULT_ID,
        peginTxid: VALID_TXID,
        targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
        timeoutMs: TEST_TIMEOUT_MS,
      }),
    ).rejects.toThrow("Database error");
  });

  it("throws on timeout", async () => {
    const shortTimeoutMs = 500;
    const reader = createMockStatusReader(
      Array(MOCK_RESPONSES_COUNT).fill({ status: DaemonStatus.PENDING_INGESTION }),
    );

    // Attach .catch() immediately to prevent unhandled rejection during timer advancement
    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: shortTimeoutMs,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    }).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(shortTimeoutMs + TEST_POLL_INTERVAL_MS);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Polling timeout");
    expect((error as Error).message).toContain(VALID_VAULT_ID.slice(0, 10));
  });

  it("throws on abort signal", async () => {
    const controller = new AbortController();
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_INGESTION },
    ]);

    // Attach .catch() immediately to prevent unhandled rejection during abort
    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: 1000,
      signal: controller.signal,
    }).catch((e: unknown) => e);

    // Let the first poll complete and start the sleep promise
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Polling aborted");
    expect((error as Error).message).toContain(VALID_VAULT_ID.slice(0, 10));
  });

  it("throws immediately when VP reaches a terminal status", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_INGESTION },
      { status: DaemonStatus.EXPIRED_CLEANED_UP },
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    }).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(150);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("terminal status");
    expect((error as Error).message).toContain("ExpiredCleanedUp");
  });

  it("throws terminal when VP reports IngestionRejected", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_INGESTION },
      ...Array.from({ length: MOCK_RESPONSES_COUNT }, () => ({
        status: DaemonStatus.INGESTION_REJECTED,
      })),
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_WOTS_PK]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    }).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(TEST_TIMEOUT_MS);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("terminal status");
    expect((error as Error).message).toContain("IngestionRejected");
  });

  it("does not treat terminal status as error when it is in the target set", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.EXPIRED_CLEANED_UP },
    ]);

    const result = await waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.EXPIRED_CLEANED_UP]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.EXPIRED_CLEANED_UP);
  });

  it("accepts any status from the target set", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.ACTIVATED },
    ]);

    const result = await waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
        DaemonStatus.ACTIVATED,
      ]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.ACTIVATED);
  });

  it("rejects post-WOTS status echoed for the wrong vault id", async () => {
    const OTHER_VAULT_ID = `0x${"2".repeat(64)}`;
    const reader = createMockStatusReader([
      {
        status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
        vault_id: OTHER_VAULT_ID,
      },
    ]);

    await expect(
      waitForPeginStatus({
        statusReader: reader,
        vaultId: VALID_VAULT_ID,
        peginTxid: VALID_TXID,
        targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
        timeoutMs: TEST_TIMEOUT_MS,
        pollIntervalMs: TEST_POLL_INTERVAL_MS,
      }),
    ).rejects.toThrow(/returned status for vault/);
    // Polling must abort on the first mismatch, not retry — guards
    // against a future regression that catches and re-polls.
    expect(reader.getPeginStatusByVaultId).toHaveBeenCalledOnce();
  });

  it("rejects a status whose attested pegin txid names another pegin", async () => {
    const OTHER_TXID = "b".repeat(64);
    const reader = createMockStatusReader([
      {
        status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
        pegin_txid: OTHER_TXID,
      },
    ]);

    await expect(
      waitForPeginStatus({
        statusReader: reader,
        vaultId: VALID_VAULT_ID,
        peginTxid: VALID_TXID,
        targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
        timeoutMs: TEST_TIMEOUT_MS,
        pollIntervalMs: TEST_POLL_INTERVAL_MS,
      }),
    ).rejects.toThrow(/returned status for pegin/);
    expect(reader.getPeginStatusByVaultId).toHaveBeenCalledOnce();
  });

  it("rejects post-payout status echoed for the wrong vault id", async () => {
    const OTHER_VAULT_ID = `0x${"3".repeat(64)}`;
    const reader = createMockStatusReader([
      { status: DaemonStatus.ACTIVATED, vault_id: OTHER_VAULT_ID },
    ]);

    await expect(
      waitForPeginStatus({
        statusReader: reader,
        vaultId: VALID_VAULT_ID,
        peginTxid: VALID_TXID,
        targetStatuses: new Set([DaemonStatus.ACTIVATED]),
        timeoutMs: TEST_TIMEOUT_MS,
        pollIntervalMs: TEST_POLL_INTERVAL_MS,
      }),
    ).rejects.toThrow(/returned status for vault/);
    expect(reader.getPeginStatusByVaultId).toHaveBeenCalledOnce();
  });

  it("returns ACTIVATED as success-via-overshoot when target was an earlier state", async () => {
    // Caller asked to wait for PENDING_ACTIVATION but VP raced past to
    // ACTIVATED. The goal (reach some earlier state) is satisfied; the
    // function should return rather than time out.
    const reader = createMockStatusReader([
      { status: DaemonStatus.ACTIVATED },
    ]);

    const result = await waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_ACTIVATION]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.ACTIVATED);
    expect(reader.getPeginStatusByVaultId).toHaveBeenCalledOnce();
  });

  it("matches on echoed vault id regardless of case and 0x prefix", async () => {
    const reader = createMockStatusReader([
      {
        status: DaemonStatus.ACTIVATED,
        vault_id: VALID_VAULT_ID.slice(2).toUpperCase(),
      },
    ]);

    const result = await waitForPeginStatus({
      statusReader: reader,
      vaultId: VALID_VAULT_ID,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.ACTIVATED]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.ACTIVATED);
  });
});
