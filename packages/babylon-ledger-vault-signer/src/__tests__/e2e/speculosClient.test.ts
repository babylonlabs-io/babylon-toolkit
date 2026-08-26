/**
 * Unit tests for the Speculos e2e helpers that need no emulator.
 *
 * `getAppAndVersion` parses a length-prefixed device response, so every length
 * byte is attacker/emulator-controlled — the truncation guards are the only
 * thing between a malformed frame and a silently wrong result. Every rejection
 * case matches the message of the one guard it pins, so collapsing two guards
 * onto a shared message fails here rather than passing on a sibling's throw.
 *
 * The transport tests pin the posted wire bytes for a NON-EMPTY payload: this
 * sender carries the SIGN_PSBT cdata (built in `signPsbtPrepare.ts` — a
 * 65-byte global commitment `varint(n) ‖ keysRoot(32) ‖ valuesRoot(32)`, two
 * count varints, and four 32-byte fields: inputsRoot, outputsRoot, walletId,
 * walletHmac; 195 bytes across every committed signpsbt vector) and every
 * CONTINUE payload, and a zero-length APDU cannot distinguish a correct frame
 * from an all-zero buffer.
 */

import { Buffer } from "buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LEDGER_USER_REFUSED_ERROR_NAME } from "../../errors";
import type { Apdu, RawApduSender } from "../../rawApdu";
import {
  createSpeculosApduSender,
  createSpeculosRawApduSender,
  getAppAndVersion,
  readSpeculosUrl,
  SW_OK,
} from "./speculosClient";

/** A sender that answers success with the given response body. */
function senderReturning(dataHex: string): RawApduSender {
  return async () => ({ sw: SW_OK, data: Buffer.from(dataHex, "hex") });
}

describe("readSpeculosUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an empty string when SPECULOS_URL is unset, so the e2e files skip", () => {
    vi.stubEnv("SPECULOS_URL", "");
    vi.stubEnv("SPECULOS_REQUIRED", "");

    expect(readSpeculosUrl()).toBe("");
  });

  it("returns SPECULOS_URL when it is set", () => {
    vi.stubEnv("SPECULOS_URL", "http://127.0.0.1:5055");
    vi.stubEnv("SPECULOS_REQUIRED", "1");

    expect(readSpeculosUrl()).toBe("http://127.0.0.1:5055");
  });

  it("throws when SPECULOS_REQUIRED is set but SPECULOS_URL is empty, instead of letting the e2e files skip", () => {
    vi.stubEnv("SPECULOS_URL", "");
    vi.stubEnv("SPECULOS_REQUIRED", "1");

    expect(() => readSpeculosUrl()).toThrow(/SPECULOS_REQUIRED is set but SPECULOS_URL is empty/);
  });
});

describe("getAppAndVersion", () => {
  it("asks for the BOLOS GET_APP_AND_VERSION with no data", async () => {
    const sent: Apdu[] = [];
    const send: RawApduSender = async (apdu) => {
      sent.push(apdu);
      return { sw: SW_OK, data: Buffer.from("010361707003312e30", "hex") };
    };

    await getAppAndVersion(send);

    // B0 01 00 00 (Lc 0) per the reference client LedgerHQ/ledger-live@2ec1cda
    // `libs/ledger-live-common/src/hw/getAppAndVersion.ts` — `transport.send(0xb0, 0x01, 0x00, 0x00)`.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ cla: 0xb0, ins: 0x01, p1: 0x00, p2: 0x00, data: new Uint8Array(0) });
  });

  it("parses a well-formed response", async () => {
    // format(01) ‖ len(03) ‖ "app" ‖ len(03) ‖ "1.0"
    const app = await getAppAndVersion(senderReturning("010361707003312e30"));

    expect(app).toEqual({ name: "app", version: "1.0" });
  });

  it("rejects a status word other than success", async () => {
    // The body is well-formed, so only the status-word check can reject it.
    const send: RawApduSender = async () => ({ sw: 0x6d00, data: Buffer.from("010361707003312e30", "hex") });

    await expect(getAppAndVersion(send)).rejects.toThrow(/answered sw 0x6d00/);
  });

  it("rejects a response too short to hold the format and length prefixes", async () => {
    // format ‖ len(03) and nothing else — one byte under the 3-byte minimum.
    await expect(getAppAndVersion(senderReturning("0103"))).rejects.toThrow(/answered 2 bytes/);
  });

  it("rejects an unknown format byte", async () => {
    // The well-formed response byte for byte, with format 0x02 instead of 0x01.
    await expect(getAppAndVersion(senderReturning("020361707003312e30"))).rejects.toThrow(
      /answered format 0x02, expected 0x01/,
    );
  });

  it("rejects a name length that runs past the response", async () => {
    // Claims a 9-byte name in a 6-byte body: the version-length byte is absent,
    // so reading it yields undefined and every later bound becomes NaN — which
    // compares false against any length and would slip through unguarded.
    await expect(getAppAndVersion(senderReturning("010961707003"))).rejects.toThrow(
      /name length 9 leaves no version-length byte in 6 bytes/,
    );
  });

  it("rejects a name that ends exactly at the response end (no version-length byte)", async () => {
    // format ‖ len(03) ‖ "app" and nothing else — the exact `>=` boundary.
    await expect(getAppAndVersion(senderReturning("0103617070"))).rejects.toThrow(
      /name length 3 leaves no version-length byte in 5 bytes/,
    );
  });

  it("rejects a version one byte shorter than its length claims", async () => {
    // format ‖ len(03) ‖ "app" ‖ len(03) ‖ "12": the tightest witness for the
    // bound — a body missing more bytes still passes a bound relaxed by one.
    await expect(getAppAndVersion(senderReturning("0103617070033132"))).rejects.toThrow(
      /version length 3 needs 9 bytes, response has 8/,
    );
  });
});

