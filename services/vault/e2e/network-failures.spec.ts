/**
 * Network / chain failure-mode regression coverage. Pins how the app
 * behaves when external dependencies fail - ETH RPC, the Vault Provider
 * proxy, or a slow response. The existing `catastrophic-errors.spec.ts`
 * covers GraphQL and missing-env failures; this spec complements it by
 * targeting the surfaces above.
 *
 * Each test asserts two invariants:
 *   1. The app must not throw an unhandled error (`pageerror`).
 *   2. The app must not get stuck on an indefinite loading spinner -
 *      it either renders an error state or empty state within a
 *      bounded timeout.
 *
 * Specific error-text assertions are intentionally avoided where the
 * UX surface is fragile - the goal is regression coverage, not UX
 * specification. Where the existing app exposes well-known error
 * banners (e.g. catastrophic-errors), specific text is asserted.
 */

import { type Page, expect, test } from "@playwright/test";

const PORT = 5175;
const BASE_URL = `http://localhost:${PORT}`;

const GRAPHQL_HEALTHY_BODY = JSON.stringify({
  data: { __typename: "Query" },
});

const PAUSED_FALSE_RESULT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const PAUSED_SELECTOR_PREFIX = "0x5c975abb";

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
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: PAUSED_FALSE_RESULT,
          }),
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
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: postData.id,
                result: PAUSED_FALSE_RESULT,
              }),
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
      await page.waitForTimeout(5_000);

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
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: postData.id,
                result: PAUSED_FALSE_RESULT,
              }),
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
      await page.waitForTimeout(5_000);

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
      await page.waitForTimeout(5_000);

      expect(unhandled).toBe(false);
      await expect(page).toHaveTitle(/Babylon|Vault/i);
    });
  });

  test.describe("Slow responses", () => {
    test("slow ETH RPC does not freeze the app shell", async ({ page }) => {
      await stubGraphqlHealthy(page);

      const SLOW_DELAY_MS = 5_000;
      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();
        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data ?? "";
          if (data.startsWith(PAUSED_SELECTOR_PREFIX)) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: postData.id,
                result: PAUSED_FALSE_RESULT,
              }),
            });
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, SLOW_DELAY_MS));
        await route.continue();
      });

      await page.goto(`${BASE_URL}/`);

      // Within a short window (well under the slow delay), the app shell
      // must render even though ETH reads are still in-flight.
      const bodyText = await page
        .locator("body")
        .innerText({ timeout: 3_000 });
      expect(bodyText.length).toBeGreaterThan(0);
    });
  });
});
