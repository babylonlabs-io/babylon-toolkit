/**
 * The Activity page's Withdrawals filter lists every row that returned a
 * vault's BTC to the depositor: a vault withdrawn from the Aave position and
 * the redeem of an expired vault.
 *
 * The indexer records the first as `redeem` and the second as `claim_expired`.
 * It no longer emits `withdrawal`, the only type the filter used to match, so
 * the filter used to show nothing at all. The label map
 * (`services/activity/projection.ts`) and the filter
 * (`components/Activity/ActivityList.tsx`) each have unit tests; this walks
 * the indexer's wire types through both, with the real fetch, the vault
 * provider's claim lookup and the filter menu in between.
 *
 * The recorded backend serves the app's reads, but the recording holds no
 * activity, so each case states the indexer's activity page and what the vault
 * provider answers for each claim. The vault list stays the recording's
 * (empty): a redeemed vault has no refund to offer, so it adds no row. Nothing
 * here signs.
 */

import { expect, test, type Page, type Route } from "@playwright/test";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend, type ReplayBackend } from "./fixtures/replay";
import {
  RECORDED_DEPOSITOR,
  RECORDED_ENDPOINTS,
  RECORDED_VAULT_PROVIDER,
} from "./fixtures/replay/contracts";
import {
  assertRecordingCovered,
  blockOffsiteRequests,
  recordedPageWallets,
} from "./visual/capture";

/** The indexer stores addresses lowercase. */
const DEPOSITOR = RECORDED_DEPOSITOR.ETH_ADDRESS.toLowerCase();
/** Already lowercase, as the indexer stores it. */
const VAULT_PROVIDER = RECORDED_VAULT_PROVIDER.ETH_ADDRESS;

const PEGOUT_STATUS_METHOD = "vaultProvider_batchGetPegoutStatusByVaultId";
/** `ClaimerPegoutStatusValue.CLAIM_BROADCAST`, as the vault provider sends it. */
const CLAIM_BROADCAST = "ClaimBroadcast";
/** jsonrpsee's generic server error, which the vault provider answers an internal failure with. */
const JSON_RPC_SERVER_ERROR = -32000;

/** Reserve "0" of the recorded `GetAaveAppConfig`: USDC, 6 decimals. */
const USDC_RESERVE_ID = "0";

interface IndexedVault {
  /** bytes32, lowercase with `0x`, as the indexer stores it. */
  readonly id: string;
  readonly peginTxHash: string;
}

/** Collateral that stays in the position. */
const KEPT_VAULT: IndexedVault = {
  id: `0x${"0a".repeat(32)}`,
  peginTxHash: `0x${"a0".repeat(32)}`,
};
/** Withdrawn from the Aave position: the indexer's `redeem`. */
const WITHDRAWN_VAULT: IndexedVault = {
  id: `0x${"0b".repeat(32)}`,
  peginTxHash: `0x${"b0".repeat(32)}`,
};
/** Expired before activation, then redeemed: the indexer's `claim_expired`. */
const EXPIRED_VAULT: IndexedVault = {
  id: `0x${"0c".repeat(32)}`,
  peginTxHash: `0x${"c0".repeat(32)}`,
};

/** The claim txids the vault provider precomputed at peg-in: 64 hex, no `0x`. */
const WITHDRAWAL_CLAIM_TXID = "b1".repeat(32);
const EXPIRED_REDEEM_CLAIM_TXID = "c1".repeat(32);
const CLAIMS = [
  { vault: WITHDRAWN_VAULT, claimTxid: WITHDRAWAL_CLAIM_TXID },
  { vault: EXPIRED_VAULT, claimTxid: EXPIRED_REDEEM_CLAIM_TXID },
] as const;

const KEPT_SATS = "5000000";
const WITHDRAWN_SATS = "3000000";
/** `WITHDRAWN_SATS` as its row shows it. */
const WITHDRAWN_AMOUNT_LABEL = "0.03 sBTC";
const EXPIRED_SATS = "2000000";
/** `EXPIRED_SATS` as its row shows it. */
const EXPIRED_AMOUNT_LABEL = "0.02 sBTC";
/** 250 USDC at the reserve's 6 decimals. */
const BORROWED_AMOUNT = "250000000";

/** 2026-07-20T12:00:00Z; later events follow a day apart. */
const FIRST_EVENT_AT = 1_784_548_800;
const ONE_DAY_S = 86_400;
/** A Sepolia block near that date. */
const FIRST_EVENT_BLOCK = 11_313_642;
/** 12 s slots. */
const BLOCKS_PER_DAY = 7_200;

