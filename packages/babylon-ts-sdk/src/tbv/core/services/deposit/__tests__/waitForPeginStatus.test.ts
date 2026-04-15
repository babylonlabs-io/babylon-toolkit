import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcError } from "../../../clients/vault-provider/json-rpc-client";
import { DaemonStatus, RpcErrorCode } from "../../../clients/vault-provider/types";
import type { PeginStatusReader } from "../interfaces";
import { waitForPeginStatus } from "../waitForPeginStatus";

const VALID_TXID = "a".repeat(64);
const TEST_TIMEOUT_MS = 60_000;
const TEST_POLL_INTERVAL_MS = 100;
/** Enough mock responses to outlast the timeout in timeout tests */
const MOCK_RESPONSES_COUNT = 100;

function createMockStatusReader(
  responses: Array<{ status: string } | Error>,
): PeginStatusReader {
  let callIdx = 0;
  return {
    getPeginStatus: vi.fn(async () => {
      const response = responses[callIdx++];
      if (response instanceof Error) throw response;
      return {
        pegin_txid: VALID_TXID,
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
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.PENDING_DEPOSITOR_SIGNATURES);
    expect(reader.getPeginStatus).toHaveBeenCalledOnce();
  });

  it("polls until target status is reached", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_INGESTION },
      { status: DaemonStatus.PENDING_BABE_SETUP },
      { status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES },
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    });

    // Advance past two poll intervals
    await vi.advanceTimersByTimeAsync(250);

    const result = await resultPromise;
    expect(result).toBe(DaemonStatus.PENDING_DEPOSITOR_SIGNATURES);
    expect(reader.getPeginStatus).toHaveBeenCalledTimes(3);
  });

  it("treats 'PegIn not found' error message as transient and keeps polling", async () => {
    const reader = createMockStatusReader([
      new Error("PegIn not found"),
      new Error("PegIn not found"),
      { status: DaemonStatus.PENDING_DEPOSITOR_WOTS_PK },
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_WOTS_PK]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    });

    await vi.advanceTimersByTimeAsync(250);

    const result = await resultPromise;
    expect(result).toBe(DaemonStatus.PENDING_DEPOSITOR_WOTS_PK);
    expect(reader.getPeginStatus).toHaveBeenCalledTimes(3);
  });

  it("treats NOT_FOUND RPC error code as transient and keeps polling", async () => {
    const reader = createMockStatusReader([
      new JsonRpcError(RpcErrorCode.NOT_FOUND, "not found"),
      { status: DaemonStatus.PENDING_DEPOSITOR_WOTS_PK },
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_WOTS_PK]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await resultPromise;
    expect(result).toBe(DaemonStatus.PENDING_DEPOSITOR_WOTS_PK);
    expect(reader.getPeginStatus).toHaveBeenCalledTimes(2);
  });

  it("throws non-transient errors immediately", async () => {
    const reader = createMockStatusReader([new Error("Database error")]);

    await expect(
      waitForPeginStatus({
        statusReader: reader,
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
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: shortTimeoutMs,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    }).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(shortTimeoutMs + TEST_POLL_INTERVAL_MS);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Polling timeout");
    expect((error as Error).message).toContain(VALID_TXID.slice(0, 8));
  });

  it("throws on abort signal", async () => {
    const controller = new AbortController();
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_INGESTION },
    ]);

    // Attach .catch() immediately to prevent unhandled rejection during abort
    const resultPromise = waitForPeginStatus({
      statusReader: reader,
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
    expect((error as Error).message).toContain(VALID_TXID.slice(0, 8));
  });

  it("throws immediately when VP reaches a terminal status", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.PENDING_INGESTION },
      { status: DaemonStatus.EXPIRED },
    ]);

    const resultPromise = waitForPeginStatus({
      statusReader: reader,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.PENDING_DEPOSITOR_SIGNATURES]),
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: TEST_POLL_INTERVAL_MS,
    }).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(150);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("terminal status");
    expect((error as Error).message).toContain("Expired");
  });

  it("does not treat terminal status as error when it is in the target set", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.EXPIRED },
    ]);

    const result = await waitForPeginStatus({
      statusReader: reader,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([DaemonStatus.EXPIRED]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.EXPIRED);
  });

  it("accepts any status from the target set", async () => {
    const reader = createMockStatusReader([
      { status: DaemonStatus.ACTIVATED },
    ]);

    const result = await waitForPeginStatus({
      statusReader: reader,
      peginTxid: VALID_TXID,
      targetStatuses: new Set([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
        DaemonStatus.ACTIVATED,
      ]),
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toBe(DaemonStatus.ACTIVATED);
  });
});
