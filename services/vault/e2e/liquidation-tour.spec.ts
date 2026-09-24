import { expect, test, type Page } from "@playwright/test";

import { installRecordedBackend } from "./fixtures/replay";
import { assertRecordingCovered, blockOffsiteRequests } from "./visual/capture";

const SEEN_KEY = "tbv-liquidation-tour-seen";
const WELCOME_TITLE = "Welcome to Liquidation Analysis";
/**
 * The global reduced-motion reset in core-ui shortens every animation and
 * transition to this length instead of removing it.
 */
const REDUCED_MOTION_RESET_DURATION_MS = 0.01;
const STEPS = [
  ["position", "Position Overview"],
  ["health", "Monitor Your Health Factor"],
  ["simulation", "Simulate BTC Price Changes"],
  ["events", "Understand Liquidation Events"],
  ["outcomes", "Explore Liquidation Outcomes"],
] as const;

async function showAnalysis(page: Page): Promise<void> {
  await page.getByRole("button", { name: "God mode", exact: true }).click();
  await page.getByRole("button", { name: "Liquidations", exact: true }).click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: /pop out/i }).click(),
  ]);
  // Keep the panel open. Its simulator publishes the default cascade.
  await popup.getByRole("button", { name: "Simulated", exact: true }).click();
  await expect(page.getByTestId("liq-candle").first()).toBeVisible();
}

async function expectSpotlight(page: Page, target: string): Promise<void> {
  await expect(async () => {
    const box = await page.locator(`#liquidation-tour-${target}`).boundingBox();
    expect(box).not.toBeNull();
    const rect = page.getByTestId("liquidation-tour-spotlight");
    for (const [attribute, expected] of Object.entries({
      x: box!.x - 8,
      y: box!.y - 8,
      width: box!.width + 16,
      height: box!.height + 16,
    })) {
      expect(
        Math.abs(Number(await rect.getAttribute(attribute)) - expected),
      ).toBeLessThan(2);
    }
  }).toPass();
}

async function expectDismissed(page: Page): Promise<void> {
  await expect(page.getByTestId("liquidation-tour-overlay")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SEEN_KEY))
    .toBe("true");
}

async function expectCardFitsViewport(page: Page): Promise<void> {
  await expect(async () => {
    const box = await page.getByTestId("liquidation-tour-card").boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }).toPass();
}

test.beforeEach(async ({ page }) => {
  await blockOffsiteRequests(page);
  const backend = await installRecordedBackend(page);
  await page.goto("/liquidations", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("liquidation-tour-overlay")).toHaveCount(0);
  await showAnalysis(page);
  await expect(page.getByRole("dialog", { name: WELCOME_TITLE })).toBeVisible();
  assertRecordingCovered(backend, "liquidation tour", ["graphql"]);
});

test("completes five steps and keeps the spotlight aligned on scroll and resize", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Take a tour", exact: true }).click();
  for (const [index, [target, title]] of STEPS.entries()) {
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(`Step ${index + 1} of 5`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Exit", exact: true }),
    ).toHaveCount(2);
    await expectSpotlight(page, target);
    if (index === 2) {
      const targetLocator = page.locator(`#liquidation-tour-${target}`);
      const before = await targetLocator.boundingBox();
      const card = page.getByTestId("liquidation-tour-card");
      const cardBefore = await card.boundingBox();
      await page.evaluate(() => window.scrollBy(0, -60));
      await expect
        .poll(async () => (await targetLocator.boundingBox())?.y)
        .not.toBe(before?.y);
      await expect
        .poll(async () => (await card.boundingBox())?.y)
        .not.toBe(cardBefore?.y);
      await expectSpotlight(page, target);
      await page.setViewportSize({ width: 1100, height: 760 });
      await expectSpotlight(page, target);
    }
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expectDismissed(page);
});

for (const dismissal of ["Not now", "Close", "top Exit", "card Exit"]) {
  test(`saves ${dismissal} across a reload`, async ({ page }) => {
    if (dismissal.endsWith("Exit")) {
      await page
        .getByRole("button", { name: "Take a tour", exact: true })
        .click();
      const exits = page.getByRole("button", { name: "Exit", exact: true });
      await (dismissal === "top Exit" ? exits.first() : exits.last()).click();
    } else {
      await page.getByRole("button", { name: dismissal, exact: true }).click();
    }
    await expectDismissed(page);
    for (const popup of page.context().pages()) {
      if (popup !== page) await popup.close();
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await showAnalysis(page);
    await expectDismissed(page);
  });
}

test("keeps keyboard focus in the tour and exits with Escape", async ({
  page,
}) => {
  let dialog = page.getByRole("dialog", { name: WELCOME_TITLE });
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  const welcomeButtons = dialog.getByRole("button");
  await welcomeButtons.last().focus();
  await page.keyboard.press("Tab");
  await expect(welcomeButtons.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(welcomeButtons.last()).toBeFocused();
  await page
    .getByRole("button", { name: "Take a tour", exact: true })
    .press("Enter");
  dialog = page.getByRole("dialog", { name: STEPS[0][1], exact: true });
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  const buttons = dialog.getByRole("button");
  await expect(
    dialog.getByRole("button", { name: "Next", exact: true }),
  ).toBeVisible();
  await buttons.last().focus();
  await page.keyboard.press("Tab");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expectDismissed(page);
});

test("fits every step on a phone with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Take a tour", exact: true }).click();
  for (const [target, title] of STEPS) {
    await expect(
      page.getByRole("dialog", { name: title, exact: true }),
    ).toBeVisible();
    await expectSpotlight(page, target);
    const card = page.getByTestId("liquidation-tour-card");
    await expectCardFitsViewport(page);
    expect(
      await page.getByTestId("liquidation-tour-overlay").evaluate(
        (element, resetDurationMs) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running")
            .map((animation) => ({
              duration: animation.effect?.getComputedTiming().endTime,
              target: (
                animation.effect as KeyframeEffect | null
              )?.target?.getAttribute("data-testid"),
              property:
                "transitionProperty" in animation
                  ? animation.transitionProperty
                  : animation.id,
            }))
            .filter(
              ({ duration }) =>
                typeof duration !== "number" || duration > resetDurationMs,
            ),
        REDUCED_MOTION_RESET_DURATION_MS,
      ),
    ).toEqual([]);
    if (target === "outcomes") {
      await page.setViewportSize({ width: 844, height: 320 });
      await expectSpotlight(page, target);
      await expectCardFitsViewport(page);
      await expect(page.getByTestId("liquidation-tour-arrow")).toBeHidden();
    }
    await card.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expectDismissed(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
});

test("shows the welcome and first step in dark theme", async ({ page }) => {
  const popup = page
    .context()
    .pages()
    .find((openPage) => openPage !== page)!;
  await popup.getByRole("button", { name: "Global", exact: true }).click();
  await popup.getByRole("button", { name: "dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Take a tour", exact: true }).click();
  await expectSpotlight(page, "position");
});
