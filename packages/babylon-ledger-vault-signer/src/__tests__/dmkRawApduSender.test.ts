/**
 * Tests for the non-throwing DMK binding. The SIGN_PSBT loop reads 0xE000
 * (client command follows) and 0x6A80 (the once-eaten retry) as data — a
 * sender that throws on either would kill the interrupt/continue protocol,
 * so pass-through on every status word is pinned here.
 */

import { describe, expect, it, vi } from "vitest";

import { createDmkRawApduSender } from "../dmkApduSender";
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
});
