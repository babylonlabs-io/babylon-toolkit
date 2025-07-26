import { Page } from "@playwright/test";

export const fillInputsByName = async (page: Page, inputs: Record<string, string>) => {
  for (const [name, value] of Object.entries(inputs)) {
    await page.locator(`input[name="${name}"]`).click();
    await page.locator(`input[name="${name}"]`).fill(value);
  }
};

export const fillInputsByPlaceholder = async (page: Page, inputs: Record<string, string>) => {
  for (const [placeholder, value] of Object.entries(inputs)) {
    await page.getByPlaceholder(placeholder).click();
    await page.getByPlaceholder(placeholder).fill(value);
  }
};
