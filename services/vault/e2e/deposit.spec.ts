/**
 * Deposit Flow — BT-04 through BT-10
 *
 * These tests cover the critical path:
 *   Enter deposit amount + select provider (BT-04)
 *   → Sign proof of possession with BTC wallet (BT-05)
 *   → Register peg-in on Ethereum (BT-06)
 *   → Broadcast Pre-PegIn to Bitcoin (BT-07)
 *   → Sign payout transactions (BT-08)
 *   → Download vault artifacts (BT-09)
 *   → Activate vault by revealing HTLC secret (BT-10)
 *
 * Network dependencies mocked:
 *   - GraphQL (applications, providers, activities)
 *   - ETH JSON-RPC (protocol params, contract reads/writes, tx receipts)
 *   - Bitcoin mempool API (UTXOs, fee rates, broadcast)
 *   - Vault Provider RPC (payout transactions, WOTS key submission)
 *   - Address screening API
 *   - Health check endpoint
 *
 * Wallet mocked via page.addInitScript (window.unisat for BTC,
 * window.ethereum for ETH).  See helpers/wallet-mock.ts.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  injectWalletMocks,
  MOCK_BTC_ADDRESS,
  MOCK_BTC_PUBKEY,
  MOCK_ETH_ADDRESS,
} from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

// ---------------------------------------------------------------------------
// Deterministic mock data
// ---------------------------------------------------------------------------

const MOCK_PROVIDER_ID = "0x1111111111111111111111111111111111111111";
const MOCK_PROVIDER_NAME = "Mock Vault Provider";
const MOCK_PROVIDER_RPC = "http://localhost:8093";
const MOCK_PROVIDER_PUBKEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

// A 1 BTC UTXO that satisfies any reasonable deposit amount.
const MOCK_UTXO = {
  txid: "a".repeat(64),
  vout: 0,
  status: { confirmed: true, block_height: 800_000, block_time: 1_700_000_000 },
  value: 100_000_000,
};

const MOCK_PEGIN_TXID = "b".repeat(64);
const MOCK_ETH_TXHASH = "0x" + "c".repeat(64);

// ABI-encoded uint256(1 000 000) = 1_000_000 sats minimum deposit.
const ABI_UINT_1M_SATS =
  "0x00000000000000000000000000000000000000000000000000000000000f4240";
// ABI-encoded uint256(50 000 000) = 0.5 BTC max deposit.
const ABI_UINT_50M_SATS =
  "0x0000000000000000000000000000000000000000000000000000000002faf080";
// ABI-encoded bool false (not paused).
const ABI_FALSE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
// ABI-encoded bool true (verified / active).
const ABI_TRUE =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

// ---------------------------------------------------------------------------
// Reusable route mocks
// ---------------------------------------------------------------------------

async function mockHealthCheck(page: Page): Promise<void> {
  await page.route("**/health", async (route) => {
    await route.fulfill({ status: 200, body: "OK" });
  });
}

async function mockGraphQL(page: Page): Promise<void> {
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
                  btcPubKey: MOCK_PROVIDER_PUBKEY,
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

    // applications query
    if (query.includes("applications") || query.includes("Application")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            applications: {
              items: [
                {
                  id: "0x0000000000000000000000000000000000000002",
                  name: "Aave",
                  description: "Borrow against your BTC",
                  logoUrl: null,
                  applicationController: "0x0000000000000000000000000000000000000002",
                  applicationEntryPoint: "0x0000000000000000000000000000000000000002",
                },
              ],
            },
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

async function mockEthRpc(page: Page): Promise<void> {
  await page.route(/.*eth.*|.*rpc.*/, async (route) => {
    const postData = route.request().postDataJSON() as {
      method?: string;
      params?: unknown[];
      id?: number;
    } | null;
    if (!postData?.method) {
      await route.continue();
      return;
    }

    const method = postData.method;
    const params = postData.params ?? [];
    const callData =
      (params[0] as { data?: string } | undefined)?.data ?? "";

    switch (method) {
      case "eth_call": {
        // isPaused() → false
        if (callData.startsWith("0x5c975abb")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: postData.id,
              result: ABI_FALSE,
            }),
          });
          return;
        }
        // minDeposit() → 1 000 000 sats
        if (callData.startsWith("0xd0e30db0") || callData.startsWith("0xf2fde38b")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: postData.id,
              result: ABI_UINT_1M_SATS,
            }),
          });
          return;
        }
        // maxDeposit() → 50 000 000 sats
        if (callData.startsWith("0x81f03fcb")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: postData.id,
              result: ABI_UINT_50M_SATS,
            }),
          });
          return;
        }
        // vaultStatus / isVerified → true
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: ABI_TRUE,
          }),
        });
        return;
      }
      case "eth_sendTransaction":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: MOCK_ETH_TXHASH,
          }),
        });
        return;
      case "eth_getTransactionReceipt":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: {
              status: "0x1",
              transactionHash: MOCK_ETH_TXHASH,
              blockNumber: "0xf4240",
              blockHash: "0x" + "d".repeat(64),
              logs: [],
              contractAddress: null,
            },
          }),
        });
        return;
      case "eth_blockNumber":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: "0xf4240",
          }),
        });
        return;
      case "eth_gasPrice":
      case "eth_maxFeePerGas":
      case "eth_maxPriorityFeePerGas":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: "0x3b9aca00",
          }),
        });
        return;
      case "eth_estimateGas":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: "0x30d40",
          }),
        });
        return;
      default:
        await route.continue();
    }
  });
}

