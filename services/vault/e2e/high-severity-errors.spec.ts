import { expect, test } from "@playwright/test";

import { installRecordedBackend } from "./fixtures/replay";

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
    page.getByRole("heading", { name: /Configuration Error|Service Unavailable/i }),
  ).not.toBeVisible();
  await expect(
    page.getByText(/Protocol is (soft-paused|fully paused)/),
  ).not.toBeVisible();
  expect(backend.served.graphql).toBeGreaterThan(0);
  expect(backend.served["eth-rpc"]).toBeGreaterThan(0);
  expect(backend.misses).toEqual([]);
  expect(pageErrors).toEqual([]);
});