/** `COPY.activity.filterAll`: the filter trigger with nothing picked. */
const SHOW_ALL_LABEL = "Show All";
/** `COPY.activity.filterTypes.Withdraw`. */
const WITHDRAWALS_OPTION = "Withdrawals";
/** `COPY.activity.typeLabels.Withdraw`. */
const WITHDRAW_ROW_LABEL = "Withdraw";
/** `COPY.activity.typeLabels.Redeem`. */
const REDEEM_ROW_LABEL = "Redeem";
/** `COPY.activity.hashPending`. */
const HASH_PENDING_LABEL = "Pending…";
/** Where a signet BTC hash links (`getBtcExplorerTxUrl`). */
const SIGNET_TX_URL = "https://mempool.space/signet/tx/";

/** Cold dev-server compile plus wallet connect before the first row. */
const ROWS_WAIT_MS = 20_000;

/** One indexed event; `id` is the indexer's `${txHash}-${logIndex}-${type}`. */
function indexedActivity(event: {
  type: "deposit" | "borrow" | "redeem" | "claim_expired";
  vaultId: string | null;
  amount: string;
  /** Repeated into the EVM tx hash, so each event has its own. */
  txByte: string;
  /** Days after FIRST_EVENT_AT. */
  day: number;
  debtReserveId?: string;
}) {
  const transactionHash = `0x${event.txByte.repeat(32)}`;
  return {
    id: `${transactionHash}-0-${event.type}`,
    vaultId: event.vaultId,
    depositor: DEPOSITOR,
    type: event.type,
    amount: event.amount,
    debtReserveId: event.debtReserveId ?? null,
    timestamp: String(FIRST_EVENT_AT + event.day * ONE_DAY_S),
    blockNumber: String(FIRST_EVENT_BLOCK + event.day * BLOCKS_PER_DAY),
    transactionHash,
  };
}

/**
 * Two vaults deposited, a loan against them, one vault withdrawn from the
 * position, and a third vault that expired before activation and was
 * redeemed. Newest first, as the indexer pages it.
 */
const HISTORY = {
  activities: [
    indexedActivity({
      type: "claim_expired",
      vaultId: EXPIRED_VAULT.id,
      amount: EXPIRED_SATS,
      txByte: "e4",
      day: 4,
    }),
    indexedActivity({
      type: "redeem",
      vaultId: WITHDRAWN_VAULT.id,
      amount: WITHDRAWN_SATS,
      txByte: "e3",
      day: 3,
    }),
    indexedActivity({
      type: "borrow",
      vaultId: null,
      amount: BORROWED_AMOUNT,
      debtReserveId: USDC_RESERVE_ID,
      txByte: "e2",
      day: 2,
    }),
    indexedActivity({
      type: "deposit",
      vaultId: WITHDRAWN_VAULT.id,
      amount: WITHDRAWN_SATS,
      txByte: "e1",
      day: 1,
    }),
    indexedActivity({
      type: "deposit",
      vaultId: KEPT_VAULT.id,
      amount: KEPT_SATS,
      txByte: "e0",
      day: 0,
    }),
  ],
  vaults: [KEPT_VAULT, WITHDRAWN_VAULT, EXPIRED_VAULT],
};

