/**
 * A vault provider link (`?vp=<provider address>`) preselects that provider in
 * the deposit form, and keeps doing so after a reload and in another tab.
 *
 * The journey a unit test cannot walk: the address is read at startup, before
 * the router can drop it, then removed from the address bar, kept in the
 * browser's storage, and found again by every later page load of the same
 * browser. The second test closes the loop from the partner's end: the link
 * copied from the picker is one that preselects their provider for a new
 * visitor.
 *
 * The recording's indexer lists one provider, so what needs a second one is
 * covered by unit tests instead: the pin order (`sortVaultProviders`), an
 * unhealthy provider not being preselected (`useDepositPageForm`), and the
 * referral being cleared by a deposit with another provider
 * (`referredVaultProviderStorage`).
 */

import { expect, test, type Page } from "@playwright/test";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend, type ReplayBackend } from "./fixtures/replay";
import { RECORDED_VAULT_PROVIDER } from "./fixtures/replay/contracts";
import { FLUID_CTA_SELECTOR } from "./real/actions/selectors";
import {
  assertRecordingCovered,
  blockOffsiteRequests,
  recordedPageWallets,
} from "./visual/capture";

/** The recorded provider's address as a partner might paste it: checksummed. */
const CHECKSUMMED_PROVIDER = "0xaf8d9D665f4e27F3966a074DCE5c50684BFBE358";
/** `COPY.deposit.form.selectVaultProvider`: the picker header with nothing selected. */
const SELECT_PROVIDER_LABEL = "Select vault provider";
/** `COPY.nav.vaults`: the sidebar link to the page with the deposit entry. */
const VAULTS_NAV_LABEL = "Vaults";
/** `COPY.deposit.form.providerCopyLinkLabel` for the recorded provider. */
const COPY_LINK_LABEL = `Copy link to deposit with ${RECORDED_VAULT_PROVIDER.NAME}`;
/**
 * Above the deployment's minimum deposit and below the recorded wallet's
 * balance and the two-vault minimum (the window
 * `visual/depositFlow.visual.spec.ts` submits in).
 */
const AMOUNT_TO_SUBMIT_BTC = "0.02";

/** Serve the recorded backend and wallets to `page`, then open `path`. */
async function openPage(page: Page, path: string): Promise<ReplayBackend> {
  const backend = await installRecordedBackend(page);
  await injectPageWallets(page, recordedPageWallets());
  await page.goto(path, { waitUntil: "domcontentloaded" });
  return backend;
}

/** {@link openPage}, then connect the wallets in a browser with no session yet. */
async function openConnected(page: Page, path: string): Promise<ReplayBackend> {
  const backend = await openPage(page, path);
  await connectInjectedWallets(page);
  return backend;
}

/** Open the deposit dialog from the vaults page. */
async function openDepositForm(page: Page) {
  await page.getByTestId("deposit-button").first().click();
  return page.locator(".portal-root");
}

/**
 * The picker header names the selected provider. Exact, because each picker
 * row's accessible name also contains the name, followed by its metrics.
 */
async function expectProviderPreselected(page: Page) {
  const dialog = page.locator(".portal-root");
  await expect(
    dialog.getByRole("button", {
      name: RECORDED_VAULT_PROVIDER.NAME,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: SELECT_PROVIDER_LABEL }),
  ).toHaveCount(0);
}

test("a visitor who lands through a vault provider link finds that provider chosen, after a reload and in a second tab", async ({
  page,
}) => {
  await blockOffsiteRequests(page);
  const backend = await openConnected(
    page,
    `/vaults?vp=${CHECKSUMMED_PROVIDER}&utm_source=partner`,
  );

  // Read at startup and taken out of the address bar; the campaign stays.
  const landed = new URL(page.url());
  expect(landed.pathname).toBe("/vaults");
  expect(landed.searchParams.has("vp")).toBe(false);
  expect(landed.searchParams.get("utm_source")).toBe("partner");

  const dialog = await openDepositForm(page);
  await expectProviderPreselected(page);
  // The end state: no provider was clicked, and the deposit can go ahead.
  await dialog.locator("input").first().fill(AMOUNT_TO_SUBMIT_BTC);
  await expect(dialog.locator(FLUID_CTA_SELECTOR)).toBeEnabled();

  // A reload has no `?vp=` left; the provider comes from storage. The wallet
  // session is restored from storage too, so there is nothing to connect.
  await page.reload({ waitUntil: "domcontentloaded" });
  await openDepositForm(page);
  await expectProviderPreselected(page);
  assertRecordingCovered(backend, "the landing tab");

  // Another tab of the same browser, opened without a link. It shares the
  // first tab's storage, wallet session included.
  const secondTab = await page.context().newPage();
  const secondBackend = await openPage(secondTab, "/vaults");
  await openDepositForm(secondTab);
  await expectProviderPreselected(secondTab);
  assertRecordingCovered(secondBackend, "the second tab");
});

test("a link copied from the picker gives a new visitor the same provider", async ({
  page,
  browser,
}) => {
  await blockOffsiteRequests(page);
  const backend = await openConnected(page, "/vaults");
  const origin = new URL(page.url()).origin;
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin });

  const dialog = await openDepositForm(page);
  await dialog.getByRole("button", { name: SELECT_PROVIDER_LABEL }).click();
  await dialog.getByRole("button", { name: COPY_LINK_LABEL }).click();

  const copiedLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedLink).toBe(
    `${origin}/?vp=${RECORDED_VAULT_PROVIDER.ETH_ADDRESS}`,
  );
  // Copying is not choosing: the header still asks for a provider.
  await expect(
    dialog.getByRole("button", { name: SELECT_PROVIDER_LABEL }),
  ).toBeVisible();
  assertRecordingCovered(backend, "the partner's tab");

  // A new visitor: a browser with nothing stored, opening the copied link.
  const visitorContext = await browser.newContext();
  try {
    const visitor = await visitorContext.newPage();
    await blockOffsiteRequests(visitor);
    const visitorBackend = await openConnected(visitor, copiedLink);
    // The link lands on the overview; the deposit entry is on Vaults.
    expect(new URL(visitor.url()).searchParams.has("vp")).toBe(false);
    await visitor
      .getByRole("link", { name: VAULTS_NAV_LABEL, exact: true })
      .first()
      .click();
    await openDepositForm(visitor);
    await expectProviderPreselected(visitor);
    assertRecordingCovered(visitorBackend, "the visitor's tab");
  } finally {
    await visitorContext.close();
  }
});
