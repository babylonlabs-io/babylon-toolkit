/**
 * Unit tests for the Keystone batch-signing progress label shown above the QR.
 */
import { expect, test } from "@playwright/test";

import { signingProgressLabel } from "../../src/core/wallets/btc/keystone/signingProgress";

test.describe("signingProgressLabel — batch progress shown in the Keystone QR modal", () => {
  test("renders a 1-based position out of the total", () => {
    expect(signingProgressLabel(0, 12)).toBe("Transaction 1 of 12");
    expect(signingProgressLabel(11, 12)).toBe("Transaction 12 of 12");
  });

  test("handles a single-PSBT batch", () => {
    expect(signingProgressLabel(0, 1)).toBe("Transaction 1 of 1");
  });
});
