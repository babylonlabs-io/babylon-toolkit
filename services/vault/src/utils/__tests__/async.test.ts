import { describe, expect, it, vi } from "vitest";

import { withRequestTimeout } from "@/utils/async";

// Both API clients (graphql/client.ts, indexer/aaveHistoryClient.ts) already
// exercise withRequestTimeout's caller-abort passthrough and generic-failure
// classification through their own test suites. graphqlClient's suite covers
// the timeout path too (including a stalled-body regression case — see
// clients/graphql/__tests__/client.test.ts), but only with
// `includeUrlInTimeoutMessage` unset — aaveHistoryClient sets it and has no
// timeout test of its own, so that's the one behavior worth covering here.
describe("withRequestTimeout", () => {
  it("includes the request URL in the timeout message when includeUrlInTimeoutMessage is set", async () => {
    vi.useFakeTimers();

    const promise = withRequestTimeout(
      {
        timeoutMs: 5_000,
        requestLabel: "Borrow rate history request",
        url: "https://indexer.test/history",
        includeUrlInTimeoutMessage: true,
      },
      (composedSignal) =>
        new Promise((_resolve, reject) => {
          composedSignal.addEventListener("abort", () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }),
    );
    const assertion = expect(promise).rejects.toThrow(
      "Borrow rate history request to https://indexer.test/history timed out after 5000ms",
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    vi.useRealTimers();
  });
});
