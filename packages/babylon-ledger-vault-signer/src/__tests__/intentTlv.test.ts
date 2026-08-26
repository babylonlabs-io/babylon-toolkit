/**
 * Wire-format tests for the intent TLV encoder.
 *
 * The golden vectors are not hand-written: they were produced by running
 * Ledger's own reference host encoder,
 * `app-babylon-vault/tests/vault_client.py` @ `d74bf278`
 * (`build_intent_tlv`, `build_group_tlv`, `_ktlv`), against the inputs below.
 * A byte difference here means we would be talking to the device in a dialect
 * its parser does not accept.
 */

import { describe, expect, it } from "vitest";

import { KEYS_PER_BATCH, encodeIntentGroup, encodeIntentScalars, encodeKeyBatches } from "../intentTlv";

const HARDENED = 0x80000000;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const fill = (byte: number) => new Uint8Array(32).fill(byte);

const SCALARS = {
  coinType: 1,
  baseFeeRate: 2n,
  peginCsvTimelock: 684,
  payoutTimelock: 684,
  prepeginTxidInternal: fill(0x11),
  htlcRefundTimelock: 2016,
  depositorPath: [86 + HARDENED, 1 + HARDENED, 0 + HARDENED, 0, 0],
  keeperCount: 1,
  challengerCount: 1,
  vaultCount: 1,
  prepeginMaxFee: 1500n,
};

const GROUP = {
  htlcVout: 0,
  vaultProviderPubkey: fill(0xff),
  vaultAmount: 1_000_000n,
  commissionFee: 10_000n,
  depositorClaimValue: 20_000n,
  peginMaxFee: 800n,
};

describe("encodeIntentScalars", () => {
  it("matches Ledger's reference encoder byte for byte", () => {
    expect(hex(encodeIntentScalars(SCALARS))).toBe(
      "0001010100020101002104000000010100080000000000000002" +
        "010104000002ac010204000002ac" +
        "00272011111111111111111111111111111111111111111111111111111111111111" +
        "11" +
        "010304000007e0" +
        "00691480000056800000018000000000000000000000000" +
        "10401010105010101060101010f0800000000000005dc",
    );
  });

  it("rejects a depositor path that is not exactly 5 levels", () => {
    // The device requires 5 (VAULT_DEPOSITOR_PATH_LEN); a 3-level account path
    // is the natural mistake and would be rejected mid-ceremony.
    expect(() =>
      encodeIntentScalars({
        ...SCALARS,
        depositorPath: [86 + HARDENED, 1 + HARDENED, 0 + HARDENED],
      }),
    ).toThrow(/exactly 5 levels/);
  });

  it("rejects a txid that is not 32 bytes", () => {
    expect(() => encodeIntentScalars({ ...SCALARS, prepeginTxidInternal: new Uint8Array(31) })).toThrow(
      /prepeginTxid must be 32 bytes/,
    );
  });

  it("rejects a value too wide for its field", () => {
    expect(() => encodeIntentScalars({ ...SCALARS, keeperCount: 256 })).toThrow(/does not fit in 1 bytes/);
    expect(() => encodeIntentScalars({ ...SCALARS, baseFeeRate: 1n << 64n })).toThrow(/does not fit in 8 bytes/);
  });

  it("encodes hardened path levels without sign-extending", () => {
    // 86' is 0x80000056 — a signed-int slip would emit ffffffff… here.
    expect(hex(encodeIntentScalars(SCALARS))).toContain("80000056");
  });
});

describe("encodeIntentGroup", () => {
  it("matches Ledger's reference encoder byte for byte", () => {
    expect(hex(encodeIntentGroup(GROUP))).toBe(
      "01090100" +
        "010a20ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
        "010b0800000000000f4240" +
        "010c080000000000002710" +
        "010d080000000000004e20" +
        "010e080000000000000320",
    );
  });

  it("rejects a vault provider key that is not x-only", () => {
    expect(() => encodeIntentGroup({ ...GROUP, vaultProviderPubkey: new Uint8Array(33) })).toThrow(
      /vaultProviderPubkey must be 32 bytes/,
    );
  });
});

describe("encodeKeyBatches", () => {
  it("emits the reference 35-byte record shape", () => {
    const [batch] = encodeKeyBatches([fill(0xaa)], []);
    expect(hex(batch)).toBe(`010720${"aa".repeat(32)}`);
  });

  it("puts every keeper before every challenger", () => {
    const [batch] = encodeKeyBatches([fill(0x02)], [fill(0x01)]);
    // Keeper tag 0x0107 first even though its key sorts after the challenger's.
    expect(hex(batch)).toBe(`010720${"02".repeat(32)}010820${"01".repeat(32)}`);
  });

  it("sorts each role ascending, since the device checks order positionally", () => {
    const [batch] = encodeKeyBatches([fill(0x03), fill(0x01), fill(0x02)], []);
    expect(hex(batch)).toBe(`010720${"01".repeat(32)}010720${"02".repeat(32)}010720${"03".repeat(32)}`);
  });

  it("splits at the record boundary so no batch exceeds the APDU field", () => {
    const keepers = Array.from({ length: KEYS_PER_BATCH + 1 }, (_, i) => fill(i + 1));
    const batches = encodeKeyBatches(keepers, []);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(KEYS_PER_BATCH * 35);
    expect(batches[1]).toHaveLength(35);
    for (const b of batches) expect(b.length).toBeLessThanOrEqual(255);
  });

  it("packs 7 records per batch, matching the reference client", () => {
    expect(KEYS_PER_BATCH).toBe(7);
  });

  it("returns no batches for an empty roster", () => {
    expect(encodeKeyBatches([], [])).toEqual([]);
  });
});