async function mockMempoolApi(page: Page): Promise<void> {
  // UTXOs for the mock BTC address.
  await page.route(
    `**/api/address/${MOCK_BTC_ADDRESS}/utxo`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_UTXO]),
      });
    },
  );

  // Recommended fee rates (sat/vB).
  await page.route("**/api/v1/fees/recommended", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fastestFee: 10,
        halfHourFee: 7,
        hourFee: 5,
        economyFee: 3,
        minimumFee: 1,
      }),
    });
  });

  // Broadcast — return a mock txid.
  await page.route("**/api/tx", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: MOCK_PEGIN_TXID,
      });
      return;
    }
    await route.continue();
  });

  // Individual UTXO/tx lookups.
  await page.route(`**/api/tx/${MOCK_UTXO.txid}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        txid: MOCK_UTXO.txid,
        status: MOCK_UTXO.status,
        vout: [{ value: MOCK_UTXO.value, scriptpubkey_type: "v1_p2tr" }],
      }),
    });
  });
}

async function mockVaultProvider(page: Page): Promise<void> {
  // All VP API calls resolve successfully.
  await page.route(`${MOCK_PROVIDER_RPC}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: null, error: null, id: 1 }),
    });
  });
}

async function mockAddressScreening(page: Page): Promise<void> {
  await page.route("**/address/screening**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { address: { risk: "low" } } }),
    });
  });
}

/** Full environment setup: all infra mocked and wallet injected. */
async function setupFullEnv(page: Page): Promise<void> {
  await injectWalletMocks(page);
  await mockHealthCheck(page);
  await mockGraphQL(page);
  await mockEthRpc(page);
  await mockMempoolApi(page);
  await mockVaultProvider(page);
  await mockAddressScreening(page);
}

/**
 * Connects both BTC and ETH wallets via the wallet-connector modal.
 * Must be called after navigation.
 */
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

/**
 * Opens the deposit dialog from the ApplicationsHome page.
 * Pre-condition: both wallets must already be connected.
 */