describe("createSpeculosRawApduSender", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the header of an empty-payload APDU and strips the trailing status word", async () => {
    const posts: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      posts.push({ url, body: String(init.body) });
      // "app" / "1.0" ‖ 9000 — Speculos appends the status word to the data.
      return { ok: true, json: async () => ({ data: "010361707003312e309000" }) };
    });

    const app = await getAppAndVersion(createSpeculosRawApduSender("http://speculos.test"));

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("http://speculos.test/apdu");
    expect(JSON.parse(posts[0].body)).toEqual({ data: "b001000000" });
    expect(app).toEqual({ name: "app", version: "1.0" });
  });

  it("posts the payload after a one-byte length, per the reference transport framing", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      posts.push(String(init.body));
      return { ok: true, json: async () => ({ data: "9000" }) };
    });

    await createSpeculosRawApduSender("http://speculos.test")({
      cla: 0xe1,
      ins: 0x80,
      p1: 0x02,
      p2: 0x00,
      data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    });

    // Framing per hw-transport `Transport.send` (LedgerHQ/ledger-live@427ed59
    // `libs/ledgerjs/packages/hw-transport/src/Transport.ts:269-272`): the data
    // length goes in one byte just before the data. Non-empty payload on
    // purpose — a zero-length APDU cannot tell the frame from a zeroed buffer.
    expect(posts).toEqual([JSON.stringify({ data: "e180020004deadbeef" })]);
  });

  it("accepts the largest payload a single-byte Lc can carry", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      posts.push(String(init.body));
      return { ok: true, json: async () => ({ data: "9000" }) };
    });

    await createSpeculosRawApduSender("http://speculos.test")({
      cla: 0xe1,
      ins: 0x80,
      p1: 0x02,
      p2: 0x00,
      data: new Uint8Array(255).fill(0xab),
    });

    // 255 is the last accepted length — the reference transport rejects at
    // `data.length >= 256` (LedgerHQ/ledger-live@427ed59 `Transport.ts:261-267`).
    expect(posts).toEqual([JSON.stringify({ data: `e1800200ff${"ab".repeat(255)}` })]);
  });

  it("rejects a payload one byte too long for Lc before issuing any request", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      posts.push(String(init.body));
      return { ok: true, json: async () => ({ data: "9000" }) };
    });

    // Lc truncates mod-256, so an unguarded 256-byte payload would post Lc 00
    // and the device would parse the frame short instead of failing.
    await expect(
      createSpeculosRawApduSender("http://speculos.test")({
        cla: 0xe1,
        ins: 0x80,
        p1: 0x02,
        p2: 0x00,
        data: new Uint8Array(256),
      }),
    ).rejects.toThrow(/APDU data is 256 bytes; Lc is a single byte \(max 255\)/);
    expect(posts).toEqual([]);
  });
});

describe("createSpeculosApduSender", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const apdu: Apdu = { cla: 0xe1, ins: 0x80, p1: 0x02, p2: 0x00, data: new Uint8Array(0) };

  it("returns the response data without the status word on 0x9000", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ data: "aabb9000" }) }));

    const data = await createSpeculosApduSender("http://speculos.test")(apdu);

    expect(Array.from(data)).toEqual([0xaa, 0xbb]);
  });

  it("raises the shared typed error on a device refusal, exactly as the DMK sender does", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ data: "6985" }) }));

    await expect(createSpeculosApduSender("http://speculos.test")(apdu)).rejects.toMatchObject({
      name: LEDGER_USER_REFUSED_ERROR_NAME,
      statusWord: 0x6985,
    });
  });
});
