import { DaemonStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { TerminalPeginPollingError } from "@/utils/peginPolling";

import { applyPerDepositStatus } from "../usePeginPollingQuery";

describe("applyPerDepositStatus", () => {
  it("treats IngestionRejected as terminal and clears WOTS readiness", () => {
    const depositId = "vault-1";
    const errors = new Map<string, Error>();
    const needsWotsKey = new Set([depositId]);
    const pendingIngestion = new Set<string>();
    const pendingDepositorSignatures = new Set<string>();

    applyPerDepositStatus(
      {
        pegin_txid: "txid",
        status: DaemonStatus.INGESTION_REJECTED,
        progress: {},
        health_info: "ok",
      },
      depositId,
      {
        errors,
        needsWotsKey,
        pendingIngestion,
        pendingDepositorSignatures,
      },
    );

    const error = errors.get(depositId);
    expect(error).toBeInstanceOf(TerminalPeginPollingError);
    expect((error as TerminalPeginPollingError).daemonStatus).toBe(
      DaemonStatus.INGESTION_REJECTED,
    );
    expect(error?.message).toBe(COPY.pegin.statusErrors.ingestionRejected);
    expect(needsWotsKey.has(depositId)).toBe(false);
  });
});
