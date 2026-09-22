import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";

import type {
  PeginRegistrationRecord,
  VaultData,
} from "../../clients/eth/types";
import {
  assertClaimBatchHomogeneous,
  orderClaimBatchByHtlcVout,
  selectSiblingRegistrations,
  type ClaimBatchMember,
} from "../claimSiblings";

const DEPOSITOR = "0x0000000000000000000000000000000000000001" as Address;
const OTHER_DEPOSITOR = "0x0000000000000000000000000000000000000009" as Address;
/** Minimal parseable unsigned Pre-PegIns: the batch's (locktime 1) and another depositor's (locktime 2). */
const PREPEGIN_TX =
  `0x0200000001${"00".repeat(32)}0000000000ffffffff01e803000000000000015101000000` as Hex;
const OTHER_PREPEGIN_TX =
  `0x0200000001${"00".repeat(32)}0000000000ffffffff01e803000000000000015102000000` as Hex;
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function record(
  vaultId: Hex,
  over: Partial<PeginRegistrationRecord> = {},
): PeginRegistrationRecord {
  return {
    vaultId,
    depositor: DEPOSITOR,
    vaultProvider: "0x0000000000000000000000000000000000000002",
    amount: 1n,
    vaultCoreVersion: 3,
    universalChallengersVersion: 1,
    appVaultKeepersVersion: 1,
    proverCircuitVersion: 1,
    offchainParamsVersion: 1,
    peginTxHash: `0x${"ee".repeat(32)}` as Hex,
    depositorPayoutScriptPubKey: "0x51" as Hex,
    unsignedPrePeginTx: PREPEGIN_TX,
    maxAcceptableCommissionBps: 100,
    blockNumber: 1n,
    ...over,
  };
}

function member(
  htlcVout: number,
  over: Partial<VaultData["protocol"]> & {
    maxAcceptableCommissionBps?: number;
    vaultProvider?: Address;
    applicationEntryPoint?: Address;
  } = {},
): ClaimBatchMember {
  const {
    maxAcceptableCommissionBps = 300,
    vaultProvider = "0x0000000000000000000000000000000000000002" as Address,
    applicationEntryPoint = "0x0000000000000000000000000000000000000003" as Address,
    ...protocol
  } = over;
  return {
    maxAcceptableCommissionBps,
    vault: {
      basic: {
        vaultProvider,
        applicationEntryPoint,
        amount: 1_000n,
      } as VaultData["basic"],
      protocol: {
        vaultCoreVersion: 3,
        offchainParamsVersion: 2,
        appVaultKeepersVersion: 4,
        universalChallengersVersion: 5,
        hashlock: `0x${"a".repeat(64)}` as Hex,
        htlcVout,
        ...protocol,
      } as VaultData["protocol"],
    },
  };
}

describe("selectSiblingRegistrations", () => {
  it("keeps the other registrations of the same depositor and the same Pre-PegIn, and nothing else", () => {
    const target = record(id(1));

    const siblings = selectSiblingRegistrations(
      [
        target,
        record(id(2)),
        record(id(3), { depositor: OTHER_DEPOSITOR }),
        record(id(4), { unsignedPrePeginTx: OTHER_PREPEGIN_TX }),
      ],
      target,
    );

    expect(siblings.map((s) => s.vaultId)).toEqual([id(2)]);
  });
});

describe("assertClaimBatchHomogeneous", () => {
  it("accepts siblings that agree on every stamped field", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [member(1)]),
    ).not.toThrow();
  });

  it("refuses a sibling with a different commission ceiling", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, { maxAcceptableCommissionBps: 301 }),
      ]),
    ).toThrow(/disagree on maxAcceptableCommissionBps \(301 vs 300\)/);
  });

  it("refuses a sibling with a different vault core version", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, { vaultCoreVersion: 4 }),
      ]),
    ).toThrow(/disagree on vaultCoreVersion \(4 vs 3\)/);
  });

  it("refuses a sibling with a different offchain params version", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, { offchainParamsVersion: 3 }),
      ]),
    ).toThrow(/disagree on offchainParamsVersion \(3 vs 2\)/);
  });

  it("refuses a sibling with a different app vault keepers version", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, { appVaultKeepersVersion: 5 }),
      ]),
    ).toThrow(/disagree on appVaultKeepersVersion \(5 vs 4\)/);
  });

  it("refuses a sibling with a different universal challengers version", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, { universalChallengersVersion: 6 }),
      ]),
    ).toThrow(/disagree on universalChallengersVersion \(6 vs 5\)/);
  });

  it("refuses a sibling with a different application entry point", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, {
          applicationEntryPoint:
            "0x0000000000000000000000000000000000000008" as Address,
        }),
      ]),
    ).toThrow(/disagree on applicationEntryPoint/);
  });

  it("refuses a sibling with a different vault provider, case-insensitively on the address", () => {
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, {
          vaultProvider: "0x0000000000000000000000000000000000000002"
            .toUpperCase()
            .replace("0X", "0x") as Address,
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      assertClaimBatchHomogeneous(member(0), [
        member(1, {
          vaultProvider:
            "0x0000000000000000000000000000000000000007" as Address,
        }),
      ]),
    ).toThrow(/disagree on vaultProvider/);
  });
});

describe("orderClaimBatchByHtlcVout", () => {
  it("orders by htlcVout and projects hashlock and amount", () => {
    const out = orderClaimBatchByHtlcVout([
      member(1, { hashlock: `0x${"b".repeat(64)}` as Hex }),
      member(0),
    ]);

    expect(out).toEqual([
      { hashlock: `0x${"a".repeat(64)}`, amount: 1_000n },
      { hashlock: `0x${"b".repeat(64)}`, amount: 1_000n },
    ]);
  });

  it("refuses a non-contiguous vector, since htlcVout is positional downstream", () => {
    expect(() => orderClaimBatchByHtlcVout([member(0), member(2)])).toThrow(
      /non-contiguous HTLC vector \(0, 2\)/,
    );
  });
});