/** Answers the indexer's first activity page from HISTORY; the rest stays recorded. */
async function stateIndexerActivity(page: Page): Promise<void> {
  const origin = new URL(RECORDED_ENDPOINTS.GRAPHQL_ENDPOINT).origin;
  await page.route(
    (url) => url.origin === origin,
    (route: Route) => {
      const query = route.request().postDataJSON()?.query as string | undefined;
      if (!query?.includes("GetActivitiesFirstPage")) return route.fallback();
      // One page of each: a next page would be asked of the recording, which
      // holds none, and the whole feed would fail.
      return route.fulfill({
        json: {
          data: {
            vaultActivitys: {
              items: HISTORY.activities,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
            vaults: {
              items: HISTORY.vaults.map((vault) => ({
                id: vault.id,
                peginTxHash: vault.peginTxHash,
                vaultProvider: VAULT_PROVIDER,
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      });
    },
  );
}

/** A `GetPegoutStatusResponse` whose claimer has broadcast its claim. */
function claimBroadcastStatus(vault: IndexedVault, claimTxid: string) {
  return {
    pegin_txid: vault.peginTxHash.slice("0x".length), // the validator refuses a `0x`
    vault_id: vault.id,
    found: true,
    claimer: {
      status: CLAIM_BROADCAST,
      failed: false,
      claim_txid: claimTxid,
      claimer_pubkey: "d0".repeat(32),
      assert_txid: "d1".repeat(32),
      created_at: FIRST_EVENT_AT,
      updated_at: FIRST_EVENT_AT,
    },
    challengers: [],
  };
}

interface PegoutStatusRequest {
  id: number;
  method: string;
  params: [{ vault_ids: string[] }];
}

/** The vault provider's answer to one claim lookup. */
type VaultProviderAnswer = "claims broadcast" | "lookup fails";

/**
 * Answers the vault provider's claim lookup as `answer` says, and counts the
 * lookups so a test can tell a failed lookup from one that never ran.
 */
async function stateVaultProvider(
  page: Page,
  answer: VaultProviderAnswer,
): Promise<{ pegoutStatusRequests: () => number }> {
  let pegoutStatusRequests = 0;
  const origin = new URL(RECORDED_ENDPOINTS.VP_PROXY_URL).origin;
  await page.route(
    (url) => url.origin === origin && url.pathname === `/rpc/${VAULT_PROVIDER}`,
    (route: Route) => {
      const request = route
        .request()
        .postDataJSON() as PegoutStatusRequest | null;
      if (request?.method !== PEGOUT_STATUS_METHOD) return route.fallback();
      pegoutStatusRequests += 1;
      if (answer === "lookup fails") {
        return route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: JSON_RPC_SERVER_ERROR,
              message: "database unavailable",
            },
          },
        });
      }
      return route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            // Each id arrives lowercased without `0x`; the client matches the echo.
            results: request.params[0].vault_ids.map((vaultId) => {
              const claim = CLAIMS.find(
                ({ vault }) => vault.id === `0x${vaultId}`,
              );
              return claim
                ? {
                    vault_id: vaultId,
                    error: null,
                    result: claimBroadcastStatus(claim.vault, claim.claimTxid),
                  }
                : { vault_id: vaultId, result: null, error: "vault not found" };
            }),
          },
        },
      });
    },
  );
  return { pegoutStatusRequests: () => pegoutStatusRequests };
}

async function openActivity(
  page: Page,
  answer: VaultProviderAnswer,
): Promise<{ backend: ReplayBackend; pegoutStatusRequests: () => number }> {
  await blockOffsiteRequests(page);
  const backend = await installRecordedBackend(page);
  await stateIndexerActivity(page);
  const { pegoutStatusRequests } = await stateVaultProvider(page, answer);
  await injectPageWallets(page, recordedPageWallets());
  await page.goto("/activity", { waitUntil: "domcontentloaded" });
  await connectInjectedWallets(page);
  return { backend, pegoutStatusRequests };
}

/** Waits for the whole history, picks Withdrawals, and returns the listed rows. */
async function pickWithdrawals(page: Page) {
  const rows = page.getByRole("main").getByRole("listitem");
  await expect(rows).toHaveCount(HISTORY.activities.length, {
    timeout: ROWS_WAIT_MS,
  });
  await page.getByRole("button", { name: SHOW_ALL_LABEL, exact: true }).click();
  await page
    .getByRole("option", { name: WITHDRAWALS_OPTION, exact: true })
    .click();
  return rows;
}

test.describe("the Activity page's Withdrawals filter", () => {
  test("lists the Aave withdrawal, linked to its Bitcoin claim, and the expired vault's redeem, and nothing else", async ({
    page,
  }) => {
    const { backend } = await openActivity(page, "claims broadcast");
    const rows = await pickWithdrawals(page);

    await expect(rows).toHaveCount(2);
    const withdrawal = rows.filter({
      has: page.getByText(WITHDRAW_ROW_LABEL, { exact: true }),
    });
    await expect(withdrawal).toContainText(WITHDRAWN_AMOUNT_LABEL);
    await expect(withdrawal.getByRole("link")).toHaveAttribute(
      "href",
      `${SIGNET_TX_URL}${WITHDRAWAL_CLAIM_TXID}`,
    );
    const redeem = rows.filter({
      has: page.getByText(REDEEM_ROW_LABEL, { exact: true }),
    });
    await expect(redeem).toContainText(EXPIRED_AMOUNT_LABEL);
    assertRecordingCovered(backend, "the Activity page");
  });

  test("still lists the withdrawal, as pending, when the vault provider's claim lookup fails", async ({
    page,
  }) => {
    const { backend, pegoutStatusRequests } = await openActivity(
      page,
      "lookup fails",
    );
    const rows = await pickWithdrawals(page);

    await expect(rows).toHaveCount(2);
    const withdrawal = rows.filter({
      has: page.getByText(WITHDRAW_ROW_LABEL, { exact: true }),
    });
    await expect(withdrawal).toContainText(WITHDRAWN_AMOUNT_LABEL);
    await expect(withdrawal).toContainText(HASH_PENDING_LABEL);
    await expect(withdrawal.getByRole("link")).toHaveCount(0);
    // Pending because the provider failed, not because it was never asked.
    expect(pegoutStatusRequests()).toBeGreaterThan(0);
    assertRecordingCovered(backend, "the Activity page");
  });
});
