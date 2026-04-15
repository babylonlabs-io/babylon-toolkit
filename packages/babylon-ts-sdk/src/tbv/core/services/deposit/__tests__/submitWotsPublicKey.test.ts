import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DaemonStatus } from "../../../clients/vault-provider/types";
import type { GetPeginStatusResponse } from "../../../clients/vault-provider/types";
import type { PeginStatusReader, WotsKeySubmitter } from "../interfaces";
import { submitWotsPublicKey } from "../submitWotsPublicKey";

const VALID_TXID = "a".repeat(64);
const VALID_DEPOSITOR_PK = "b".repeat(64);
const TEST_TIMEOUT_MS = 60_000;

function createMockStatusReader(
  statuses: DaemonStatus[],
): PeginStatusReader {
  let callIdx = 0;
  return {
    getPeginStatus: vi.fn(async (): Promise<GetPeginStatusResponse> => ({
      pegin_txid: VALID_TXID,
      status: statuses[callIdx++] ?? DaemonStatus.PENDING_INGESTION,
      progress: {},
      health_info: "ok",
    })),
  };
}

function createMockWotsSubmitter(): WotsKeySubmitter {
  return {
    submitDepositorWotsKey: vi.fn(async () => {}),
  };
}

describe("submitWotsPublicKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits WOTS keys when VP is in PENDING_DEPOSITOR_WOTS_PK", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_WOTS_PK,
    ]);
    const submitter = createMockWotsSubmitter();
    const wotsKeys = [{ config: {} as never, message_terminals: [], checksum_major_terminal: [], checksum_minor_terminal: [] }];

    await submitWotsPublicKey({
      statusReader: reader,
      wotsSubmitter: submitter,
      peginTxid: VALID_TXID,
      depositorPk: VALID_DEPOSITOR_PK,
      wotsPublicKeys: wotsKeys,
    });

    expect(submitter.submitDepositorWotsKey).toHaveBeenCalledWith(
      {
        pegin_txid: VALID_TXID,
        depositor_pk: VALID_DEPOSITOR_PK,
        wots_public_keys: wotsKeys,
      },
      undefined, // signal
    );
  });

  it("skips submission when VP is already past WOTS step", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const submitter = createMockWotsSubmitter();

    await submitWotsPublicKey({
      statusReader: reader,
      wotsSubmitter: submitter,
      peginTxid: VALID_TXID,
      depositorPk: VALID_DEPOSITOR_PK,
      wotsPublicKeys: [],
    });

    expect(submitter.submitDepositorWotsKey).not.toHaveBeenCalled();
  });

  it("skips submission when VP is in ACTIVATED state", async () => {
    const reader = createMockStatusReader([DaemonStatus.ACTIVATED]);
    const submitter = createMockWotsSubmitter();

    await submitWotsPublicKey({
      statusReader: reader,
      wotsSubmitter: submitter,
      peginTxid: VALID_TXID,
      depositorPk: VALID_DEPOSITOR_PK,
      wotsPublicKeys: [],
    });

    expect(submitter.submitDepositorWotsKey).not.toHaveBeenCalled();
  });

  it("polls until VP reaches WOTS step then submits", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_INGESTION,
      DaemonStatus.PENDING_DEPOSITOR_WOTS_PK,
    ]);
    const submitter = createMockWotsSubmitter();

    const resultPromise = submitWotsPublicKey({
      statusReader: reader,
      wotsSubmitter: submitter,
      peginTxid: VALID_TXID,
      depositorPk: VALID_DEPOSITOR_PK,
      wotsPublicKeys: [],
      timeoutMs: TEST_TIMEOUT_MS,
    });

    // Advance past the default poll interval (10s)
    await vi.advanceTimersByTimeAsync(15_000);

    await resultPromise;
    expect(submitter.submitDepositorWotsKey).toHaveBeenCalledOnce();
  });

  it("throws when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      submitWotsPublicKey({
        statusReader: createMockStatusReader([]),
        wotsSubmitter: createMockWotsSubmitter(),
        peginTxid: VALID_TXID,
        depositorPk: VALID_DEPOSITOR_PK,
        wotsPublicKeys: [],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
