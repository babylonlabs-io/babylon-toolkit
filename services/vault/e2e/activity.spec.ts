/**
 * Activity Log — BT-21
 *
 * The /activity route renders a chronological list of every significant event
 * across the user's vaults.  Events are sourced from the indexer (GraphQL) so
 * mocking the response is the cleanest way to assert table content.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setupHealthyInfra } from "./helpers/infra-mock";
import { injectWalletMocks } from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

async function mockActivitiesGraphQL(
  page: Page,
  activities: unknown[],
): Promise<void> {
  await page.route("**/graphql", async (route) => {
    const postData = route.request().postDataJSON() as
      | { query?: string }
      | null;
    const query = postData?.query ?? "";

    if (
      query.includes("activities") ||
      query.includes("Activity") ||
      query.includes("vaultEvents")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            activities: { items: activities },
            vaultEvents: { items: activities },
          },
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

test.describe("Activity Log — BT-21", () => {
  test("[BT-21-AC1] A disconnected user sees the connect-to-view-activity empty state", async ({
    page,
  }) => {
    await setupHealthyInfra(page);

    await page.goto(BASE_URL + "/activity");

    await expect(
      page.getByRole("heading", { name: /^activity$/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/connect your wallet to view your activity/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[BT-21-AC2] A connected user with zero events sees the no-activity-yet empty state", async ({
    page,
  }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
    await mockActivitiesGraphQL(page, []);

    await page.goto(BASE_URL + "/activity");
    await connectWallets(page);

    await expect(
      page.getByText(/no activity yet/i),
    ).toBeVisible({ timeout: 15_000 });

    // The empty state offers a Deposit CTA so the user can get started.
    await expect(
      page.getByRole("button", { name: /deposit/i }),
    ).toBeVisible();
  });

  test("[BT-21-AC3] The Activity heading and the page container render on the /activity route", async ({
    page,
  }) => {
    await setupHealthyInfra(page);

    await page.goto(BASE_URL + "/activity");

    // The Card wrapping the activity content always renders the heading.
    await expect(
      page.getByRole("heading", { name: /^activity$/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
