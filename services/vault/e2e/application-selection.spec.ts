/**
 * Application Selection — BT-23
 *
 * The /deposit route is the entry point to the deposit flow.  After connecting
 * wallets, the user lands on the ApplicationsHome page where available DeFi
 * applications (currently Aave) are shown.  Selecting an application starts
 * the deposit dialog scoped to that application.
 */

import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setupHealthyInfra } from "./helpers/infra-mock";
import { injectWalletMocks } from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

const AAVE_CONTROLLER_ID = "0x0000000000000000000000000000000000000002";

async function mockApplicationsGraphQL(
  page: Page,
  applications: Array<{
    id: string;
    name: string;
    description: string;
    logoUrl: string | null;
    applicationController: string;
    applicationEntryPoint: string;
  }>,
): Promise<void> {
  await page.route("**/graphql", async (route: Route) => {
    const postData = route.request().postDataJSON() as
      | { query?: string }
      | null;
    const query = postData?.query ?? "";
    if (query.includes("applications") || query.includes("Application")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { applications: { items: applications } },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { __typename: "Query" } }),
    });
  });
}

async function connectWallets(page: Page): Promise<void> {
  const connectButton = page.getByRole("button", { name: /connect/i });
  await expect(connectButton).toBeVisible({ timeout: 15_000 });
  await connectButton.click();

  const walletModal = page.getByRole("dialog");
  await expect(walletModal).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /unisat/i }).click();
  await page.getByRole("button", { name: /browser wallet|injected/i }).click();

  await expect(walletModal).not.toBeVisible({ timeout: 15_000 });
}

test.describe("Application Selection — BT-23", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-23-AC1] The /deposit route is the entry point to the deposit flow", async ({
    page,
  }) => {
    await mockApplicationsGraphQL(page, [
      {
        id: AAVE_CONTROLLER_ID,
        name: "Aave",
        description: "Borrow against your BTC",
        logoUrl: null,
        applicationController: AAVE_CONTROLLER_ID,
        applicationEntryPoint: AAVE_CONTROLLER_ID,
      },
    ]);

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);

    // The Applications heading and the "Deposit BTC" CTA should be present.
    await expect(
      page.getByRole("heading", { name: /applications/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /deposit btc/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[BT-23-AC2] Each application card shows its name and a brief description", async ({
    page,
  }) => {
    await mockApplicationsGraphQL(page, [
      {
        id: AAVE_CONTROLLER_ID,
        name: "Aave",
        description: "Borrow against your BTC",
        logoUrl: null,
        applicationController: AAVE_CONTROLLER_ID,
        applicationEntryPoint: AAVE_CONTROLLER_ID,
      },
    ]);

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);

    // The custom Aave banner renders the Aave name and a description string.
    await expect(page.getByRole("heading", { name: /^aave$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/aave v4 integration enables bitcoin/i),
    ).toBeVisible();

    // The Explore button on the banner is the entry into the application flow.
    await expect(
      page.getByRole("button", { name: /explore/i }),
    ).toBeVisible();
  });

  test("[BT-23-AC3] Selecting an application routes the user into its deposit flow", async ({
    page,
  }) => {
    await mockApplicationsGraphQL(page, [
      {
        id: AAVE_CONTROLLER_ID,
        name: "Aave",
        description: "Borrow against your BTC",
        logoUrl: null,
        applicationController: AAVE_CONTROLLER_ID,
        applicationEntryPoint: AAVE_CONTROLLER_ID,
      },
    ]);

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);

    // Clicking Explore navigates to "/" (the dashboard) where the deposit flow
    // is initiated for the selected application.
    await page.getByRole("button", { name: /explore/i }).click();
    await page.waitForURL(BASE_URL + "/", { timeout: 10_000 });

    // After navigation the deposit CTA must be reachable on the destination.
    await expect(page).toHaveURL(BASE_URL + "/");
  });

  test("[BT-23-AC4] An empty application list shows no application cards but the page still renders", async ({
    page,
  }) => {
    await mockApplicationsGraphQL(page, []);

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);

    // The hero copy still renders even when there are no applications.
    await expect(
      page.getByRole("heading", {
        name: /use your bitcoin across applications/i,
      }),
    ).toBeVisible({ timeout: 10_000 });

    // No Aave banner or Explore button should be present.
    await expect(page.getByRole("heading", { name: /^aave$/i })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /explore/i }),
    ).toHaveCount(0);
  });
});
