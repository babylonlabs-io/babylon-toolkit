/**
 * Unit tests for the Keystone connected-leaf key path. This is the load-bearing
 * value handed to deriveContextHash / signing: it MUST be the `/0/0` receive
 * leaf, not the bare account path (using the account path was the bug fixed vs
 * PR #1834). Pinning it here stops a refactor from silently dropping `/0/0`.
 */
import { expect, test } from "@playwright/test";

import { connectedLeafKeyPath } from "../../src/core/wallets/btc/keystone/connectedKeyPath";

test.describe("connectedLeafKeyPath — appends the /0/0 receive leaf", () => {
  test("appends /0/0 to a mainnet Taproot account path", () => {
    expect(connectedLeafKeyPath("m/86'/0'/0'")).toBe("m/86'/0'/0'/0/0");
  });

  test("appends /0/0 to a testnet/signet Taproot account path", () => {
    expect(connectedLeafKeyPath("m/86'/1'/0'")).toBe("m/86'/1'/0'/0/0");
  });

  test("does not return the bare account path", () => {
    const accountPath = "m/86'/0'/0'";
    expect(connectedLeafKeyPath(accountPath)).not.toBe(accountPath);
  });
});
