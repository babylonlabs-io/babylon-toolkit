/**
 * Table tests for the shared status-word classification. The throwing sender
 * and the future SIGN_PSBT loop both route terminal words through
 * `classifyStatusWord`, so a drifted mapping here would misreport a device
 * outcome on two seams at once.
 */

import { describe, expect, it } from "vitest";

import { LEDGER_DEVICE_ERROR_NAME, LEDGER_DEVICE_LOCKED_ERROR_NAME, LEDGER_USER_REFUSED_ERROR_NAME } from "../errors";
import { classifyStatusWord } from "../rawApdu";

const context = { ins: 0x80, p1: 0x02 };

describe("classifyStatusWord", () => {
  it("returns undefined for 0x9000 — success is not an error", () => {
    expect(classifyStatusWord(0x9000, context)).toBeUndefined();
  });

  it.each([[0x6985], [0x5501]])("classifies 0x%s as a user refusal carrying the status word", (sw) => {
    const error = classifyStatusWord(sw, context);
    expect(error).toMatchObject({ name: LEDGER_USER_REFUSED_ERROR_NAME, statusWord: sw });
    expect(error?.message).toMatch(/User rejected/);
  });

  it.each([[0x5515], [0x6982], [0x5303]])("classifies 0x%s as a locked device", (sw) => {
    const error = classifyStatusWord(sw, context);
    expect(error).toMatchObject({ name: LEDGER_DEVICE_LOCKED_ERROR_NAME, statusWord: sw });
    expect(error?.message).toMatch(/locked/);
  });

  it.each([
    [0x6a80, /rejected the data as invalid/],
    [0xb007, /not in the expected state/],
    [0xb00a, /maximum number of these transactions/],
  ])("maps 0x%s to a readable device error naming the instruction", (sw, expected) => {
    const error = classifyStatusWord(sw, context);
    expect(error).toMatchObject({ name: LEDGER_DEVICE_ERROR_NAME, statusWord: sw });
    expect(error?.message).toMatch(expected);
    expect(error?.message).toMatch(/ins 0x80 p1 0x02/);
  });

  it("classifies 0xE000 as a device error — the SIGN_PSBT loop must consume it as data before classifying", () => {
    // 0xE000 (client command follows) is loop data on the raw seam; anything
    // that still reaches classification treats it as the throwing sender
    // always has — an unmapped rejection, shown as raw hex.
    const error = classifyStatusWord(0xe000, context);
    expect(error).toMatchObject({ name: LEDGER_DEVICE_ERROR_NAME, statusWord: 0xe000 });
    expect(error?.message).toMatch(/0xe000/);
  });

  it("surfaces an unmapped status word as hex rather than guessing", () => {
    const error = classifyStatusWord(0x6f42, context);
    expect(error).toMatchObject({ name: LEDGER_DEVICE_ERROR_NAME, statusWord: 0x6f42 });
    expect(error?.message).toMatch(/0x6f42/);
  });

  it("names the connect-time app on 0x6E00 when the context carries one", () => {
    const error = classifyStatusWord(0x6e00, { ...context, appName: "BOLOS", appVersion: "1.6.0" });
    expect(error?.message).toMatch(/open the Babylon Vault app/);
    expect(error?.message).toMatch(/"BOLOS" v1\.6\.0/);
  });

  it("omits the app hint on 0x6E00 when no app name was captured", () => {
    const error = classifyStatusWord(0x6e00, context);
    expect(error?.message).toMatch(/open the Babylon Vault app/);
    expect(error?.message).not.toMatch(/app at connect time/);
  });
});
