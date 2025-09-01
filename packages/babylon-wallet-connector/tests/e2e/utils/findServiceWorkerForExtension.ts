import { BrowserContext } from "@playwright/test";

/**
 * Finds the service worker for a given browser extension.
 *
 * @param context - The browser context to search within.
 * @param extensionId - The ID of the extension to find the service worker for.
 * @returns A promise that resolves to the service worker if found.
 * @throws An error if the service worker for the extension is not found.
 *
 * This function performs the following steps:
 * 1. Checks if the service worker is already present in the context.
 * 2. Opens the extension's UI to trigger the service worker if not already present.
 * 3. Waits for any new service worker to be registered.
 * 4. Checks again for the service worker.
 */
export async function findServiceWorkerForExtension(context: BrowserContext, extensionId: string) {
  // 1) Check if it’s already there
  let sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  if (sw) {
    return sw;
  }

  // 2) Open the extension’s UI to trigger the service worker
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`).catch(() => {});
  // Some MV3 extensions load the SW on popup. If that’s not enough,
  // you might need to click or do something in the UI.

  // 3) Wait for any new service worker
  await context.waitForEvent("serviceworker");

  // 4) Check again
  sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  if (!sw) {
    throw new Error(`Service worker for extension ${extensionId} was never found`);
  }
  return sw;
}