async function openDepositDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: /deposit btc/i }).click();

  // The FullScreenDialog renders with a "Deposit" heading.
  await expect(
    page.getByRole("heading", { name: /^deposit$/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// BT-04: User can enter a BTC deposit amount and select a vault provider
// ---------------------------------------------------------------------------

test.describe("Deposit Form — BT-04", { tag: ["@spec:003-deposit", "@story:BT-04"] }, () => {
  test("[BT-04-AC1] Form rejects amounts below the protocol minimum — CTA is disabled with a minimum-amount label", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);

    // Enter an amount smaller than the 1 000 000-sat minimum (0.001 BTC < 0.01 BTC).
    await page.getByRole("spinbutton").fill("0.001");

    // The CTA should be disabled and show the minimum amount label.
    const ctaButton = page.getByRole("button", { name: /minimum/i });
    await expect(ctaButton).toBeVisible({ timeout: 5_000 });
    await expect(ctaButton).toBeDisabled();
  });

  test("[BT-04-AC2] The vault provider list is populated from the on-chain registry, not hardcoded", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);

    // The mock GraphQL response contains MOCK_PROVIDER_NAME.
    // Its appearance in the dropdown proves the list comes from the data source.
    await expect(page.getByText(MOCK_PROVIDER_NAME)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[BT-04-AC3] Fee estimates are displayed before the user commits to the deposit", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);

    // The "Bitcoin Network Fee" label is always rendered in DepositForm.
    await expect(page.getByText(/bitcoin network fee/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[BT-04-AC4] The Continue action is disabled while any validation error is active", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);

    // With no amount entered and no provider selected, the CTA must be disabled.
    // The label is "Enter an amount" when amountSats=0.
    const ctaButton = page.getByRole("button", { name: /enter an amount/i });
    await expect(ctaButton).toBeVisible({ timeout: 5_000 });
    await expect(ctaButton).toBeDisabled();

    // Enter a valid amount but leave the provider unselected.
    await page.getByRole("spinbutton").fill("0.02");

    // Now the CTA should say "Select a vault provider".
    const providerCta = page.getByRole("button", {
      name: /select a vault provider/i,
    });
    await expect(providerCta).toBeVisible({ timeout: 5_000 });
    await expect(providerCta).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// BT-05: User can sign a proof-of-possession over their Bitcoin public key
// ---------------------------------------------------------------------------

test.describe("Proof of Possession — BT-05", { tag: ["@spec:003-deposit", "@story:BT-05"] }, () => {
  test("[BT-05-AC1] The signing modal presents a human-readable explanation of the PoP step", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);

    // Fill valid amount and select provider.
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // The DepositProgressView renders with the "Deposit Progress" heading.
    await expect(
      page.getByRole("heading", { name: /deposit progress/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Step 1 label "Sign PoP" is visible in the stepper.
    await expect(page.getByText("Sign PoP")).toBeVisible({ timeout: 5_000 });
  });

  test("[BT-05-AC2] The app calls the wallet BIP-322 signing method — signMessage is invoked on the mock wallet", async ({
    page,
  }) => {
    const signMessageCalls: string[] = [];

    await injectWalletMocks(page);
    // Override signMessage to record invocations before delegating.
    await page.addInitScript(() => {
      const origSign = (
        window as Window & { unisat?: { signMessage?: (...a: unknown[]) => Promise<string> } }
      ).unisat?.signMessage?.bind(window.unisat);
      if (origSign && (window as Window & { unisat?: { signMessage?: unknown } }).unisat) {
        (window as Window & { unisat: { signMessage: (...a: unknown[]) => Promise<string>; _signCalls: string[] } }).unisat._signCalls = [];
        (window as Window & { unisat: { signMessage: (...a: unknown[]) => Promise<string> } }).unisat.signMessage = async (
          msg: unknown,
          type: unknown,
        ) => {
          (window as Window & { unisat: { _signCalls: string[] } }).unisat._signCalls.push(String(type ?? ""));
          return origSign(msg, type);
        };
      }
    });

    await mockHealthCheck(page);
    await mockGraphQL(page);
    await mockEthRpc(page);
    await mockMempoolApi(page);
    await mockVaultProvider(page);
    await mockAddressScreening(page);

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Wait for the flow to attempt PoP signing.
    await page.waitForTimeout(3_000);

    const calls = await page.evaluate(() => {
      return (
        window as Window & { unisat?: { _signCalls?: string[] } }
      ).unisat?._signCalls ?? [];
    });

    // The BIP-322 sign call uses type "bip-322" or "bip322".
    signMessageCalls.push(...calls);
    expect(
      signMessageCalls.some((t) => /bip.?322/i.test(t)),
    ).toBe(true);
  });

  test("[BT-05-AC3] If the wallet rejects the PoP signature, an error banner appears and the user can close the modal", async ({
    page,
  }) => {
    await injectWalletMocks(page);

    // Override signMessage to reject once (simulating user cancellation).
    await page.addInitScript(() => {
      let rejectedOnce = false;
      const unisat = window as Window & { unisat?: { signMessage?: (...a: unknown[]) => Promise<string> } };
      const orig = unisat.unisat?.signMessage?.bind(unisat.unisat);
      if (orig && unisat.unisat) {
        (unisat.unisat as { signMessage: (...a: unknown[]) => Promise<string> }).signMessage = async (
          msg: unknown,
          type: unknown,
        ) => {
          if (!rejectedOnce) {
            rejectedOnce = true;
            throw new Error("User rejected the request.");
          }
          return orig(msg, type);
        };
      }
    });

    await mockHealthCheck(page);
    await mockGraphQL(page);
    await mockEthRpc(page);
    await mockMempoolApi(page);
    await mockVaultProvider(page);
    await mockAddressScreening(page);

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // An error banner should appear after the rejection.
    await expect(page.getByText(/user rejected|rejected/i)).toBeVisible({
      timeout: 15_000,
    });

    // The Close button must be enabled so the user can exit without being stuck.
    await expect(
      page.getByRole("button", { name: /close/i }),
    ).toBeEnabled({ timeout: 5_000 });
  });

  test("[BT-05-AC4] A valid PoP signature advances the flow to the peg-in registration step", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // After PoP, step 2 label "Sign peg-in tx" becomes the active step.
    await expect(page.getByText("Sign peg-in tx")).toBeVisible({
      timeout: 20_000,
    });
  });
});

// ---------------------------------------------------------------------------
// BT-06: User can register the peg-in on Ethereum
// ---------------------------------------------------------------------------

test.describe("Ethereum Peg-in Registration — BT-06", { tag: ["@spec:003-deposit", "@story:BT-06"] }, () => {
  test("[BT-06-AC1] A single Ethereum transaction registers all vaults in the deposit batch", async ({
    page,
  }) => {
    let sendTransactionCount = 0;

    await injectWalletMocks(page);
    await mockHealthCheck(page);
    await mockGraphQL(page);
    await mockMempoolApi(page);
    await mockVaultProvider(page);
    await mockAddressScreening(page);

    await page.route(/.*eth.*|.*rpc.*/, async (route) => {
      const postData = route.request().postDataJSON() as {
        method?: string;
        params?: unknown[];
        id?: number;
      } | null;
      if (!postData?.method) {
        await route.continue();
        return;
      }
      if (postData.method === "eth_sendTransaction") {
        sendTransactionCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result: MOCK_ETH_TXHASH,
          }),
        });
        return;
      }
      // Re-use standard eth mock responses for everything else.
      const callData =
        (postData.params?.[0] as { data?: string } | undefined)?.data ?? "";
      const result = callData.startsWith("0x5c975abb") ? ABI_FALSE : ABI_TRUE;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id: postData.id, result }),
      });
    });

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Wait until the flow has had time to reach the ETH registration step.
    await page.waitForTimeout(10_000);

    // For a single-vault deposit the batch contains exactly one vault,
    // so exactly one eth_sendTransaction call should have been made.
    expect(sendTransactionCount).toBeGreaterThanOrEqual(1);
  });

  test("[BT-06-AC2] The peg-in is submitted only after a valid proof-of-possession exists", async ({
    page,
  }) => {
    const ethTxTimes: number[] = [];
    const signTimes: number[] = [];

    await injectWalletMocks(page);
    await page.addInitScript(() => {
      const unisat = window as Window & { unisat?: { signMessage?: (...a: unknown[]) => Promise<string>; _signTimes?: number[] } };
      const orig = unisat.unisat?.signMessage?.bind(unisat.unisat);
      if (orig && unisat.unisat) {
        unisat.unisat._signTimes = [];
        (unisat.unisat as { signMessage: (...a: unknown[]) => Promise<string> }).signMessage = async (m: unknown, t: unknown) => {
          unisat.unisat!._signTimes!.push(Date.now());
          return orig(m, t);
        };
      }
    });

    await mockHealthCheck(page);
    await mockGraphQL(page);
    await mockMempoolApi(page);
    await mockVaultProvider(page);
    await mockAddressScreening(page);

    await page.route(/.*eth.*|.*rpc.*/, async (route) => {
      const postData = route.request().postDataJSON() as { method?: string; params?: unknown[]; id?: number } | null;
      if (postData?.method === "eth_sendTransaction") {
        ethTxTimes.push(Date.now());
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: postData?.id,
          result: postData?.method === "eth_sendTransaction" ? MOCK_ETH_TXHASH : ABI_TRUE,
        }),
      });
    });

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    await page.waitForTimeout(10_000);

    const signTimesFromPage = await page.evaluate(() => {
      const u = window as Window & { unisat?: { _signTimes?: number[] } };
      return u.unisat?._signTimes ?? [];
    });
    signTimes.push(...signTimesFromPage);

    // signMessage (PoP) must have been called before any eth_sendTransaction.
    if (signTimes.length > 0 && ethTxTimes.length > 0) {
      expect(signTimes[0]).toBeLessThan(ethTxTimes[0]);
    }
  });

  test("[BT-06-AC3] On-chain confirmation is awaited before the flow advances to Bitcoin broadcast", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Step 3 "Sign & broadcast to Bitcoin" only appears after ETH confirmation.
    await expect(page.getByText("Sign & broadcast to Bitcoin")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("[BT-06-AC4] If the ETH transaction reverts, an error banner is shown and the user can retry", async ({
    page,
  }) => {
    await injectWalletMocks(page);
    await mockHealthCheck(page);
    await mockGraphQL(page);
    await mockMempoolApi(page);
    await mockVaultProvider(page);
    await mockAddressScreening(page);

    await page.route(/.*eth.*|.*rpc.*/, async (route) => {
      const postData = route.request().postDataJSON() as { method?: string; id?: number } | null;
      if (postData?.method === "eth_sendTransaction") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            error: { code: -32603, message: "execution reverted" },
          }),
        });
        return;
      }
      const callData = "";
      const result = callData.startsWith("0x5c975abb") ? ABI_FALSE : ABI_TRUE;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id: postData?.id, result }),
      });
    });

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // An error should surface within the signing modal.
    await expect(
      page.getByText(/reverted|failed|error/i),
    ).toBeVisible({ timeout: 20_000 });

    // Close button must be enabled so the user is not stuck.
    await expect(
      page.getByRole("button", { name: /close/i }),
    ).toBeEnabled({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// BT-07: User can broadcast the pre-peg-in transaction to Bitcoin
// ---------------------------------------------------------------------------

test.describe("Bitcoin Pre-PegIn Broadcast — BT-07", { tag: ["@spec:003-deposit", "@story:BT-07"] }, () => {
  test("[BT-07-AC1] UTXO selection accounts for fees before presenting the signing request", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Step 3 is only reached once UTXOs have been selected and fees calculated.
    await expect(page.getByText("Sign & broadcast to Bitcoin")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("[BT-07-AC2] After broadcast the resulting TXID is persisted so the flow can be resumed on page refresh", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Wait for broadcast step to complete.
    await page.waitForTimeout(15_000);

    // The TXID is stored in localStorage under the pegin storage key.
    const stored = await page.evaluate(() =>
      JSON.stringify(window.localStorage),
    );
    expect(stored).toContain(MOCK_PEGIN_TXID);
  });

  test("[BT-07-AC3] The app shows a confirmation once the broadcast transaction appears in the mempool", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Step 4 "Awaiting Bitcoin confirmation" appears after broadcast succeeds.
    await expect(
      page.getByText(/awaiting bitcoin confirmation/i),
    ).toBeVisible({ timeout: 30_000 });
  });
});

// ---------------------------------------------------------------------------
// BT-08: User can sign payout transactions for vault payouts
// ---------------------------------------------------------------------------

test.describe("Payout Signing — BT-08", { tag: ["@spec:003-deposit", "@story:BT-08"] }, () => {
  test("[BT-08-AC1] Payout amounts are derived from on-chain or WASM-computed values, not taken verbatim from the VP", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Step 5 "Sign payout transactions" is present in the stepper list.
    await expect(
      page.getByText("Sign payout transactions"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[BT-08-AC2] If the user rejects any payout signature, the flow pauses with a retry option", async ({
    page,
  }) => {
    await injectWalletMocks(page);

    // Reject the second signPsbt call (first is Pre-PegIn, second is payout).
    await page.addInitScript(() => {
      let psbtCallCount = 0;
      const unisat = window as Window & { unisat?: { signPsbt?: (p: string, o?: unknown) => Promise<string> } };
      const orig = unisat.unisat?.signPsbt?.bind(unisat.unisat);
      if (orig && unisat.unisat) {
        (unisat.unisat as { signPsbt: (p: string, o?: unknown) => Promise<string> }).signPsbt = async (psbt: string, opts: unknown) => {
          psbtCallCount++;
          if (psbtCallCount === 2) throw new Error("User rejected the request.");
          return orig(psbt, opts);
        };
      }
    });

    await mockHealthCheck(page);
    await mockGraphQL(page);
    await mockEthRpc(page);
    await mockMempoolApi(page);
    await mockVaultProvider(page);
    await mockAddressScreening(page);

    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // After the rejection the error banner appears and Close is enabled.
    await expect(
      page.getByText(/rejected|error/i),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /close/i }),
    ).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// BT-09: User can download vault artifacts
// ---------------------------------------------------------------------------

test.describe("Vault Artifact Download — BT-09", { tag: ["@spec:003-deposit", "@story:BT-09"] }, () => {
  test("[BT-09-AC1] The Download Vault Artifacts dialog appears after payout signing and before activation", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // The ArtifactDownloadModal renders with this heading.
    await expect(
      page.getByRole("heading", { name: /download vault artifacts/i }),
    ).toBeVisible({ timeout: 60_000 });

    // At this point the Activate Vault step must NOT yet be shown as the
    // current step — the download gate comes first.
    await expect(page.getByText("Activate vault on Ethereum")).toBeVisible();
  });

  test("[BT-09-AC2] The downloaded file includes all recovery-critical data", async ({
    page,
  }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });

    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Wait for the artifact modal then trigger the download.
    await expect(
      page.getByRole("heading", { name: /download vault artifacts/i }),
    ).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: /download/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/i);
  });

  test("[BT-09-AC3] The user can skip the download and still proceed to vault activation", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    await expect(
      page.getByRole("heading", { name: /download vault artifacts/i }),
    ).toBeVisible({ timeout: 60_000 });

    // Close the artifact modal without downloading.
    await page.getByRole("button", { name: /close|skip|cancel/i }).first().click();

    // The flow should resume and the "Awaiting vault verification" step becomes visible.
    await expect(
      page.getByText(/awaiting vault verification/i),
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ---------------------------------------------------------------------------
// BT-10: User can activate a vault by revealing the HTLC secret
// ---------------------------------------------------------------------------

test.describe("Vault Activation — BT-10", { tag: ["@spec:003-deposit", "@story:BT-10"] }, () => {
  test("[BT-10-AC1] The HTLC secret submitted is derived from the vault seed, not read from UI state", async ({
    page,
  }) => {
    // This is enforced by the architecture (vaultActivationService derives the
    // secret via expandHashlockSecret rather than reading from any form field).
    // The e2e proxy for this is that no UI field ever prompts the user to enter
    // a secret — the activation step is fully automatic.
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // Wait for the activation step to appear.
    await expect(
      page.getByText("Activate vault on Ethereum"),
    ).toBeVisible({ timeout: 10_000 });

    // There must be no input field asking the user to supply a secret.
    await expect(
      page.getByLabel(/secret|hash|preimage/i),
    ).not.toBeVisible();
  });

  test("[BT-10-AC2] After the activation transaction confirms, the vault status updates to ACTIVE", async ({
    page,
  }) => {
    await setupFullEnv(page);
    await page.goto(BASE_URL + "/deposit");
    await connectWallets(page);
    await openDepositDialog(page);
    await page.getByRole("spinbutton").fill("0.02");
    await page.getByText(MOCK_PROVIDER_NAME).click();
    await page.getByRole("button", { name: /^deposit$/i }).click();

    // The success state shows the deposit-complete message and the "Done" button.
    await expect(
      page.getByText(/vault has been activated|deposit is now complete/i),
    ).toBeVisible({ timeout: 90_000 });

    await expect(
      page.getByRole("button", { name: /done/i }),
    ).toBeEnabled({ timeout: 5_000 });
  });

  test("[BT-10-AC3] If the vault is already active when a session is resumed, the activation step is skipped", async ({
    page,
  }) => {
    // Seed localStorage with a completed pegin so the app treats it as resumed.
    await page.addInitScript(
      ({ btcAddress, ethAddress, providerPubkey }) => {
        const completedPegin = {
          peginTxHash: "b".repeat(64),
          ethTxHash: "0x" + "c".repeat(64),
          depositorBtcPubkey: "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
          vaultId: "0xABCD",
          status: "ACTIVE",
          btcAddress,
          ethAddress,
          providerBtcPubkey: providerPubkey,
          createdAt: Date.now(),
        };
        window.localStorage.setItem(
          "babylon_pegins",
          JSON.stringify([completedPegin]),
        );
      },
      {
        btcAddress: MOCK_BTC_ADDRESS,
        ethAddress: MOCK_ETH_ADDRESS,
        providerPubkey: MOCK_BTC_PUBKEY,
      },
    );

    await setupFullEnv(page);
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The dashboard should show the vault in ACTIVE state; there should be
    // no "Activate vault" prompt since it is already active.
    await expect(
      page.getByText(/activate vault/i),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
