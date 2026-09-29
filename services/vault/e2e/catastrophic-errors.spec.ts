import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  multicall3Abi,
  toFunctionSelector,
} from "viem";

import { SentryInterceptor } from "./helpers/sentry-interceptor";

const PORT_MISSING_ENV = 5173;
const PORT_FULL_ENV = 5175;

async function assertBlockingModal(
  page: Page,
  expectedTitle: string,
  expectedMessagePattern: RegExp,
) {
  const errorTitle = page.getByRole("heading", { name: expectedTitle });
  await expect(errorTitle).toBeVisible({ timeout: 30000 });

  await expect(page.getByText(expectedMessagePattern)).toBeVisible();
  await expect(
    page.getByText(/Please refresh the page or try again later/),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try Again" }),
  ).not.toBeVisible();
}

test.describe("Catastrophic Error Handling", () => {
  test.describe("Missing Environment Configuration", () => {
    test("should show blocking error modal when env vars are missing", async ({
      page,
    }) => {
      await page.goto(`http://localhost:${PORT_MISSING_ENV}/`);

      await assertBlockingModal(
        page,
        "Configuration Error",
        /missing required configuration/i,
      );
    });
  });

  test.describe("GraphQL Endpoint Unreachable", () => {
    let sentryInterceptor: SentryInterceptor;

    test.beforeEach(async ({ page }) => {
      sentryInterceptor = new SentryInterceptor();
      await sentryInterceptor.setup(page);
    });

    test("should show blocking error modal when GraphQL endpoint is unreachable", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        await route.abort("connectionfailed");
      });

      await page.goto(`http://localhost:${PORT_FULL_ENV}/`);

      await assertBlockingModal(
        page,
        "Service Unavailable",
        /Unable to connect to the backend services/i,
      );
    });

    test("should send Sentry event when GraphQL endpoint is unreachable", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        await route.abort("connectionfailed");
      });

      await page.goto(`http://localhost:${PORT_FULL_ENV}/`);
      await sentryInterceptor.waitForEvent(page, { timeout: 15000 });

      const sentryRequests = sentryInterceptor.getRequests();
      expect(sentryRequests.length).toBeGreaterThan(0);
    });
  });

  test.describe("GraphQL Server Error", () => {
    let sentryInterceptor: SentryInterceptor;

    test.beforeEach(async ({ page }) => {
      sentryInterceptor = new SentryInterceptor();
      await sentryInterceptor.setup(page);
    });

    test("should show blocking error modal when GraphQL returns 500", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      });

      await page.goto(`http://localhost:${PORT_FULL_ENV}/`);

      await assertBlockingModal(
        page,
        "Service Unavailable",
        /Unable to connect to the backend services/i,
      );
    });

    test("should send Sentry event when GraphQL returns 500", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      });

      await page.goto(`http://localhost:${PORT_FULL_ENV}/`);
      await sentryInterceptor.waitForEvent(page, { timeout: 15000 });

      const sentryRequests = sentryInterceptor.getRequests();
      expect(sentryRequests.length).toBeGreaterThan(0);
    });
  });

  test.describe("Protocol Paused", () => {
    test("should show the full pause banner when the protocol is paused", async ({
      page,
    }) => {
      await page.route("**/graphql", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { __typename: "Query" } }),
        });
      });

      let pauseReadCount = 0;
      await page.route("http://localhost:9997/rpc", async (route) => {
        const postData = route.request().postDataJSON();
        const data = postData?.params?.[0]?.data;
        if (
          postData?.method !== "eth_call" ||
          data?.slice(0, 10) !==
            toFunctionSelector("aggregate3((address,bool,bytes)[])")
        )
          return route.abort();
        const { functionName, args } = decodeFunctionData({
          abi: multicall3Abi,
          data,
        });
        if (functionName !== "aggregate3") return route.abort();
        const result = args[0].map(({ callData }) => {
          const success = callData === toFunctionSelector("pauseState()");
          if (success) pauseReadCount += 1;
          return {
            success,
            returnData: success
              ? encodeAbiParameters([{ type: "uint8" }], [2])
              : ("0x" as const),
          };
        });
        await route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: postData.id,
            result: encodeFunctionResult({
              abi: multicall3Abi,
              functionName: "aggregate3",
              result,
            }),
          },
        });
      });

      await page.goto(`http://localhost:${PORT_FULL_ENV}/`);

      const banner = page.getByTestId("protocol-status-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute("role", "alert");
      await expect(banner).toContainText("Protocol is fully paused");
      await expect(banner).toContainText("Debt continues accruing interest");
      expect(pauseReadCount).toBeGreaterThan(0);
    });
  });
});
