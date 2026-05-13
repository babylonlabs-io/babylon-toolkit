/**
 * Network / chain failure-mode BASELINE coverage - regression only.
 *
 * Pins the bare-minimum invariant: when ETH RPC, the Vault Provider
 * proxy, or a slow ETH response fails, the app does not throw an
 * unhandled `pageerror` and the document still renders (title set,
 * shell paints text). That is the entirety of what this spec verifies.
 *
 * Catastrophic surfaces (GraphQL unreachable, GraphQL 5xx, missing env,
 * app paused) DO have user-visible blocking modals and are covered in
 * `catastrophic-errors.spec.ts`.
 *
 * What this spec deliberately does NOT verify - and why
 * -----------------------------------------------------
 * Issue #1599 acceptance criteria require:
 *   (a) Each failure mode produces a user-visible message naming the
 *       operation and the failure type.
 *   (b) Retries don't hang the UI (no infinite loaders).
 *   (c) When the network recovers mid-flow, the app continues without
 *       manual reload.
 *
 * None of (a), (b), or (c) currently exist in the app for transient
 * (non-catastrophic) failures:
 *   - ETH RPC timeout / 5xx: contract-read Suspense fallback stays
 *     mounted indefinitely; no top-level error banner, no toast.
 *   - VP proxy 5xx: `fetchVpHealth` returns `[]` on any failure as
 *     "graceful degradation" with no user signal
 *     (services/vault/src/services/vpHealth/fetchVpHealth.ts).
 *   - No spinner-timeout component / bounded Suspense wrapper exists.
 *
 * AC-compliant coverage requires building the missing UX first and is
 * tracked as follow-up work. Until then, this spec's value is catching
 * regressions where a previously silent failure starts throwing or
 * blanking the page.
 */

import { type Page, expect, test } from "@playwright/test";

// Sentinel URLs - must match MOCK_ENV_VARS in playwright.config.ts.
// Pinning these here means the intercept matches the exact URL the app
// fetches, independent of whichever .env file vite happens to load.
const ETH_RPC_URL = "http://localhost:9997/rpc";
const VP_PROXY_URL = "http://localhost:9998";
const VP_HEALTH_URL = `${VP_PROXY_URL}/vp-health`;

// How long after navigation to wait before re-checking captured page
// errors. Set above any per-call viem retry budget so late-arriving
// errors surface before afterEach asserts.
const PAGEERROR_SETTLE_TIMEOUT_MS = 5_000;

// How long the app shell has to render text before we consider it
// frozen by a slow RPC.
const SHELL_RENDER_TIMEOUT_MS = 3_000;

// Artificial RPC delay used by the slow-response test. Must exceed
// SHELL_RENDER_TIMEOUT_MS so the in-flight call is still pending when
// the shell assertion fires.
const SLOW_RPC_DELAY_MS = 5_000;

const GRAPHQL_HEALTHY_BODY = JSON.stringify({
  data: { __typename: "Query" },
});

const PAUSED_FALSE_RESULT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const PAUSED_SELECTOR_PREFIX = "0x5c975abb";

function buildPausedFalseResponseBody(id: unknown): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: PAUSED_FALSE_RESULT,
  });
}

async function stubGraphqlHealthy(page: Page) {
  await page.route("**/graphql", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: GRAPHQL_HEALTHY_BODY,
    });
  });
}

function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on("pageerror", (e) => {
    errors.push(e);
  });
  return errors;
}

