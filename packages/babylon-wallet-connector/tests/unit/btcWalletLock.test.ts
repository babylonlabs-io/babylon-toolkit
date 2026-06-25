import { expect, test } from "@playwright/test";

import {
  areBtcAccountsLocked,
  classifyBtcAccountsProbe,
} from "../../src/core/utils/walletLock";

test.describe("areBtcAccountsLocked — silent BTC wallet lock detection", () => {
  test("reports locked for an empty accounts array (UniSat/OneKey return [] when locked)", () => {
    expect(areBtcAccountsLocked([])).toBe(true);
  });

  test("reports unlocked when an account address is present", () => {
    expect(areBtcAccountsLocked(["bc1pexampleaddress"])).toBe(false);
  });

  test("reports unlocked when multiple account addresses are present", () => {
    expect(areBtcAccountsLocked(["bc1paddr1", "bc1paddr2"])).toBe(false);
  });

  test("reports locked for a non-array (malformed response) rather than hiding it", () => {
    expect(areBtcAccountsLocked(undefined as unknown as string[])).toBe(true);
    expect(areBtcAccountsLocked(null as unknown as string[])).toBe(true);
  });
});

test.describe("classifyBtcAccountsProbe — visibility-probe reaction without an interactive prompt", () => {
  const ADDR = "bc1pcachedaddress";

  test("classifies an empty read as locked (flag, don't prompt or disconnect)", () => {
    expect(classifyBtcAccountsProbe([], ADDR)).toBe("locked");
  });

  test("classifies a malformed (non-array) read as locked", () => {
    expect(classifyBtcAccountsProbe(undefined, ADDR)).toBe("locked");
  });

  test("classifies the cached address still being present as current (no-op, skip reconnect)", () => {
    expect(classifyBtcAccountsProbe([ADDR], ADDR)).toBe("current");
  });

  test("classifies current when the cached address is one of several accounts", () => {
    expect(classifyBtcAccountsProbe(["bc1pother", ADDR], ADDR)).toBe("current");
  });

  test("classifies a different active account as changed (fall through to refresh)", () => {
    expect(classifyBtcAccountsProbe(["bc1pdifferent"], ADDR)).toBe("changed");
  });
});
