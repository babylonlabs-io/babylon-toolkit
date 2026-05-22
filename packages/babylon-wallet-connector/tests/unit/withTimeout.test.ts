import { expect, test } from "@playwright/test";

import { withTimeout } from "../../src/core/utils/withTimeout";

const TimeoutError = () => new Error("timed out");

test.describe("withTimeout — bound a wallet RPC call so a hang becomes a rejection", () => {
  test("resolves with the underlying value when it settles before the timeout", async () => {
    const result = await withTimeout(Promise.resolve("pubkey"), 1000, TimeoutError);
    expect(result).toBe("pubkey");
  });

  test("rejects with the onTimeout error when the underlying promise never settles", async () => {
    const neverSettles = new Promise<string>(() => {});
    await expect(withTimeout(neverSettles, 50, TimeoutError)).rejects.toThrow("timed out");
  });

  test("propagates the underlying rejection when it rejects before the timeout", async () => {
    const failing = Promise.reject(new Error("user rejected"));
    await expect(withTimeout(failing, 1000, TimeoutError)).rejects.toThrow("user rejected");
  });

  test("resolves a slow-but-in-budget promise rather than timing out", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(42), 30));
    const result = await withTimeout(slow, 500, TimeoutError);
    expect(result).toBe(42);
  });

  test("does not reject after the underlying promise has already resolved (timer is cleared)", async () => {
    let rejectedLate = false;
    const result = await withTimeout(Promise.resolve("ok"), 20, TimeoutError);
    expect(result).toBe("ok");
    // Wait past the original timeout budget; a leaked timer would reject here.
    await new Promise((resolve) => setTimeout(resolve, 60)).catch(() => {
      rejectedLate = true;
    });
    expect(rejectedLate).toBe(false);
  });
});
