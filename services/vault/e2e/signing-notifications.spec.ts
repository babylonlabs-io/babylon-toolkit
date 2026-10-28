import { expect, test, type Page } from "@playwright/test";
import reactPlugin from "@vitejs/plugin-react";

import { DepositFlowStep } from "../src/hooks/deposit/depositFlowSteps/types";
import type { render } from "./fixtures/signingNotification";

type Step = Parameters<typeof render>[0];
test.use({ channel: "chromium" });
async function setStep(page: Page, step: Step) {
  await page.evaluate(async (value) => {
    const path = "/e2e/fixtures/signingNotification.ts";
    const host = (await import(
      /* @vite-ignore */ path
    )) as typeof import("./fixtures/signingNotification");
    host.render(value);
  }, step);
}
async function setVisibility(page: Page, value: DocumentVisibilityState) {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: state,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
}

test("notifies only for wallet actions with native browser permission", async ({
  page,
  context,
}) => {
  await page.route("**/signing-notifications-test.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><script type="module">${reactPlugin.preambleCode.replace("__BASE__", "/")}</script></head><body></body></html>`,
    }),
  );
  await page.goto("/signing-notifications-test.html");
  await context.grantPermissions(["notifications"], {
    origin: new URL(page.url()).origin,
  });
  await expect
    .poll(() => page.evaluate(() => Notification.permission))
    .toBe("granted");
  await page.evaluate(() => {
    const tags: string[] = [];
    Object.defineProperty(window, "notificationTags", { value: tags });
    window.Notification = new Proxy(window.Notification, {
      get(Target, key) {
        return Reflect.get(Target, key, Target);
      },
      construct(Target, args) {
        const result = Reflect.construct(Target, args) as Notification;
        tags.push(args[1]?.tag);
        result.close();
        return result;
      },
    });
  });
  const tags = () =>
    page.evaluate(
      () =>
        (window as unknown as { notificationTags: string[] }).notificationTags,
    );
  await setVisibility(page, "hidden");

  await setStep(page, [DepositFlowStep.SUBMIT_WOTS_KEYS, true, 0, true]);
  await setStep(page, [DepositFlowStep.SUBMIT_WOTS_KEYS, true, 1, true]);
  expect(await tags()).toHaveLength(0);
  await setStep(page, [DepositFlowStep.SUBMIT_WOTS_KEYS, true, 0, false]);
  await expect.poll(tags).toHaveLength(1);
  await setStep(page, [DepositFlowStep.SUBMIT_WOTS_KEYS, true, 0, false]);
  expect(await tags()).toHaveLength(1);

  for (const index of [0, 1]) {
    await setStep(page, [DepositFlowStep.SIGN_AUTH_ANCHOR, true, index, true]);
    await setStep(page, [DepositFlowStep.SIGN_PAYOUTS, true, index, false]);
    await setStep(page, [
      DepositFlowStep.SIGN_DEPOSITOR_GRAPH,
      true,
      index,
      false,
    ]);
    await expect.poll(tags).toHaveLength(index + 2);
  }
  expect(await tags()).toEqual([
    expect.stringContaining(":wots:0"),
    expect.stringContaining(":payouts:0"),
    expect.stringContaining(":payouts:1"),
  ]);

  await setVisibility(page, "visible");
  await setStep(page, [DepositFlowStep.SIGN_POP, true, null, false]);
  expect(await tags()).toHaveLength(3);
  await context.clearPermissions();
  await context.grantPermissions([], { origin: new URL(page.url()).origin });
  await expect
    .poll(() => page.evaluate(() => Notification.permission))
    .toBe("denied");
  await setVisibility(page, "hidden");
  await setStep(page, [DepositFlowStep.SUBMIT_PEGIN, true, null, false]);
  expect(await tags()).toHaveLength(3);
});
