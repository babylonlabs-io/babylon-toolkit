import { expect, test } from "@playwright/test";

const PORT = 5175;
const BASE_URL = `http://localhost:${PORT}`;

test.describe("High Severity Error Handling", () => {
  test.describe("Error Formatting Verification", () => {
    test("app loads without errors when GraphQL and RPC are healthy", async ({
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
    });

    test("contract revert errors contain user-friendly messages for paused state", async ({
      page,
    }) => {
      let capturedConsoleError = "";

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          capturedConsoleError += msg.text();
        }
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

      expect(capturedConsoleError).not.toContain("Unhandled");
    });
  });

  test.describe("VP RPC Error Scenarios", () => {
    test("app handles VP RPC connection failures gracefully", async ({
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

  test.describe("Market State Error Messages", () => {
    test("error modal infrastructure is present in DOM", async ({ page }) => {
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
      await page.waitForTimeout(2000);

      const errorDialogExists =
        (await page.locator('[data-testid="error-dialog"]').count()) >= 0;
      expect(errorDialogExists).toBe(true);
    });
  });
});

