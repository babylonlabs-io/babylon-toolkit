/**
 * Unit tests for the Speculos e2e helpers that need no emulator.
 *
 * `getAppAndVersion` parses a length-prefixed device response, so every length
 * byte is attacker/emulator-controlled — the truncation guards are the only
 * thing between a malformed frame and a silently wrong result.
 */

import { describe, expect, it } from "vitest";

import type { RawApduSender } from "../../rawApdu";
import { getAppAndVersion } from "./speculosClient";

/** A sender that answers 0x9000 with the given response body. */
function senderReturning(dataHex: string): RawApduSender {
  return async () => ({ sw: 0x9000, data: Buffer.from(dataHex, "hex") });
}

describe("getAppAndVersion", () => {
  it("parses a well-formed response", async () => {
    // format(01) ‖ len(03) ‖ "app" ‖ len(03) ‖ "1.0"
    const app = await getAppAndVersion(senderReturning("010361707003312e30"));

    expect(app).toEqual({ name: "app", version: "1.0" });
  });

  it("rejects a name length that runs past the response", async () => {
    // Claims a 9-byte name in a 6-byte body: the version-length byte is absent,
    // so reading it yields undefined and every later bound becomes NaN — which
    // compares false against any length and would slip through unguarded.
    await expect(getAppAndVersion(senderReturning("010961707003"))).rejects.toThrow(/truncated/);
  });

  it("rejects a name that ends exactly at the response end (no version-length byte)", async () => {
    // format ‖ len(03) ‖ "app" and nothing else.
    await expect(getAppAndVersion(senderReturning("0103617070"))).rejects.toThrow(/truncated/);
  });

  it("rejects a version length that runs past the response", async () => {
    // format ‖ len(03) ‖ "app" ‖ len(09) ‖ only 2 bytes of version
    await expect(getAppAndVersion(senderReturning("0103617070093132"))).rejects.toThrow(/truncated/);
  });
});
