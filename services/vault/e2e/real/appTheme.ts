/**
 * Force the vault app into dark theme before any action runs. The app uses next-themes
 * (`attribute="class"`, `defaultTheme="light"`), so the live theme is readable as the `dark`/`light`
 * class on <html> — we skip when it's already dark. Otherwise we open the Settings menu (gear) and
 * flip the Theme toggle. The toggle's `aria-pressed` reflects LIGHT mode (its value is `isLightMode`),
 * so we click until <html> reports dark (max two clicks — an idempotent no-op if already there).
 */
import type { Page } from "@playwright/test";

import { THEME_SETUP_TIMEOUT_MS, THEME_TOGGLE_SETTLE_MS } from "./timing";

const MAX_TOGGLE_CLICKS = 2;

export async function ensureDarkTheme(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  const isDark = () =>
    page
      .evaluate(() => document.documentElement.classList.contains("dark"))
      .catch(() => false);

  if (await isDark()) {
    log("App theme already dark");
    return;
  }

  const gear = page.locator('[aria-label="Settings menu"]').first();
  await gear
    .waitFor({ state: "visible", timeout: THEME_SETUP_TIMEOUT_MS })
    .catch(() => {});
  await gear.click({ force: true }).catch(() => {});

  // Only the open Settings menu shows a Toggle; scope to the visible one.
  const toggle = page.locator('button[aria-label="Toggle"]:visible').first();
  await toggle
    .waitFor({ state: "visible", timeout: THEME_SETUP_TIMEOUT_MS })
    .catch(() => {});

  for (let i = 0; i < MAX_TOGGLE_CLICKS && !(await isDark()); i++) {
    await toggle.click({ force: true }).catch(() => {});
    await page.waitForTimeout(THEME_TOGGLE_SETTLE_MS);
  }

  await page.keyboard.press("Escape").catch(() => {}); // close the menu so it can't cover later clicks

  if (await isDark()) log("App theme set to dark");
  else log("WARNING: could not confirm dark app theme");
}
