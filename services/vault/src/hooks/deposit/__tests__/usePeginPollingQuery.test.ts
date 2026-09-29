import {
  DaemonStatus,
  VP_TERMINAL_FAILURE_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import type { DepositToPoll } from "@/types/peginPolling";
import {
  TerminalPeginPollingError,
  UNRECOGNIZED_DAEMON_STATUS,
} from "@/utils/peginPolling";

import {
  applyPerDepositError,
  applyPerDepositResult,
  applyPerDepositStatus,
} from "../usePeginPollingQuery";

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
        vault_id: `0x${"ab".repeat(32)}`,
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

  it.each([DaemonStatus.EXPIRED, ...VP_TERMINAL_FAILURE_STATUSES])(
    "sets a terminal error with a message for %s",
    (status) => {
      const depositId = "vault-1";
      const errors = new Map<string, Error>();

      applyPerDepositStatus(
        {
          pegin_txid: "txid",
          vault_id: `0x${"ab".repeat(32)}`,
          status,
          progress: {},
          health_info: "ok",
        },
        depositId,
        {
          errors,
          needsWotsKey: new Set<string>(),
          pendingIngestion: new Set<string>(),
          pendingDepositorSignatures: new Set<string>(),
        },
      );

      const error = errors.get(depositId);
      expect(error).toBeInstanceOf(TerminalPeginPollingError);
      expect((error as TerminalPeginPollingError).daemonStatus).toBe(status);
      expect(error?.message).not.toBe("");
    },
  );

  it("treats BabeSetupFailed as terminal with its own message", () => {
    const depositId = "vault-1";
    const errors = new Map<string, Error>();
    const needsWotsKey = new Set<string>();

    applyPerDepositStatus(
      {
        pegin_txid: "txid",
        vault_id: `0x${"ab".repeat(32)}`,
        status: DaemonStatus.BABE_SETUP_FAILED,
        progress: {},
        health_info: "ok",
      },
      depositId,
      {
        errors,
        needsWotsKey,
        pendingIngestion: new Set<string>(),
        pendingDepositorSignatures: new Set<string>(),
      },
    );

    const error = errors.get(depositId);
    expect(error).toBeInstanceOf(TerminalPeginPollingError);
    expect((error as TerminalPeginPollingError).daemonStatus).toBe(
      DaemonStatus.BABE_SETUP_FAILED,
    );
    expect(error?.message).toBe(COPY.pegin.statusErrors.babeSetupFailed);
  });
});

describe("applyPerDepositError", () => {
  it("flags an unrecognized status as a terminal error for that deposit only", () => {
    const depositId = "vault-2";
    const errors = new Map<string, Error>();
    const needsWotsKey = new Set([depositId]);

    applyPerDepositError(
      'VP response validation failed: unrecognized status "FutureStatus". Expected one of: Activated',
      depositId,
      { errors, needsWotsKey, pendingIngestion: new Set<string>() },
    );

    const error = errors.get(depositId);
    expect(error).toBeInstanceOf(TerminalPeginPollingError);
    expect((error as TerminalPeginPollingError).daemonStatus).toBe(
      UNRECOGNIZED_DAEMON_STATUS,
    );
    expect(error?.message).toBe(COPY.pegin.statusErrors.unrecognizedStatus);
    expect(needsWotsKey.has(depositId)).toBe(false);
  });

  it("treats an unrecognized status as terminal even when its text contains 'PegIn not found'", () => {
    const depositId = "vault-4";
    const errors = new Map<string, Error>();
    const pendingIngestion = new Set<string>();

    applyPerDepositError(
      'VP response validation failed: unrecognized status "PegIn not found". Expected one of: Activated',
      depositId,
      { errors, needsWotsKey: new Set<string>(), pendingIngestion },
    );

    expect(
      (errors.get(depositId) as TerminalPeginPollingError).daemonStatus,
    ).toBe(UNRECOGNIZED_DAEMON_STATUS);
    expect(pendingIngestion.has(depositId)).toBe(false);
  });

  it("keeps any other item error as a non-terminal error", () => {
    const depositId = "vault-3";
    const errors = new Map<string, Error>();

    applyPerDepositError("database unavailable", depositId, {
      errors,
      needsWotsKey: new Set<string>(),
      pendingIngestion: new Set<string>(),
    });

    const error = errors.get(depositId);
    expect(error).not.toBeInstanceOf(TerminalPeginPollingError);
    expect(error?.message).toBe("database unavailable");
  });
});

describe("applyPerDepositResult", () => {
  const PEGIN_TXID = "ab".repeat(32);

  function deposit(peginTxHash: string | undefined): DepositToPoll {
    // Only the activity id and peg-in txid are read by the function.
    return {
      activity: { id: "vault-1", peginTxHash },
    } as unknown as DepositToPoll;
  }

  function sets() {
    return {
      errors: new Map<string, Error>(),
      needsWotsKey: new Set<string>(),
      pendingIngestion: new Set<string>(),
      pendingDepositorSignatures: new Set<string>(),
    };
  }

  function statusFor(peginTxid: string) {
    return {
      pegin_txid: peginTxid,
      vault_id: `0x${"cd".repeat(32)}`,
      status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      progress: {},
      health_info: "ok",
    };
  }

  it("applies a status whose pegin txid matches across 0x prefix and case", () => {
    const target = sets();

    applyPerDepositResult(
      statusFor(PEGIN_TXID.toUpperCase()),
      deposit(`0x${PEGIN_TXID}`),
      target,
    );

    expect(target.errors.has("vault-1")).toBe(false);
    expect(target.pendingDepositorSignatures.has("vault-1")).toBe(true);
  });

  it("rejects a status that names another peg-in", () => {
    const target = sets();

    applyPerDepositResult(
      statusFor("ef".repeat(32)),
      deposit(`0x${PEGIN_TXID}`),
      target,
    );

    expect(target.errors.get("vault-1")?.message).toBe(
      "Provider returned another peg-in's status entry",
    );
    expect(target.pendingDepositorSignatures.has("vault-1")).toBe(false);
  });

  it("rejects a status when the deposit has no peg-in txid", () => {
    const target = sets();

    applyPerDepositResult(statusFor(PEGIN_TXID), deposit(undefined), target);

    expect(target.errors.get("vault-1")?.message).toBe(
      "Deposit vault-1 has no peg-in txid to check",
    );
    expect(target.pendingDepositorSignatures.has("vault-1")).toBe(false);
  });
});
