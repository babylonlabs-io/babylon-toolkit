/**
 * Tests for pegin polling utilities
 */

import { DaemonStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "../../models/peginStateMachine";
import type { VaultActivity } from "../../types/activity";
import {
  getDepositsNeedingPolling,
  isTerminalPollingError,
  TerminalPeginPollingError,
} from "../peginPolling";

const BTC_PUBKEY = "ab".repeat(32);
const OTHER_BTC_PUBKEY = "cd".repeat(32);

const PENDING_ACTIVITY: VaultActivity = {
  id: "0xpegin" as Hex,
  collateral: { amount: "0.1", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  peginTxHash: "0xpegin" as Hex,
  applicationEntryPoint: "0xapp" as Hex,
  contractStatus: ContractStatus.PENDING,
  isInUse: false,
  displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
  depositorBtcPubkey: BTC_PUBKEY,
  unsignedPrePeginTx: "0xdeadbeef",
  depositorWotsPkHash: "0xwotsh",
};

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

describe("getDepositsNeedingPolling", () => {
  it("polls every pending deposit when there is no key and no Bitcoin wallet", () => {
    const deposits = getDepositsNeedingPolling(
      [
        PENDING_ACTIVITY,
        {
          ...PENDING_ACTIVITY,
          id: "0xother" as Hex,
          depositorBtcPubkey: OTHER_BTC_PUBKEY,
        },
      ],
      [],
      undefined,
      true,
    );

    expect(deposits.map((d) => d.activity.id)).toEqual(["0xpegin", "0xother"]);
  });

  it("polls nothing when Bitcoin is connected but its key is not loaded", () => {
    expect(
      getDepositsNeedingPolling([PENDING_ACTIVITY], [], undefined, false),
    ).toEqual([]);
  });

  it("filters by key when a key is present even if the wallet is flagged absent", () => {
    const deposits = getDepositsNeedingPolling(
      [
        PENDING_ACTIVITY,
        {
          ...PENDING_ACTIVITY,
          id: "0xother" as Hex,
          depositorBtcPubkey: OTHER_BTC_PUBKEY,
        },
      ],
      [],
      BTC_PUBKEY,
      true,
    );

    expect(deposits.map((d) => d.activity.id)).toEqual(["0xpegin"]);
  });

  it("still requires a pending deposit and complete polling data without a wallet", () => {
    for (const incomplete of [
      { ...PENDING_ACTIVITY, applicationEntryPoint: undefined },
      { ...PENDING_ACTIVITY, peginTxHash: undefined },
      { ...PENDING_ACTIVITY, providers: [] },
      { ...PENDING_ACTIVITY, contractStatus: ContractStatus.EXPIRED },
    ]) {
      expect(
        getDepositsNeedingPolling([incomplete], [], undefined, true),
      ).toEqual([]);
    }
  });
});
