import type { GetPeginStatusResponse } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  DaemonStatus,
  VP_TERMINAL_FAILURE_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type {
  DepositToPoll,
  ProviderVerificationProgress,
} from "@/types/peginPolling";
import {
  TerminalPeginPollingError,
  UNRECOGNIZED_DAEMON_STATUS,
} from "@/utils/peginPolling";

import {
  applyPerDepositError,
  applyPerDepositResult,
  applyPerDepositStatus,
  usePeginPollingQuery,
} from "../usePeginPollingQuery";

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: vi.fn(() => ({ isLoading: false, refetch: vi.fn() })),
}));

describe("usePeginPollingQuery", () => {
  it("keeps polling signed split lanes until all pending deposits have terminal errors", () => {
    const activity: VaultActivity = {
      id: "0xvault-1",
      collateral: { amount: "1", symbol: "BTC" },
      providers: [{ id: "0xprovider" }],
      peginTxHash: "0xtxid",
      applicationEntryPoint: "0xapp",
      contractStatus: ContractStatus.PENDING,
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      unsignedPrePeginTx: "0x00",
      depositorWotsPkHash: "0x00",
    };
    renderHook(
      ({ activities }) =>
        usePeginPollingQuery({
          activities,
          pendingPegins: [],
          btcWalletAbsent: true,
        }),
      {
        initialProps: {
          activities: [activity, { ...activity, id: "0xvault-2" as const }],
        },
      },
    );
    const interval = vi.mocked(useQuery).mock.calls.at(-1)?.[0]
      .refetchInterval as (query: {
      state: {
        data: {
          pendingDepositorSignatures: Set<string>;
          errors: Map<string, Error>;
        };
      };
    }) => number | false;
    const data = {
      pendingDepositorSignatures: new Set(["0xvault-1", "0xvault-2"]),
      errors: new Map<string, Error>(),
    };
    expect(interval({ state: { data } })).toBe(30_000);
    data.pendingDepositorSignatures.delete("0xvault-1");
    expect(interval({ state: { data } })).toBe(30_000);
    data.errors.set(
      "0xvault-1",
      new TerminalPeginPollingError(DaemonStatus.EXPIRED, "Expired"),
    );
    expect(interval({ state: { data } })).toBe(30_000);
    data.errors.set(
      "0xvault-2",
      new TerminalPeginPollingError(DaemonStatus.EXPIRED, "Expired"),
    );
    expect(interval({ state: { data } })).toBe(false);
  });
});

