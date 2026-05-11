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

const PORT = 5175;
const BASE_URL = `http://localhost:${PORT}`;

// Upper bound for any unhandled error to surface after navigation. The
// wait completes early if the network goes idle, which is the
// "all retries exhausted" signal for failing RPC routes.
const PAGEERROR_SETTLE_TIMEOUT_MS = 10_000;

// How long the app shell has to render text before we consider it
// frozen by a slow RPC.
const SHELL_RENDER_TIMEOUT_MS = 3_000;

// Artificial RPC delay used by the slow-response test.
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

async function settleAfterNavigation(page: Page): Promise<void> {
  await page
    .waitForLoadState("networkidle", { timeout: PAGEERROR_SETTLE_TIMEOUT_MS })
    .catch(() => undefined);
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

async function stubPausedCheckHealthy(page: Page) {
  // The app's first ETH read is `paused()` (selector 0x5c975abb).
  // Returning false here lets the app proceed past the catastrophic
  // "Application Paused" gate so we can exercise downstream behaviour.
  await page.route(/.*eth.*|.*rpc.*/, async (route) => {
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
    await route.continue();
  });
}

test.describe("Network failure mode coverage", () => {
  test.describe("ETH RPC failures", () => {
    test("RPC timeout does not throw unhandled errors", async ({ page }) => {
      await stubGraphqlHealthy(page);

      // After the paused-check shortcut, every other RPC call aborts
      // immediately. This simulates an unreachable RPC.
      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
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

      let unhandled = false;
      page.on("pageerror", () => {
        unhandled = true;
      });

      await page.goto(`${BASE_URL}/`);
      await settleAfterNavigation(page);

      // Existing behaviour: vault may stall on indefinite RPC failures
      // (the React tree under the contract-read Suspense boundary stays
      // blocked). What we DO require is that no JS error escapes.
      expect(unhandled).toBe(false);
      await expect(page).toHaveTitle(/Babylon|Vault/i);
    });

    test("RPC server-error (500) does not throw unhandled errors", async ({
      page,
    }) => {
      await stubGraphqlHealthy(page);

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
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
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Internal Server Error",
        });
      });

      let unhandled = false;
      page.on("pageerror", () => {
        unhandled = true;
      });

      await page.goto(`${BASE_URL}/`);
      await settleAfterNavigation(page);

      expect(unhandled).toBe(false);
      await expect(page).toHaveTitle(/Babylon|Vault/i);
    });
  });

  test.describe("Vault Provider proxy failures", () => {
    test("VP proxy 5xx does not crash the app", async ({ page }) => {
      await stubGraphqlHealthy(page);
      await stubPausedCheckHealthy(page);

      // Match the VP proxy URL family used by all VP service callers.
      // The dev env's URL is configurable but always carries
      // `vault-provider-proxy` somewhere in the host or path.
      await page.route(/vault-provider-proxy|vp-proxy|\/vp\//, async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "service unavailable" }),
        });
      });

      let unhandled = false;
      page.on("pageerror", () => {
        unhandled = true;
      });

      await page.goto(`${BASE_URL}/`);
      await settleAfterNavigation(page);

      expect(unhandled).toBe(false);
      await expect(page).toHaveTitle(/Babylon|Vault/i);
    });
  });

  test.describe("Slow responses", () => {
    test("slow ETH RPC does not freeze the app shell", async ({ page }) => {
      await stubGraphqlHealthy(page);

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
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
        await new Promise((resolve) => setTimeout(resolve, SLOW_RPC_DELAY_MS));
        await route.continue();
      });

      await page.goto(`${BASE_URL}/`);

      // Within a short window (well under the slow delay), the app shell
      // must render even though ETH reads are still in-flight.
      const bodyText = await page
        .locator("body")
        .innerText({ timeout: SHELL_RENDER_TIMEOUT_MS });
      expect(bodyText.length).toBeGreaterThan(0);
    });
  });
});
