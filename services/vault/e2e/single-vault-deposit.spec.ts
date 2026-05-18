/**
 * Single-vault deposit happy path (#1592) - pragmatic UI-flow slice.
 *
 * The full 9-step deposit traverses wallet popups, contract writes,
 * Bitcoin broadcast, VP RPC, and a >400 MB artifact download. Doing
 * each end-to-end through mocks is a multi-PR effort and still
 * verifies UI integration only, not protocol correctness.
 *
 * This spec covers the first slice the rest of the suite needs to
 * build on:
 *   1. Modal opens with deterministic protocol params + Aave config
 *      injected via the new e2e overrides (ProtocolParamsContext +
 *      AaveConfigContext).
 *   2. The provider Select renders the seeded vault providers from
 *      the GraphQL stub - closes the deferred UI work from #1591.
 *   3. Picking a provider populates the Select trigger and changes
 *      after a second pick.
 *
 * Out of scope, will be follow-up tickets (or a single big "real
 * chain harness" effort): clicking "Deposit", driving the 9-step
 * sign sequence, artifact download, on-chain vault-ACTIVE assertion.
 */

import {
  expect,
  installDepositModalBackend,
  mockHealthCheck,
  mockMempoolForSeededBtcWallet,
  preConnectWallets,
  test,
} from "./fixtures";

const VP_ALPHA = {
  id: "0x1111111111111111111111111111111111111111",
  btcPubKey: `0x02${"11".repeat(32)}`,
  name: "VaultProvider Alpha",
};

const VP_BETA = {
  id: "0x2222222222222222222222222222222222222222",
  btcPubKey: `0x02${"22".repeat(32)}`,
  name: "VaultProvider Beta",
};

async function openDepositModal(
  page: import("@playwright/test").Page,
): Promise<void> {
  // Two "Deposit sBTC" buttons render once both wallets are connected:
  // one in the app header, one in the empty-collateral dashboard CTA.
  // Either opens the same modal; scope to the header so the click is
  // deterministic regardless of dashboard content.
  const cta = page
    .getByRole("banner")
    .getByRole("button", { name: /^Deposit (s?BTC)$/i });
  await expect(cta).toBeVisible({ timeout: 15_000 });
  await cta.click();
  // The deposit modal is a FullScreenDialog that renders inline
  // without a stable `role="dialog"`. The "Bitcoin Network Fee" label
  // in the fee breakdown is unique to the deposit form and always
  // present (whether or not the provider list is populated), so it
  // makes a reliable "modal is open" sentinel.
  await expect(
    page.getByText("Bitcoin Network Fee", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
}

async function openProviderDropdown(
  page: import("@playwright/test").Page,
): Promise<void> {
  // core-ui `<Select>` is a div with class `bbn-select`; clicking the
  // placeholder span (it has `title="Select Vault Provider"`) opens
  // the dropdown. Asserting via title rather than role keeps the
  // selector stable when role attributes aren't set.
  await page.getByTitle("Select Vault Provider").click();
}

test("deposit modal lists seeded vault providers in the picker", async ({
  page,
  seededBtcWallet,
  seededEthWallet,
}) => {
  const btc = seededBtcWallet({ amount: 100_000n });
  const eth = seededEthWallet({ balanceWei: 5n * 10n ** 18n });
  await mockHealthCheck(page);
  await mockMempoolForSeededBtcWallet(page, btc);
  await installDepositModalBackend(page, { providers: [VP_ALPHA, VP_BETA] });
  await preConnectWallets(page, { btc, eth });

  await page.goto("/");
  await openDepositModal(page);
  await openProviderDropdown(page);

  await expect(
    page.getByText(VP_ALPHA.name, { exact: false }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(VP_BETA.name, { exact: false }),
  ).toBeVisible();
});

test("picking a vault provider populates the Select trigger with its name", async ({
  page,
  seededBtcWallet,
  seededEthWallet,
}) => {
  const btc = seededBtcWallet({ amount: 100_000n });
  const eth = seededEthWallet({ balanceWei: 5n * 10n ** 18n });
  await mockHealthCheck(page);
  await mockMempoolForSeededBtcWallet(page, btc);
  await installDepositModalBackend(page, { providers: [VP_ALPHA, VP_BETA] });
  await preConnectWallets(page, { btc, eth });

  await page.goto("/");
  await openDepositModal(page);
  await openProviderDropdown(page);
  await page.getByText(VP_BETA.name, { exact: false }).first().click();

  // After selection the placeholder text is gone and the picked
  // provider's name takes its place in the Select trigger.
  await expect(
    page.locator(".bbn-select-text").getByText(VP_BETA.name),
  ).toBeVisible({ timeout: 5_000 });
});

test("empty provider list surfaces the 'No vault providers' message", async ({
  page,
  seededBtcWallet,
  seededEthWallet,
}) => {
  const btc = seededBtcWallet({ amount: 100_000n });
  const eth = seededEthWallet({ balanceWei: 5n * 10n ** 18n });
  await mockHealthCheck(page);
  await mockMempoolForSeededBtcWallet(page, btc);
  await installDepositModalBackend(page, { providers: [] });
  await preConnectWallets(page, { btc, eth });

  await page.goto("/");
  await openDepositModal(page);

  await expect(
    page.getByText(/No vault providers available/i),
  ).toBeVisible({ timeout: 10_000 });
});