describe("applyPerDepositStatus", () => {
  it.each([
    undefined,
    null,
    false,
    "invalid",
    [],
    {},
    { total_challengers: 3 },
    { completed_challengers: 1 },
    { completed_challengers: "1", total_challengers: 3 },
    { completed_challengers: 1, total_challengers: "3" },
    { completed_challengers: true, total_challengers: 3 },
    { completed_challengers: 1, total_challengers: true },
    {
      completed_challengers: { toString: null, valueOf: null },
      total_challengers: 3,
    },
    {
      completed_challengers: 1,
      total_challengers: { toString: null, valueOf: null },
    },
    { completed_challengers: -1, total_challengers: 3 },
    { completed_challengers: 0, total_challengers: -1 },
    { completed_challengers: 0.5, total_challengers: 3 },
    { completed_challengers: 1, total_challengers: 3.5 },
    { completed_challengers: NaN, total_challengers: 3 },
    { completed_challengers: 1, total_challengers: NaN },
    { completed_challengers: Infinity, total_challengers: 3 },
    { completed_challengers: 1, total_challengers: Infinity },
    {
      completed_challengers: Number.MAX_SAFE_INTEGER + 1,
      total_challengers: Number.MAX_SAFE_INTEGER + 1,
    },
    {
      completed_challengers: 1,
      total_challengers: Number.MAX_SAFE_INTEGER + 1,
    },
    { completed_challengers: 4, total_challengers: 3 },
  ])(
    "discards invalid ACK display data without changing readiness: %j",
    (ackCollection) => {
      const sets = {
        errors: new Map<string, Error>(),
        needsWotsKey: new Set<string>(),
        pendingIngestion: new Set<string>(),
        pendingDepositorSignatures: new Set<string>(),
        verificationProgress: new Map<string, ProviderVerificationProgress>(),
      };
      applyPerDepositStatus(
        {
          pegin_txid: "ab".repeat(32),
          vault_id: `0x${"cd".repeat(32)}`,
          status: DaemonStatus.PENDING_ACKS,
          progress: { ack_collection: ackCollection },
          health_info: "stuck",
        } as unknown as GetPeginStatusResponse,
        "vault-1",
        sets,
      );
      expect(sets.verificationProgress.get("vault-1")).toEqual({
        ackCollection: undefined,
        healthInfo: "stuck",
      });
      expect(sets.errors.size).toBe(0);
      expect(sets.pendingDepositorSignatures.size).toBe(0);
    },
  );

  it.each([
    [0, 3],
    [1, 3],
    [3, 3],
    [0, 0],
  ])("keeps valid ACK counts %i of %i for display", (completed, total) => {
    const sets = {
      errors: new Map<string, Error>(),
      needsWotsKey: new Set<string>(),
      pendingIngestion: new Set<string>(),
      pendingDepositorSignatures: new Set<string>(),
      verificationProgress: new Map<string, ProviderVerificationProgress>(),
    };
    const ackCollection = {
      completed_challengers: completed,
      total_challengers: total,
      completed_challenger_pubkeys: [],
      pending_challenger_pubkeys: [],
    };
    applyPerDepositStatus(
      {
        pegin_txid: "ab".repeat(32),
        vault_id: `0x${"cd".repeat(32)}`,
        status: DaemonStatus.PENDING_ACKS,
        progress: { ack_collection: ackCollection },
        health_info: "normal",
      },
      "vault-1",
      sets,
    );
    expect(sets.verificationProgress.get("vault-1")).toEqual({
      ackCollection,
      healthInfo: "normal",
    });
    expect(sets.pendingDepositorSignatures.size).toBe(0);
  });

  it("keeps ACK progress per deposit without advancing a full or stuck collection", () => {
    const verificationProgress = new Map<
      string,
      ProviderVerificationProgress
    >();
    const sets = {
      errors: new Map<string, Error>(),
      needsWotsKey: new Set<string>(),
      pendingIngestion: new Set<string>(),
      pendingDepositorSignatures: new Set<string>(),
      verificationProgress,
    };
    const response = {
      pegin_txid: "ab".repeat(32),
      vault_id: `0x${"cd".repeat(32)}`,
      status: DaemonStatus.PENDING_ACKS,
      progress: {
        ack_collection: {
          completed_challengers: 2,
          total_challengers: 2,
          completed_challenger_pubkeys: ["challenger-1", "challenger-2"],
          pending_challenger_pubkeys: [],
        },
      },
      health_info: "stuck",
    };
    applyPerDepositStatus(response, "vault-1", sets);
    applyPerDepositStatus(
      { ...response, progress: {}, health_info: "normal" },
      "vault-2",
      sets,
    );
    expect(verificationProgress.get("vault-1")).toEqual({
      ackCollection: response.progress.ack_collection,
      healthInfo: "stuck",
    });
    expect(verificationProgress.get("vault-2")).toEqual({
      ackCollection: undefined,
      healthInfo: "normal",
    });
    expect(sets.pendingDepositorSignatures.size).toBe(0);
    expect(sets.errors.size).toBe(0);
    applyPerDepositStatus(
      { ...response, progress: {}, health_info: "normal" },
      "vault-1",
      sets,
    );
    expect(verificationProgress.get("vault-1")?.ackCollection).toBeUndefined();
    applyPerDepositStatus(
      { ...response, status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES },
      "vault-1",
      sets,
    );
    expect(verificationProgress.has("vault-1")).toBe(false);
    expect(sets.pendingDepositorSignatures.has("vault-1")).toBe(true);
  });

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
        verificationProgress: new Map(),
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
          verificationProgress: new Map<string, ProviderVerificationProgress>(),
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
        verificationProgress: new Map<string, ProviderVerificationProgress>(),
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
      verificationProgress: new Map<string, ProviderVerificationProgress>(),
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
