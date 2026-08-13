/**
 * Tests for pegin polling utilities
 */

import { DaemonStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients/vault-provider/status";
import { describe, expect, it } from "vitest";

import { ContractStatus } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import {
  getDepositsNeedingPolling,
  isTerminalPollingError,
  TerminalPeginPollingError,
} from "../peginPolling";

const activity = {
  id: "0x01",
  collateral: { amount: "0.1", symbol: "BTC" },
  providers: [{ id: "0x1234" }],
  contractStatus: ContractStatus.PENDING,
  displayLabel: "Pending",
  peginTxHash: "0xabcd",
  applicationEntryPoint: "0x5678",
  depositorBtcPubkey: "aabb",
  unsignedPrePeginTx: "",
  depositorWotsPkHash: "",
} as VaultActivity;

describe("getDepositsNeedingPolling", () => {
  it("keeps ETH-discovered deposits pollable without a BTC public key", () => {
    expect(getDepositsNeedingPolling([activity], [], undefined)).toHaveLength(
      1,
    );
  });

  it("retains ownership filtering once a BTC public key is available", () => {
    expect(getDepositsNeedingPolling([activity], [], "0xAABB")).toHaveLength(1);
    expect(getDepositsNeedingPolling([activity], [], "ccdd")).toHaveLength(0);
  });
});

describe("isTerminalPollingError", () => {
  it("fails fast on the 'Unauthorized depositor' VP rpc error (wrong wallet paired)", () => {
    expect(isTerminalPollingError(new Error("Unauthorized depositor"))).toBe(
      true,
    );
    expect(
      isTerminalPollingError(new Error("Unauthorized depositor: bad sig")),
    ).toBe(true);
  });

  it("returns false for non-terminal plain Errors", () => {
    expect(isTerminalPollingError(new Error("Network error"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isTerminalPollingError("string error")).toBe(false);
    expect(isTerminalPollingError(null)).toBe(false);
    expect(isTerminalPollingError(undefined)).toBe(false);
  });

  it.each([
    DaemonStatus.EXPIRED_IN_CLAIM,
    DaemonStatus.INVALID_SIG_IN_CONTRACT,
    DaemonStatus.AML_REJECTED,
    DaemonStatus.EXPIRED,
    DaemonStatus.EXPIRED_CLEANED_UP,
    DaemonStatus.INGESTION_REJECTED,
  ])("returns true for TerminalPeginPollingError(%s)", (status) => {
    expect(
      isTerminalPollingError(new TerminalPeginPollingError(status, "anything")),
    ).toBe(true);
  });
});
