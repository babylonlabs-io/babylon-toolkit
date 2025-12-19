import { expect, test } from "@playwright/test";

import { SentryInterceptor } from "./helpers/sentry-interceptor";

const PORT = 5175;
const BASE_URL = `http://localhost:${PORT}`;

test.describe("High Severity Error Handling", () => {
  test.describe("Baseline Health Check", () => {
    test("app loads without error modals when GraphQL and RPC are healthy", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { __typename: "Query" } }),
        });
      });

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();

        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data || "";

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

      await page.goto(`${BASE_URL}/`);

      await expect(
        page.getByRole("heading", { name: /Configuration Error/i }),
      ).not.toBeVisible({ timeout: 10000 });
      await expect(
        page.getByRole("heading", { name: /Service Unavailable/i }),
      ).not.toBeVisible();
      await expect(
        page.getByRole("heading", { name: /Application Paused/i }),
      ).not.toBeVisible();
      await expect(
        page.getByText(/Failed to load applications/i),
      ).not.toBeVisible();
    });

    test("app does not throw unhandled errors on healthy load", async ({
      page,
    }) => {
      let hasUnhandledError = false;

      page.on("pageerror", () => {
        hasUnhandledError = true;
      });

      await page.route("**/graphql", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { __typename: "Query" } }),
        });
      });

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();

        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data || "";

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

      await page.goto(`${BASE_URL}/`);
      await page.waitForTimeout(3000);

      expect(hasUnhandledError).toBe(false);
    });
  });

  test.describe("Data Fetch Errors", () => {
    let sentryInterceptor: SentryInterceptor;

    test.beforeEach(async ({ page }) => {
      sentryInterceptor = new SentryInterceptor();
      await sentryInterceptor.setup(page);
    });

    test("should show error UI when applications query fails", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        const postData = route.request().postDataJSON();
        const query = postData?.query || "";

        if (query.includes("applications")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              errors: [{ message: "Failed to fetch applications" }],
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

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();

        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data || "";
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

      await page.goto(`${BASE_URL}/`);

      const errorText = page.getByText(/Failed to load applications/i);
      await expect(errorText).toBeVisible({ timeout: 15000 });

      const tryAgainButton = page.getByRole("button", { name: /Try Again/i });
      await expect(tryAgainButton).toBeVisible();
    });

    test("should send Sentry event when applications query fails", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        const postData = route.request().postDataJSON();
        const query = postData?.query || "";

        if (query.includes("applications")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              errors: [{ message: "Failed to fetch applications" }],
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

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();

        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data || "";
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

      await page.goto(`${BASE_URL}/`);
      await sentryInterceptor.waitForEvent(page, { timeout: 15000 });

      const sentryRequests = sentryInterceptor.getRequests();
      expect(sentryRequests.length).toBeGreaterThan(0);
    });

    test("should show error UI when morpho markets query fails", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        const postData = route.request().postDataJSON();
        const query = postData?.query || "";

        if (query.includes("morphoMarkets")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              errors: [{ message: "Failed to fetch markets" }],
            }),
          });
          return;
        }

        if (query.includes("applications")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                applications: {
                  items: [
                    {
                      id: "0x0000000000000000000000000000000000000002",
                      name: "Morpho",
                      registeredAt: "2024-01-01",
                      blockNumber: "1000000",
                      transactionHash: "0x123",
                    },
                  ],
                },
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

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();

        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data || "";
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

      await page.goto(`${BASE_URL}/`);

      const errorText = page.getByText(/Failed to load applications/i);
      await expect(errorText).toBeVisible({ timeout: 15000 });
    });

    test("should show error UI on market detail page when market data fails", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        const postData = route.request().postDataJSON();
        const query = postData?.query || "";

        if (query.includes("morphoMarket")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              errors: [{ message: "Market not found" }],
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

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();

        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data || "";
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

      await page.goto(
        `${BASE_URL}/app/morpho/market/0x1234567890123456789012345678901234567890123456789012345678901234`,
      );

      const errorText = page.getByText(/Failed to load market data/i);
      await expect(errorText).toBeVisible({ timeout: 15000 });

      const tryAgainButton = page.getByRole("button", { name: /Try Again/i });
      await expect(tryAgainButton).toBeVisible();

      const goBackButton = page.getByRole("button", { name: /Go Back/i });
      await expect(goBackButton).toBeVisible();
    });

    test("should send Sentry event when market data fails on detail page", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        const postData = route.request().postDataJSON();
        const query = postData?.query || "";

        if (query.includes("morphoMarket")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              errors: [{ message: "Market not found" }],
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

      await page.route(/.*eth.*|.*rpc.*/, async (route) => {
        const postData = route.request().postDataJSON();

        if (postData?.method === "eth_call") {
          const data = postData.params?.[0]?.data || "";
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

      await page.goto(
        `${BASE_URL}/app/morpho/market/0x1234567890123456789012345678901234567890123456789012345678901234`,
      );
      await sentryInterceptor.waitForEvent(page, { timeout: 15000 });

      const sentryRequests = sentryInterceptor.getRequests();
      expect(sentryRequests.length).toBeGreaterThan(0);
    });
  });
});
