/**
 * Tests for the DMK raw-APDU binding: wire serialisation and status-word
 * handling. A wrong Lc or a swallowed error status would surface as a
 * mysterious device failure, so both are pinned here.
 */

import { describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "@/error";

import { createDmkApduSender } from "../dmkApduSender";
import type { DmkSessionHandle } from "../dmkSession";

const ok = (data = new Uint8Array()) => ({
  statusCode: new Uint8Array([0x90, 0x00]),
  data,
});

function handleWith(response: { statusCode: Uint8Array; data: Uint8Array }) {
  const sendApdu = vi.fn().mockResolvedValue(response);
  return {
    handle: { dmk: { sendApdu }, sessionId: "s1" } as unknown as DmkSessionHandle,
    sendApdu,
  };
}

describe("createDmkApduSender", () => {
  it("serialises CLA/INS/P1/P2/Lc and the payload in order", async () => {
    const { handle, sendApdu } = handleWith(ok());
    const send = createDmkApduSender(handle);

    await send({ cla: 0xe1, ins: 0x80, p1: 0x02, p2: 0x00, data: new Uint8Array([0xaa, 0xbb]) });

    expect(sendApdu).toHaveBeenCalledWith({
      sessionId: "s1",
      apdu: new Uint8Array([0xe1, 0x80, 0x02, 0x00, 0x02, 0xaa, 0xbb]),
    });
  });

  it("writes Lc as the payload length, including zero", async () => {
    const { handle, sendApdu } = handleWith(ok());
    await createDmkApduSender(handle)({
      cla: 0xe1,
      ins: 0x81,
      p1: 0,
      p2: 0,
      data: new Uint8Array(),
    });

    expect(sendApdu.mock.calls[0][0].apdu).toEqual(new Uint8Array([0xe1, 0x81, 0x00, 0x00, 0x00]));
  });

  it("returns the response data on 0x9000", async () => {
    const root = new Uint8Array(32).fill(7);
    const { handle } = handleWith(ok(root));

    await expect(
      createDmkApduSender(handle)({ cla: 0xe1, ins: 0x81, p1: 0, p2: 0, data: new Uint8Array([1]) }),
    ).resolves.toEqual(root);
  });

  it.each([
    [0x6a80, /rejected the data as invalid/],
    [0xb007, /not in the expected state/],
  ])("throws a readable message for status 0x%s", async (sw, expected) => {
    const { handle } = handleWith({
      statusCode: new Uint8Array([(sw >> 8) & 0xff, sw & 0xff]),
      data: new Uint8Array(),
    });

    await expect(
      createDmkApduSender(handle)({ cla: 0xe1, ins: 0x80, p1: 0, p2: 0, data: new Uint8Array() }),
    ).rejects.toThrow(expected);
  });

  it.each([
    ["0x6985", [0x69, 0x85]],
    ["0x5501", [0x55, 0x01]],
  ])("reports a %s decline as a user rejection, not a device failure", async (_label, bytes) => {
    // Both are refused-by-user codes per DMK's own CommandUtils.isRefusedByUser;
    // the wording starts "User rejected" so the app still classifies it if a
    // wrapper drops the code. Whether a decline nullifies a loaded intent is
    // unconfirmed with Ledger (#2110).
    const { handle } = handleWith({
      statusCode: new Uint8Array(bytes),
      data: new Uint8Array(),
    });

    const call = createDmkApduSender(handle)({
      cla: 0xe1,
      ins: 0x80,
      p1: 0,
      p2: 0,
      data: new Uint8Array(),
    });
    await expect(call).rejects.toMatchObject({ code: ERROR_CODES.CONNECTION_REJECTED });
    await expect(call).rejects.toThrow(/User rejected/);
  });

  it("asks the user to unlock on a locked-device status word", async () => {
    // 0x5515 is one of DMK's isLockedDeviceResponse codes; a lock must read as
    // "unlock and retry", not as the device rejecting the request.
    const { handle } = handleWith({
      statusCode: new Uint8Array([0x55, 0x15]),
      data: new Uint8Array(),
    });

    const call = createDmkApduSender(handle)({ cla: 0xe1, ins: 0x80, p1: 0, p2: 0, data: new Uint8Array() });
    await expect(call).rejects.toMatchObject({ code: ERROR_CODES.CONNECTION_FAILED });
    await expect(call).rejects.toThrow(/locked/);
  });

  it("tells the user to open the vault app on 0x6E00, naming the running app", async () => {
    // 0x6E00 (bad CLA) is what the dashboard or a wrong app returns — the most
    // likely first-contact failure, since raw sendApdu never opens an app.
    const sendApdu = vi.fn().mockResolvedValue({ statusCode: new Uint8Array([0x6e, 0x00]), data: new Uint8Array() });
    const handle = { dmk: { sendApdu }, sessionId: "s1", appName: "BOLOS" } as unknown as DmkSessionHandle;

    const call = createDmkApduSender(handle)({ cla: 0xe1, ins: 0x81, p1: 0, p2: 0, data: new Uint8Array() });
    await expect(call).rejects.toThrow(/open the Babylon Vault app/);
    await expect(call).rejects.toThrow(/"BOLOS"/);
  });

  it("surfaces an unmapped status word as hex rather than guessing", async () => {
    // Ledger has not published the full taxonomy; inventing meanings would be
    // worse than showing the raw code (#2110).
    const { handle } = handleWith({
      statusCode: new Uint8Array([0x6f, 0x42]),
      data: new Uint8Array(),
    });

    await expect(
      createDmkApduSender(handle)({ cla: 0xe1, ins: 0x80, p1: 0, p2: 0, data: new Uint8Array() }),
    ).rejects.toThrow(/0x6f42/);
  });

  it.each([
    ["a 1-byte", [0x90]],
    ["an empty", []],
    ["a 3-byte", [0x90, 0x00, 0x00]],
  ])("rejects %s status word instead of guessing at it", async (_label, bytes) => {
    // [0x90] would otherwise read as 0x9000 — a malformed response taken as
    // success, i.e. believing the device approved an intent it never saw.
    const { handle } = handleWith({
      statusCode: new Uint8Array(bytes),
      data: new Uint8Array(),
    });

    await expect(
      createDmkApduSender(handle)({ cla: 0xe1, ins: 0x80, p1: 0, p2: 0, data: new Uint8Array() }),
    ).rejects.toThrow(/status word/);
  });

  it("refuses a payload that cannot fit in the single-byte Lc", async () => {
    const { handle } = handleWith(ok());

    await expect(
      createDmkApduSender(handle)({
        cla: 0xe1,
        ins: 0x80,
        p1: 0,
        p2: 0,
        data: new Uint8Array(256),
      }),
    ).rejects.toThrow(/Lc is a single byte/);
  });
});
