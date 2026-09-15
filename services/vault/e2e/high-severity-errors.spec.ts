import { expect, test } from "@playwright/test";

import { installRecordedBackend } from "./fixtures/replay";
import { SentryInterceptor } from "./helpers/sentry-interceptor";

test("app loads without error UI or unhandled errors with the recorded backend", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const backend = await installRecordedBackend(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Borrow against native Bitcoin, trustlessly.",
    }),
  ).toBeVisible({ timeout: 30_000 });

  await expect(
    page.getByRole("heading", {
      name: /Configuration Error|Service Unavailable/i,
    }),
  ).not.toBeVisible();
  await expect(
    page.getByText(/Protocol is (soft-paused|fully paused)/),
  ).not.toBeVisible();
  expect(backend.served.graphql).toBeGreaterThan(0);
  expect(backend.served["eth-rpc"]).toBeGreaterThan(0);
  expect(backend.misses).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("shows a failed application configuration query and reports it to Sentry", async ({
  page,
}) => {
  await installRecordedBackend(page);
  const sentry = new SentryInterceptor();
  await sentry.setup(page);
  let failures = 0;
  await page.route("**/graphql", (route) => {
    if (route.request().postDataJSON().query.includes("GetAaveAppConfig")) {
      failures++;
      return route.abort("connectionfailed");
    }
    return route.fallback();
  });

  await page.goto("/vaults");
  await expect(page.getByTestId("app-error-state")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => sentry.hasEventWithMessage(/fetch|network/i))
    .toBe(true);
  expect(failures).toBeGreaterThan(0);
});
