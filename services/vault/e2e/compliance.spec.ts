import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  injectWalletMocks,
  MOCK_BTC_ADDRESS,
  MOCK_ETH_ADDRESS,
} from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

// ---------------------------------------------------------------------------
// Infrastructure mocks
// ---------------------------------------------------------------------------

async function mockHealthyRpc(page: Page): Promise<void> {
  await page.route(/.*eth.*|.*rpc.*/, async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.method === "eth_call") {
      const data = (postData.params?.[0] as { data?: string })?.data ?? "";
      if (data.startsWith("0x5c975abb")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
          }),
        });
        return;
      }
    }
    await route.continue();
  });
}

async function mockHealthyGraphQL(page: Page): Promise<void> {
  await page.route("**/graphql", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { __typename: "Query" } }),
    });
  });
}

async function mockHealthyScreening(page: Page): Promise<void> {
  await page.route("**/address/screening**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { address: { risk: "low" } } }),
    });
  });
}

// ---------------------------------------------------------------------------
// BT-22: User is blocked from accessing the dApp from restricted jurisdictions
// ---------------------------------------------------------------------------

test.describe("Compliance — BT-22", { tag: ["@spec:010-compliance", "@story:BT-22"] }, () => {
  test("[BT-22-AC1] Geolocation check runs before wallet connection is permitted — geo-blocked users cannot connect", async ({
    page,
  }) => {
    // 451 Unavailable For Legal Reasons triggers the geo-block path in GeoFencingProvider.
    await page.route("**/health", async (route) => {
      await route.fulfill({
        status: 451,
        body: "Unavailable For Legal Reasons",
      });
    });
    await mockHealthyGraphQL(page);
    await mockHealthyRpc(page);

    await page.goto(BASE_URL);

    // The Connect button should be rendered in disabled state with a geo-block tooltip.
    const connectButton = page.getByRole("button", { name: /connect/i });
    await expect(connectButton).toBeVisible({ timeout: 15_000 });
    await expect(connectButton).toBeDisabled();
  });

  test("[BT-22-AC2] Blocked user sees a clear explanation that the service is unavailable in their region", async ({
    page,
  }) => {
    await page.route("**/health", async (route) => {
      await route.fulfill({
        status: 451,
        body: "Unavailable For Legal Reasons",
      });
    });
    await mockHealthyGraphQL(page);
    await mockHealthyRpc(page);

    await page.goto(BASE_URL);

    // The Hint tooltip wrapping the disabled Connect button contains this text.
    await expect(
      page.getByText(/not available in your region/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[BT-22-AC3] Wallet address screening blocks interaction when a connected address is flagged", async ({
    page,
  }) => {
    await injectWalletMocks(page);

    await page.route("**/health", async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });
    await mockHealthyGraphQL(page);
    await mockHealthyRpc(page);

    // Mock the screening API to return a high-risk result for either address.
    await page.route("**/address/screening**", async (route) => {
      const url = route.request().url();
      const isTargetAddress =
        url.includes(MOCK_BTC_ADDRESS) || url.includes(MOCK_ETH_ADDRESS);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            address: { risk: isTargetAddress ? "severe" : "low" },
          },
        }),
      });
    });

    // Seed localStorage so wallet-connector treats the addresses as previously
    // connected.  The screening result fires as soon as the addresses are set.
    await page.addInitScript(
      ({ btcAddress, ethAddress }) => {
        window.localStorage.setItem(
          "address-screening",
          JSON.stringify({
            [btcAddress]: true,
            [ethAddress]: true,
          }),
        );
      },
      { btcAddress: MOCK_BTC_ADDRESS, ethAddress: MOCK_ETH_ADDRESS },
    );

    await page.goto(BASE_URL);

    // When isAddressBlocked=true the Connect component shows "Wallet not eligible".
    await expect(page.getByText(/wallet not eligible/i)).toBeVisible({
      timeout: 15_000,
    });

    // The Connect button itself is disabled.
    const connectButton = page.getByRole("button", { name: /connect/i });
    await expect(connectButton).toBeDisabled();
  });

  test("[BT-22-AC4] Geo-blocking is enforced server-side — the /health endpoint is called on load before wallet connection is allowed", async ({
    page,
  }) => {
    let healthCheckCalled = false;

    await page.route("**/health", async (route) => {
      healthCheckCalled = true;
      await route.fulfill({ status: 200, body: "OK" });
    });
    await mockHealthyGraphQL(page);
    await mockHealthyRpc(page);
    await mockHealthyScreening(page);

    await page.goto(BASE_URL);

    // Wait for the geo-fence check to complete (loading spinner disappears).
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    expect(healthCheckCalled).toBe(true);

    // After a non-blocked health check the Connect button is enabled.
    const connectButton = page.getByRole("button", { name: /connect/i });
    await expect(connectButton).toBeEnabled({ timeout: 10_000 });
  });
});
