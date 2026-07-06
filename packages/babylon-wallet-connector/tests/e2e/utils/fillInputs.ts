import { Page } from "@playwright/test";

export const fillInputsByName = async (page: Page, inputs: Record<string, string>) => {
  for (const [name, value] of Object.entries(inputs)) {
    await page.locator(`input[name="${name}"]`).click();
    await page.locator(`input[name="${name}"]`).fill(value);
  }
};
