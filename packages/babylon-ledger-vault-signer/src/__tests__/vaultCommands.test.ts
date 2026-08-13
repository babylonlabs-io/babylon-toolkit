/**
 * Tests for the two custom vault instructions. A fake sender records every
 * APDU, so what is asserted is the exact byte sequence the device would see —
 * ordering included, since the firmware enforces phase order and answers an
 * out-of-order ceremony with an opaque status word.
 */

import { describe, expect, it, vi } from "vitest";

import { approveVaultIntent, deriveContextHash, type ApduSender } from "../vaultCommands";

const HARDENED = 0x80000000;
const fill = (byte: number, len = 32) => new Uint8Array(len).fill(byte);

function recorder(responses: Uint8Array[] = []) {
  const sent: { p1: number; p2: number; ins: number; data: Uint8Array }[] = [];
  let call = 0;
  const send: ApduSender = vi.fn(async (apdu) => {
    sent.push({ p1: apdu.p1, p2: apdu.p2, ins: apdu.ins, data: apdu.data });
    return responses[call++] ?? new Uint8Array();
  });
  return { send, sent };
}

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

const INTENT = {
  scalars: SCALARS,
  groups: [GROUP],
  keeperPubkeys: [fill(0xaa)],
  challengerPubkeys: [fill(0xbb)],
};

describe("deriveContextHash", () => {
  it("sends one APDU and returns the root when the context fits", async () => {
    const root = fill(0x42);
    const { send, sent } = recorder([root]);

    const out = await deriveContextHash(send, {
      appName: "babylon-vault",
      derivationPath: [86 + HARDENED, 1 + HARDENED, 0 + HARDENED],
      context: new Uint8Array([1, 2, 3]),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].ins).toBe(0x81);
    expect(sent[0].p1).toBe(0x00);
    expect(out).toEqual(root);
  });

  it("always derives with the screen shown, never silently", async () => {
    // P2=0x01 leaves root_user_approved false, and such a root can never load
    // an intent — the failure would only surface at the key phase.
    const { send, sent } = recorder([fill(0x42)]);
    await deriveContextHash(send, {
      appName: "babylon-vault",
      derivationPath: [86 + HARDENED],
      context: new Uint8Array([1]),
    });

    expect(sent[0].p2).toBe(0x00);
  });

  it("streams a long context as continuation chunks with no header", async () => {
    const context = new Uint8Array(600).fill(7);
    const { send, sent } = recorder([new Uint8Array(), new Uint8Array(), fill(0x42)]);

    await deriveContextHash(send, {
      appName: "bv",
      derivationPath: [86 + HARDENED],
      context,
    });

    expect(sent.map((s) => s.p1)).toEqual([0x00, 0x01, 0x01]);
    for (const apdu of sent) expect(apdu.data.length).toBeLessThanOrEqual(255);

    // Every context byte reaches the device exactly once. The first APDU also
    // carries the header: name_len + name + path_len + 4*levels + total_len.
    const headerLen = 1 + "bv".length + 1 + 4 * 1 + 2;
    const delivered = sent.reduce((n, s, i) => n + (i === 0 ? s.data.length - headerLen : s.data.length), 0);
    expect(delivered).toBe(context.length);
  });

  it("rejects an app name the device's charset would refuse", async () => {
    const { send } = recorder([fill(0x42)]);
    await expect(
      deriveContextHash(send, {
        appName: "Babylon_Vault",
        derivationPath: [86 + HARDENED],
        context: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/appName must match/);
  });

  it("rejects a context beyond the device's 1024-byte ceiling", async () => {
    const { send } = recorder();
    await expect(
      deriveContextHash(send, {
        appName: "bv",
        derivationPath: [86 + HARDENED],
        context: new Uint8Array(1025),
      }),
    ).rejects.toThrow(/context must be 1\.\.1024 bytes/);
  });

  it("rejects a response that is not a 32-byte root", async () => {
    const { send } = recorder([new Uint8Array(16)]);
    await expect(
      deriveContextHash(send, {
        appName: "bv",
        derivationPath: [86 + HARDENED],
        context: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/Expected a 32-byte context root/);
  });
});

describe("approveVaultIntent", () => {
  it("refuses an empty keeper roster — the device approves only after the last key batch", async () => {
    const { send, sent } = recorder();

    await expect(
      approveVaultIntent(send, {
        ...INTENT,
        scalars: { ...SCALARS, keeperCount: 0 },
        keeperPubkeys: [],
      }),
    ).rejects.toThrow(/must be non-empty/);
    expect(sent).toHaveLength(0);
  });

  it("refuses an empty challenger roster for the same reason", async () => {
    const { send, sent } = recorder();

    await expect(
      approveVaultIntent(send, {
        ...INTENT,
        scalars: { ...SCALARS, challengerCount: 0 },
        challengerPubkeys: [],
      }),
    ).rejects.toThrow(/must be non-empty/);
    expect(sent).toHaveLength(0);
  });

  it("drives the phases in the order the device enforces", async () => {
    const { send, sent } = recorder();
    await approveVaultIntent(send, INTENT);

    expect(sent.map((s) => s.p1)).toEqual([0x00, 0x01, 0x02]);
    expect(sent.every((s) => s.ins === 0x80 && s.p2 === 0x00)).toBe(true);
  });

  it("sends one APDU per vault group", async () => {
    const { send, sent } = recorder();
    await approveVaultIntent(send, {
      ...INTENT,
      scalars: { ...SCALARS, vaultCount: 2 },
      groups: [GROUP, { ...GROUP, htlcVout: 1 }],
    });

    expect(sent.filter((s) => s.p1 === 0x01)).toHaveLength(2);
  });

  it("splits a large roster across key-batch APDUs within the 255-byte field", async () => {
    const keepers = Array.from({ length: 10 }, (_, i) => fill(i + 1));
    const { send, sent } = recorder();

    await approveVaultIntent(send, {
      scalars: { ...SCALARS, keeperCount: 10, challengerCount: 1 },
      groups: [GROUP],
      keeperPubkeys: keepers,
      challengerPubkeys: [fill(0xcc)],
    });

    const batches = sent.filter((s) => s.p1 === 0x02);
    expect(batches).toHaveLength(2);
    for (const b of batches) expect(b.data.length).toBeLessThanOrEqual(255);
  });

  it.each([
    ["vaultCount", { vaultCount: 2 }, /vaultCount 2 does not match 1 group/],
    ["keeperCount", { keeperCount: 3 }, /keeperCount 3 does not match 1 key/],
    ["challengerCount", { challengerCount: 3 }, /challengerCount 3 does not match 1 key/],
  ])("refuses to start when the declared %s disagrees with the data", async (_f, over, msg) => {
    const { send, sent } = recorder();

    await expect(approveVaultIntent(send, { ...INTENT, scalars: { ...SCALARS, ...over } })).rejects.toThrow(msg);
    // Nothing reached the device: a mid-ceremony failure would nullify the intent.
    expect(sent).toHaveLength(0);
  });
});
