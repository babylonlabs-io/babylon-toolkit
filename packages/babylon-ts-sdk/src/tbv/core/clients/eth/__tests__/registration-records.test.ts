import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";

import { calculateBtcTxHash } from "../pegin-transaction";
import { RegistrationLogsUnavailableError } from "../registration-logs-error";
import {
  assertRegisteredPayoutScriptBounds,
  findRegistrationRecord,
  registrationPrePeginTxHash,
} from "../registration-records";
import type { PeginRegistrationRecord } from "../types";

const VAULT = `0x${"0a".repeat(32)}` as Hex;
/** A minimal parseable transaction (1 input, 1 output, no witness). */
const UNSIGNED_PREPEGIN =
  `0x0200000001${"00".repeat(32)}0000000000ffffffff01e803000000000000015100000000` as Hex;

function record(
  over: Partial<PeginRegistrationRecord> = {},
): PeginRegistrationRecord {
  return {
    vaultId: VAULT,
    depositor: "0x0000000000000000000000000000000000000001" as Address,
    vaultProvider: "0x0000000000000000000000000000000000000002" as Address,
    amount: 1n,
    vaultCoreVersion: 3,
    universalChallengersVersion: 1,
    appVaultKeepersVersion: 1,
    proverCircuitVersion: 1,
    offchainParamsVersion: 1,
    peginTxHash: `0x${"ee".repeat(32)}` as Hex,
    depositorPayoutScriptPubKey: `0x5120${"11".repeat(32)}` as Hex,
    unsignedPrePeginTx: UNSIGNED_PREPEGIN,
    maxAcceptableCommissionBps: 100,
    blockNumber: 1n,
    ...over,
  };
}

describe("findRegistrationRecord", () => {
  it("returns the vault's record, matching the id case-insensitively", () => {
    expect(
      findRegistrationRecord(
        [record()],
        VAULT.toUpperCase().replace("0X", "0x") as Hex,
        1n,
      ),
    ).toEqual(record());
  });

  // The registry emits a PegInSubmittedV2 on every submission, so a missing
  // one is as readily a node's partial answer as a vault registered elsewhere.
  it("throws the typed transient error when the block's records do not include the vault", () => {
    expect(() =>
      findRegistrationRecord([record()], `0x${"0b".repeat(32)}` as Hex, 1n),
    ).toThrow(RegistrationLogsUnavailableError);
  });

  it("names both the partial answer and the unregistered vault as causes", () => {
    expect(() =>
      findRegistrationRecord([record()], `0x${"0b".repeat(32)}` as Hex, 1n),
    ).toThrow(
      /either the node served a partial answer for block 1 \(retry, preferably another node\) or the vault was not registered in this block/,
    );
  });
});

describe("registrationPrePeginTxHash", () => {
  it("is the txid of the log's unsigned Pre-PegIn", () => {
    expect(registrationPrePeginTxHash(record())).toBe(
      calculateBtcTxHash(UNSIGNED_PREPEGIN),
    );
  });

  it("throws on a log whose transaction does not parse, rather than returning a hash of garbage", () => {
    expect(() =>
      registrationPrePeginTxHash(record({ unsignedPrePeginTx: "0x00" as Hex })),
    ).toThrow();
  });
});

describe("assertRegisteredPayoutScriptBounds", () => {
  it("accepts a P2TR script", () => {
    expect(() => assertRegisteredPayoutScriptBounds(record())).not.toThrow();
  });

  it("rejects an empty script", () => {
    expect(() =>
      assertRegisteredPayoutScriptBounds(
        record({ depositorPayoutScriptPubKey: "0x" as Hex }),
      ),
    ).toThrow(/0-byte depositorPayoutBtcAddress/);
  });

  it("rejects a script past the protocol's payout-script bound (MAX_PAYOUT_SCRIPT_LEN, 128)", () => {
    expect(() =>
      assertRegisteredPayoutScriptBounds(
        record({
          depositorPayoutScriptPubKey: `0x${"11".repeat(129)}` as Hex,
        }),
      ),
    ).toThrow(/129-byte depositorPayoutBtcAddress; expected 1\.\.128 bytes/);
  });
});
