import { expect, test } from "@playwright/test";

test.describe("Catastrophic Error Handling", () => {
  test.describe("Missing Environment Configuration", () => {
    test("should show blocking error modal when env vars are missing", async ({
      page,
    }) => {
      await page.goto("/");

      const errorTitle = page.getByRole("heading", {
        name: "Configuration Error",
      });
      await expect(errorTitle).toBeVisible({ timeout: 30000 });

      await expect(
        page.getByText(/missing required configuration/i),
      ).toBeVisible();

      await expect(
        page.getByText(/Please refresh the page or try again later/),
      ).toBeVisible();

      const cancelButton = page.getByRole("button", { name: "Cancel" });
      await expect(cancelButton).not.toBeVisible();

      const doneButton = page.getByRole("button", { name: "Done" });
      await expect(doneButton).not.toBeVisible();

      const tryAgainButton = page.getByRole("button", {
        name: "Try Again",
      });
      await expect(tryAgainButton).not.toBeVisible();
    });
  });
});
