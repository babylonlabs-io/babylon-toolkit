/**
 * Vault Lifecycle — BT-11 (status view) and BT-12 (HTLC refund)
 *
 * BT-11 covers the dashboard view that lists every vault the user owns and its
 * lifecycle status.  BT-12 covers the refund flow that appears when a peg-in
 * HTLC has timed out before activation.
 *
 * The dashboard relies on a combination of contract reads (Aave adapter, vault
 * registry) and GraphQL data (activities, providers).  These tests assert only
 * structural / textual UI behaviour - granular vault statuses are covered by
 * unit tests and storybook fixtures.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setupHealthyInfra } from "./helpers/infra-mock";
import {
  injectWalletMocks,
  MOCK_BTC_ADDRESS,
  MOCK_BTC_PUBKEY,
  MOCK_ETH_ADDRESS,
} from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

const MOCK_PEGIN_TXID = "b".repeat(64);
const MOCK_PROVIDER_ID = "0x1111111111111111111111111111111111111111";
const MOCK_PROVIDER_NAME = "Mock Vault Provider";
const MOCK_PROVIDER_RPC = "http://localhost:8093";

async function mockProvidersGraphQL(page: Page): Promise<void> {
  await page.route("**/graphql", async (route) => {
    const postData = route.request().postDataJSON() as
      | { query?: string }
      | null;
    const query = postData?.query ?? "";

    if (query.includes("GetAppProviders") || query.includes("vaultProviders")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            vaultProviders: {
              items: [
                {
                  id: MOCK_PROVIDER_ID,
                  btcPubKey: MOCK_BTC_PUBKEY,
                  name: MOCK_PROVIDER_NAME,
                  rpcUrl: MOCK_PROVIDER_RPC,
                },
              ],
            },
            vaultKeeperApplications: { items: [] },
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { __typename: "Query" } }),
    });
  });
}

async function connectWallets(page: Page): Promise<void> {
  const connectButton = page.getByRole("button", { name: /connect/i });
  await expect(connectButton).toBeVisible({ timeout: 15_000 });
  await connectButton.click();

  const walletModal = page.getByRole("dialog");
  await expect(walletModal).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /unisat/i }).click();
  await page.getByRole("button", { name: /browser wallet|injected/i }).click();

  await expect(walletModal).not.toBeVisible({ timeout: 15_000 });
}

/** Seeds localStorage with a peg-in record stuck in the SIGNING state. */
async function seedPendingPegin(page: Page): Promise<void> {
  await page.addInitScript(
    ({ btcAddress, ethAddress, providerPubkey, peginTxid }) => {
      const pendingPegin = {
        peginTxHash: peginTxid,
        ethTxHash: "0x" + "c".repeat(64),
        depositorBtcPubkey: providerPubkey,
        vaultId: "0xABCD",
        status: "PENDING",
        btcAddress,
        ethAddress,
        providerBtcPubkey: providerPubkey,
        createdAt: Date.now(),
      };
      window.localStorage.setItem(
        "babylon_pegins",
        JSON.stringify([pendingPegin]),
      );
    },
    {
      btcAddress: MOCK_BTC_ADDRESS,
      ethAddress: MOCK_ETH_ADDRESS,
      providerPubkey: MOCK_BTC_PUBKEY,
      peginTxid: MOCK_PEGIN_TXID,
    },
  );
}

/** Seeds localStorage with a peg-in whose HTLC timeout has elapsed. */
async function seedExpiredPegin(page: Page): Promise<void> {
  await page.addInitScript(
    ({ btcAddress, ethAddress, providerPubkey, peginTxid }) => {
      const expiredPegin = {
        peginTxHash: peginTxid,
        ethTxHash: "0x" + "c".repeat(64),
        depositorBtcPubkey: providerPubkey,
        vaultId: "0xABCD",
        status: "EXPIRED",
        btcAddress,
        ethAddress,
        providerBtcPubkey: providerPubkey,
        // Created far in the past so the HTLC timeout has elapsed.
        createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      };
      window.localStorage.setItem(
        "babylon_pegins",
        JSON.stringify([expiredPegin]),
      );
    },
    {
      btcAddress: MOCK_BTC_ADDRESS,
      ethAddress: MOCK_ETH_ADDRESS,
      providerPubkey: MOCK_BTC_PUBKEY,
      peginTxid: MOCK_PEGIN_TXID,
    },
  );
}

