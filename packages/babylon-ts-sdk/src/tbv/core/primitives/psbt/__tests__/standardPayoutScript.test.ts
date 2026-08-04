import { describe, expect, it } from "vitest";

import { assertStandardPayoutScript } from "../standardPayoutScript";

const LABEL = "Vault keeper payout script";

describe("assertStandardPayoutScript", () => {
  it.each([
    ["P2WPKH", `0014${"ab".repeat(20)}`],
    ["P2WSH", `0020${"cd".repeat(32)}`],
    ["P2TR", `5120${"ef".repeat(32)}`],
    ["P2PKH", `76a914${"11".repeat(20)}88ac`],
    ["P2SH", `a914${"22".repeat(20)}87`],
  ])("accepts a standard %s script", (_type, script) => {
    expect(() => assertStandardPayoutScript(script, LABEL)).not.toThrow();
  });

  it("accepts a 0x-prefixed script", () => {
    expect(() =>
      assertStandardPayoutScript(`0x0014${"ab".repeat(20)}`, LABEL),
    ).not.toThrow();
  });

  it("rejects an OP_RETURN script", () => {
    // The depositor pre-signs this destination; an OP_RETURN payout would be
    // unclaimable by anyone.
    expect(() => assertStandardPayoutScript("6a0401020304", LABEL)).toThrow(
      /provably unspendable/,
    );
  });

  it("rejects an empty script", () => {
    expect(() => assertStandardPayoutScript("0x", LABEL)).toThrow(/is empty/);
  });

  it("rejects non-hex input", () => {
    expect(() => assertStandardPayoutScript("zzzz", LABEL)).toThrow(
      /not valid hex/,
    );
  });

  it("rejects a truncated P2WPKH", () => {
    expect(() =>
      assertStandardPayoutScript(`0014${"ab".repeat(19)}`, LABEL),
    ).toThrow(/not a standard scriptPubKey/);
  });

  it("rejects an unrecognised script shape", () => {
    expect(() =>
      assertStandardPayoutScript(`0099${"ab".repeat(20)}`, LABEL),
    ).toThrow(/not a standard scriptPubKey/);
  });

  it("names the source in the error", () => {
    expect(() =>
      assertStandardPayoutScript("6a00", "VP commission script"),
    ).toThrow(/^VP commission script/);
  });
});
