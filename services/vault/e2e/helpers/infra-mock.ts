/**
 * Reusable infrastructure mocks for e2e tests.  These mocks satisfy the
 * always-on background requests (health check, GraphQL, ETH RPC, address
 * screening) so that tests do not have to redefine them in every file.
 *
 * Tests that need to override a specific endpoint should call
 * `setupHealthyInfra()` first and then re-route the URL they care about — the
 * later `page.route` registration takes precedence in Playwright.
 */

import type { Page } from "@playwright/test";

// ABI-encoded uint256(0) — used as a generic "false / zero" eth_call result.
export const ABI_FALSE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
// ABI-encoded uint256(1) — used as a generic "true / non-zero" eth_call result.
export const ABI_TRUE =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

/** Health endpoint returning 200. */
export async function mockHealthCheck(page: Page): Promise<void> {
  await page.route("**/health", async (route) => {
    await route.fulfill({ status: 200, body: "OK" });
  });
}

/** GraphQL endpoint returning empty data — override per-test for richer fixtures. */
export async function mockEmptyGraphQL(page: Page): Promise<void> {
  await page.route("**/graphql", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { __typename: "Query" } }),
    });
  });
}

/** Address screening API returning low-risk for any address. */
export async function mockHealthyScreening(page: Page): Promise<void> {
  await page.route("**/address/screening**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { address: { risk: "low" } } }),
    });
  });
}

/**
 * Default ETH RPC handler — answers paused() with false and every other
 * eth_call with ABI_TRUE.  Tests that need richer contract semantics should
 * register their own catch-all RPC route after calling this helper.
 */
export async function mockBaselineEthRpc(page: Page): Promise<void> {
  await page.route(/.*eth.*|.*rpc.*/, async (route) => {
    const postData = route.request().postDataJSON() as
      | { method?: string; params?: unknown[]; id?: number }
      | null;
    if (!postData?.method) {
      await route.continue();
      return;
    }

    const callData =
      (postData.params?.[0] as { data?: string } | undefined)?.data ?? "";

    switch (postData.method) {
      case "eth_call": {
        const result = callData.startsWith("0x5c975abb") ? ABI_FALSE : ABI_TRUE;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result,
          }),
        });
        return;
      }
      case "eth_blockNumber":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: "0xf4240",
          }),
        });
        return;
      case "eth_chainId":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: "0xaa36a7",
          }),
        });
        return;
      case "eth_gasPrice":
      case "eth_maxFeePerGas":
      case "eth_maxPriorityFeePerGas":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: "0x3b9aca00",
          }),
        });
        return;
      case "eth_estimateGas":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: "0x30d40",
          }),
        });
        return;
      default:
        await route.continue();
    }
  });
}

/** All baseline mocks needed for the dApp to render past initial gating. */
export async function setupHealthyInfra(page: Page): Promise<void> {
  await mockHealthCheck(page);
  await mockEmptyGraphQL(page);
  await mockBaselineEthRpc(page);
  await mockHealthyScreening(page);
}