test.describe("Network failure mode coverage", () => {
  let pageErrors: Error[];

  test.beforeEach(({ page }) => {
    pageErrors = collectPageErrors(page);
  });

  test.afterEach(() => {
    // Re-check captured errors. This catches `pageerror` events that
    // arrive after the in-test assertions (e.g. a viem retry that
    // surfaces late) which an inline boolean flag would miss.
    expect(
      pageErrors.map((e) => e.message),
      "no unhandled pageerror events should fire",
    ).toEqual([]);
  });

  test.describe("ETH RPC failures", () => {
    test("RPC timeout does not throw unhandled errors", async ({ page }) => {
      await stubGraphqlHealthy(page);

      // After the paused-check shortcut, every other RPC call aborts
      // immediately. This simulates an unreachable RPC.
      let abortCount = 0;
      await page.route(ETH_RPC_URL, async (route) => {
        const postData = route.request().postDataJSON();
        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data ?? "";
          if (data.startsWith(PAUSED_SELECTOR_PREFIX)) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: buildPausedFalseResponseBody(postData.id),
            });
            return;
          }
        }
        abortCount += 1;
        await route.abort("timedout");
      });

      await page.goto("/");
      await page.waitForTimeout(PAGEERROR_SETTLE_TIMEOUT_MS);

      // Existing behaviour: vault may stall on indefinite RPC failures
      // (the React tree under the contract-read Suspense boundary stays
      // blocked). What we DO require is that no JS error escapes and
      // that the simulated failure actually fired.
      expect(abortCount).toBeGreaterThan(0);
      await expect(page).toHaveTitle(/Babylon|Vault/i);
    });

    test("RPC server-error (500) does not throw unhandled errors", async ({
      page,
    }) => {
      await stubGraphqlHealthy(page);

      let errorResponseCount = 0;
      await page.route(ETH_RPC_URL, async (route) => {
        const postData = route.request().postDataJSON();
        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data ?? "";
          if (data.startsWith(PAUSED_SELECTOR_PREFIX)) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: buildPausedFalseResponseBody(postData.id),
            });
            return;
          }
        }
        errorResponseCount += 1;
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Internal Server Error",
        });
      });

      await page.goto("/");
      await page.waitForTimeout(PAGEERROR_SETTLE_TIMEOUT_MS);

      expect(errorResponseCount).toBeGreaterThan(0);
      await expect(page).toHaveTitle(/Babylon|Vault/i);
    });
  });

  test.describe("Vault Provider proxy failures", () => {
    test("VP proxy 5xx does not crash the app", async ({ page }) => {
      await stubGraphqlHealthy(page);

      // Let the paused-check pass so the app proceeds far enough to
      // call the VP health endpoint.
      await page.route(ETH_RPC_URL, async (route) => {
        const postData = route.request().postDataJSON();
        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data ?? "";
          if (data.startsWith(PAUSED_SELECTOR_PREFIX)) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: buildPausedFalseResponseBody(postData.id),
            });
            return;
          }
        }
        await route.abort("timedout");
      });

      let vpHealthHitCount = 0;
      await page.route(VP_HEALTH_URL, async (route) => {
        vpHealthHitCount += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "service unavailable" }),
        });
      });

      await page.goto("/");
      await page.waitForTimeout(PAGEERROR_SETTLE_TIMEOUT_MS);

      // If this is 0 the regression target was never exercised - the
      // test would otherwise pass vacuously.
      expect(vpHealthHitCount).toBeGreaterThan(0);
      await expect(page).toHaveTitle(/Babylon|Vault/i);
    });
  });

  test.describe("Slow responses", () => {
    test("slow ETH RPC does not freeze the app shell", async ({ page }) => {
      await stubGraphqlHealthy(page);

      let slowResponseCount = 0;
      await page.route(ETH_RPC_URL, async (route) => {
        const postData = route.request().postDataJSON();
        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data ?? "";
          if (data.startsWith(PAUSED_SELECTOR_PREFIX)) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: buildPausedFalseResponseBody(postData.id),
            });
            return;
          }
        }
        slowResponseCount += 1;
        // Hold the request for SLOW_RPC_DELAY_MS, then return a
        // JSON-RPC error. Crucially, the handler never forwards to
        // upstream (no `route.continue()`), so retries cannot leak
        // real network traffic to the sentinel URL.
        await new Promise((resolve) => setTimeout(resolve, SLOW_RPC_DELAY_MS));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData?.id ?? null,
            error: { code: -32603, message: "Internal error" },
          }),
        });
      });

      await page.goto("/");

      // Within a short window (well under the slow delay), the app shell
      // must render even though ETH reads are still in-flight.
      const bodyText = await page
        .locator("body")
        .innerText({ timeout: SHELL_RENDER_TIMEOUT_MS });
      expect(bodyText.length).toBeGreaterThan(0);
      expect(slowResponseCount).toBeGreaterThan(0);
    });
  });
});
