/**
 * Tests for the non-throwing DMK binding. The SIGN_PSBT loop reads 0xE000
 * (client command follows) as data, and 0x6A80 as data too so the loop's
 * single gated post-abandonment resend can see it (otherwise terminal) — a
 * sender that throws on either would kill the interrupt/continue protocol,
 * so pass-through on every status word is pinned here.
 */

import { describe, expect, it, vi } from "vitest";

import { createDmkApduSender, createDmkRawApduSender } from "../dmkApduSender";
import type { DmkSessionHandle } from "../dmkSession";

function handleWith(response: { statusCode: Uint8Array; data: Uint8Array }) {
  const sendApdu = vi.fn().mockResolvedValue(response);
  return {
    handle: { dmk: { sendApdu }, sessionId: "s1" } as unknown as DmkSessionHandle,
    sendApdu,
  };
}

const apdu = { cla: 0xe1, ins: 0x04, p1: 0x00, p2: 0x01, data: new Uint8Array([0xaa, 0xbb]) };

describe("createDmkRawApduSender", () => {
  it("serialises CLA/INS/P1/P2/Lc and the payload in order", async () => {
    const { handle, sendApdu } = handleWith({ statusCode: new Uint8Array([0x90, 0x00]), data: new Uint8Array() });

    await createDmkRawApduSender(handle)(apdu);

    expect(sendApdu).toHaveBeenCalledWith({
      sessionId: "s1",
      apdu: new Uint8Array([0xe1, 0x04, 0x00, 0x01, 0x02, 0xaa, 0xbb]),
    });
  });

  it("returns sw 0x9000 with the response data", async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const { handle } = handleWith({ statusCode: new Uint8Array([0x90, 0x00]), data: payload });

    await expect(createDmkRawApduSender(handle)(apdu)).resolves.toEqual({ sw: 0x9000, data: payload });
  });

  it("returns 0xE000 with the client-command request intact instead of throwing", async () => {
    // 0xE000 = SW_INTERRUPTED_EXECUTION: the data IS the device's request
    // (byte 0 = client-command code) — an exception here would end the loop.
    const commandRequest = new Uint8Array([0x40, 0x00, ...new Uint8Array(32).fill(7)]);
    const { handle } = handleWith({ statusCode: new Uint8Array([0xe0, 0x00]), data: commandRequest });

    await expect(createDmkRawApduSender(handle)(apdu)).resolves.toEqual({ sw: 0xe000, data: commandRequest });
  });

  it.each([
    ["0x6a80", [0x6a, 0x80]],
    ["0x6985", [0x69, 0x85]],
    ["0xb007", [0xb0, 0x07]],
  ])("returns error status %s as data, never as an exception", async (_label, bytes) => {
    const { handle } = handleWith({ statusCode: new Uint8Array(bytes), data: new Uint8Array() });

    await expect(createDmkRawApduSender(handle)(apdu)).resolves.toEqual({
      sw: ((bytes[0] as number) << 8) | (bytes[1] as number),
      data: new Uint8Array(),
    });
  });

  it("still rejects a malformed status word — there is no sw to return", async () => {
    // [0x90] would otherwise read as 0x9000: a malformed response taken as
    // success on the raw seam too.
    const { handle } = handleWith({ statusCode: new Uint8Array([0x90]), data: new Uint8Array() });

    await expect(createDmkRawApduSender(handle)(apdu)).rejects.toThrow(/status word/);
  });

  it("still refuses a payload that cannot fit in the single-byte Lc", async () => {
    const { handle } = handleWith({ statusCode: new Uint8Array([0x90, 0x00]), data: new Uint8Array() });

    await expect(createDmkRawApduSender(handle)({ ...apdu, data: new Uint8Array(256) })).rejects.toThrow(
      /Lc is a single byte/,
    );
  });

  it("accepts a 255-byte payload — the Lc boundary deriveContextHash's full continuation chunks hit", async () => {
    const { handle, sendApdu } = handleWith({ statusCode: new Uint8Array([0x90, 0x00]), data: new Uint8Array() });

    await createDmkRawApduSender(handle)({ ...apdu, data: new Uint8Array(255).fill(0xab) });

    const wire = sendApdu.mock.calls[0][0].apdu;
    expect(wire.length).toBe(260);
    expect(wire[4]).toBe(0xff);
  });

  it("rejects a header field that is not a single byte — Uint8Array would truncate it mod-256", async () => {
    const { handle } = handleWith({ statusCode: new Uint8Array([0x90, 0x00]), data: new Uint8Array() });

    await expect(createDmkRawApduSender(handle)({ ...apdu, ins: 0x104 })).rejects.toThrow(/not a single byte/);
  });

  it("trace logs header and status word only — never payload bytes", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    (globalThis as { __LEDGER_VAULT_APDU_TRACE__?: boolean }).__LEDGER_VAULT_APDU_TRACE__ = true;
    try {
      const { handle } = handleWith({ statusCode: new Uint8Array([0x90, 0x00]), data: new Uint8Array([1, 2, 3]) });

      await createDmkRawApduSender(handle)({
        cla: 0xe1,
        ins: 0x04,
        p1: 0x00,
        p2: 0x01,
        data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      });

      expect(debugSpy).toHaveBeenCalledExactlyOnceWith("[ledger-vault] APDU e1 04 00 01 Lc=4 -> sw=0x9000 len=3");
    } finally {
      delete (globalThis as { __LEDGER_VAULT_APDU_TRACE__?: boolean }).__LEDGER_VAULT_APDU_TRACE__;
      debugSpy.mockRestore();
    }
  });

  it("trace logs the transport-error line without payload bytes and rethrows", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    (globalThis as { __LEDGER_VAULT_APDU_TRACE__?: boolean }).__LEDGER_VAULT_APDU_TRACE__ = true;
    try {
      const transportError = new Error("device unplugged");
      const sendApdu = vi.fn().mockRejectedValue(transportError);
      const handle = { dmk: { sendApdu }, sessionId: "s1" } as unknown as DmkSessionHandle;

      await expect(
        createDmkRawApduSender(handle)({
          cla: 0xe1,
          ins: 0x04,
          p1: 0x00,
          p2: 0x01,
          data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
        }),
      ).rejects.toThrow("device unplugged");

      expect(debugSpy).toHaveBeenCalledExactlyOnceWith(
        "[ledger-vault] APDU e1 04 00 01 Lc=4 -> transport error",
        transportError,
      );
    } finally {
      delete (globalThis as { __LEDGER_VAULT_APDU_TRACE__?: boolean }).__LEDGER_VAULT_APDU_TRACE__;
      debugSpy.mockRestore();
    }
  });

  it("trace logs the identical single line when riding the throwing sender", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    (globalThis as { __LEDGER_VAULT_APDU_TRACE__?: boolean }).__LEDGER_VAULT_APDU_TRACE__ = true;
    try {
      const { handle } = handleWith({ statusCode: new Uint8Array([0x90, 0x00]), data: new Uint8Array([1, 2, 3]) });

      await createDmkApduSender(handle)({
        cla: 0xe1,
        ins: 0x04,
        p1: 0x00,
        p2: 0x01,
        data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      });

      expect(debugSpy).toHaveBeenCalledExactlyOnceWith("[ledger-vault] APDU e1 04 00 01 Lc=4 -> sw=0x9000 len=3");
    } finally {
      delete (globalThis as { __LEDGER_VAULT_APDU_TRACE__?: boolean }).__LEDGER_VAULT_APDU_TRACE__;
      debugSpy.mockRestore();
    }
  });
});
