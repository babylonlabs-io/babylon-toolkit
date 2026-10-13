/**
 * Tests for the three custom vault instructions. A fake sender records every
 * APDU, so what is asserted is the exact byte sequence the device would see —
 * ordering included, since the firmware enforces phase order and answers an
 * out-of-order ceremony with an opaque status word.
 */

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  approveVaultIntent,
  deriveContextHash,
  getVaultState,
  intentFingerprint,
  type ApduSender,
} from "../vaultCommands";

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
    // P2=0x01 skips the screen and returns no root; the host needs the root.
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

describe("intentFingerprint", () => {
  it("is the last 4 bytes of SHA-256 over every CData approveVaultIntent sends, in order", async () => {
    const keepers = Array.from({ length: 10 }, (_, i) => fill(i + 1));
    const intent = {
      scalars: { ...SCALARS, keeperCount: 10, challengerCount: 1, vaultCount: 2 },
      groups: [GROUP, { ...GROUP, htlcVout: 1 }],
      keeperPubkeys: keepers,
      challengerPubkeys: [fill(0xcc)],
    };
    const { send, sent } = recorder();

    await approveVaultIntent(send, intent);

    const digest = createHash("sha256")
      .update(Buffer.concat(sent.map((apdu) => Buffer.from(apdu.data))))
      .digest();
    expect(Buffer.from(intentFingerprint(intent)).toString("hex")).toBe(digest.subarray(28).toString("hex"));
  });
});

describe("getVaultState", () => {
  it("sends INS 0x82 with P1 = P2 = 0 and no data", async () => {
    const { send, sent } = recorder([new Uint8Array([0x00, 0x00])]);

    await getVaultState(send);

    expect(sent).toEqual([{ ins: 0x82, p1: 0x00, p2: 0x00, data: new Uint8Array(0) }]);
  });

  it("reads 00 00 as an idle session", async () => {
    const { send } = recorder([new Uint8Array([0x00, 0x00])]);

    await expect(getVaultState(send)).resolves.toEqual({ phase: "idle" });
  });

  it("reads 00 04 <context_fp> as a derived root with no intent", async () => {
    const { send } = recorder([new Uint8Array([0x00, 0x04, 0xd1, 0xf8, 0xec, 0xda])]);

    await expect(getVaultState(send)).resolves.toEqual({
      phase: "hash-derived",
      contextFingerprint: new Uint8Array([0xd1, 0xf8, 0xec, 0xda]),
    });
  });

  it("reads 04 <intent_fp> 04 <context_fp> as an approved intent", async () => {
    const { send } = recorder([new Uint8Array([0x04, 0x44, 0xa9, 0x9b, 0x57, 0x04, 0xd1, 0xf8, 0xec, 0xda])]);

    await expect(getVaultState(send)).resolves.toEqual({
      phase: "intent-loaded",
      intentFingerprint: new Uint8Array([0x44, 0xa9, 0x9b, 0x57]),
      contextFingerprint: new Uint8Array([0xd1, 0xf8, 0xec, 0xda]),
    });
  });

  it.each([
    ["an empty response", []],
    ["a fingerprint length other than 0 or 4", [0x00, 0x03, 0x01, 0x02, 0x03]],
    ["a truncated fingerprint", [0x00, 0x04, 0x01, 0x02]],
    ["trailing bytes", [0x00, 0x00, 0x00]],
    ["an intent without a context root", [0x04, 0x01, 0x02, 0x03, 0x04, 0x00]],
  ])("refuses %s", async (_label, bytes) => {
    const { send } = recorder([new Uint8Array(bytes)]);

    await expect(getVaultState(send)).rejects.toThrow(/GET_VAULT_STATE/);
  });
});