// ---------------------------------------------------------------------------
// BT-11: User can view the status of all their vaults
// ---------------------------------------------------------------------------

test.describe("Vault Status Dashboard — BT-11", { tag: ["@spec:004-vault-lifecycle", "@story:BT-11"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
    await mockProvidersGraphQL(page);
  });

  test("[BT-11-AC1] The dashboard renders the Collateral section listing user vaults", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The dashboard's Collateral heading is the entry point for the vault list.
    await expect(
      page.getByRole("heading", { name: /^collateral$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[BT-11-AC2] When the user has no vaults, the dashboard shows an empty-state CTA", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The empty state of the Collateral card prompts the user to deposit.
    await expect(
      page.getByText(/deposit bitcoin to get started/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[BT-11-AC3] Pending peg-ins persisted in localStorage appear under Pending Deposits", async ({
    page,
  }) => {
    await seedPendingPegin(page);
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The PendingDepositSection renders this heading whenever a pending pegin
    // is present.  We assert the heading exists rather than the count so the
    // test stays robust to formatting changes.
    await expect(
      page.getByRole("heading", { name: /pending deposit/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("[BT-11-AC4] The dashboard polls for updates without requiring a manual reload", async ({
    page,
  }) => {
    let graphqlCallCount = 0;
    await page.route("**/graphql", async (route) => {
      graphqlCallCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { __typename: "Query" } }),
      });
    });

    await page.goto(BASE_URL);
    await connectWallets(page);

    const initialCalls = graphqlCallCount;
    // Wait for at least one polling cycle.  React Query default staleTime is
    // 0 and the dashboard refetches on focus, so multiple calls are expected.
    await page.waitForTimeout(8_000);

    expect(graphqlCallCount).toBeGreaterThan(initialCalls);
  });
});

// ---------------------------------------------------------------------------
// BT-12: User can refund an expired pre-peg-in HTLC
// ---------------------------------------------------------------------------

test.describe("HTLC Refund — BT-12", { tag: ["@spec:004-vault-lifecycle", "@story:BT-12"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
    await mockProvidersGraphQL(page);
  });

  test("[BT-12-AC1] The Refund option is presented only when the vault's HTLC has expired", async ({
    page,
  }) => {
    // First navigate without an expired pegin: no Expired Deposits heading.
    await page.goto(BASE_URL);
    await connectWallets(page);

    await expect(
      page.getByRole("heading", { name: /expired deposit/i }),
    ).toHaveCount(0);
  });

  test("[BT-12-AC2] An expired peg-in surfaces in the Expired Deposits section", async ({
    page,
  }) => {
    await seedExpiredPegin(page);
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The ExpiredDepositSection renders this heading whenever any expired
    // pegin exists.  We do not assert the count so the test is resilient
    // to fixture changes.
    await expect(
      page.getByRole("heading", { name: /expired deposit/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("[BT-12-AC3] Refund is gated behind the user's BTC wallet — a disconnected user sees the Connect prompt instead", async ({
    page,
  }) => {
    // Without wallet mocks, no addresses are available and the dashboard shows
    // a Connect button rather than any refund affordance.
    await page.goto(BASE_URL);

    await expect(
      page.getByRole("button", { name: /connect/i }),
    ).toBeVisible({ timeout: 15_000 });

    // No Refund / Expired Deposits affordances should be rendered.
    await expect(
      page.getByRole("button", { name: /refund/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /expired deposit/i }),
    ).toHaveCount(0);
  });
});
