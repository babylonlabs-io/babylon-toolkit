/**
 * The Bitcoin refund is offered from chain state, not from the indexer's EXPIRED.
 *
 * The indexer reports EXPIRED only after someone calls `reportExpiredPegins`.
 * If nobody does, or the indexer lags, a vault the chain can no longer advance
 * keeps reading PENDING or VERIFIED, and a depositor whose BTC Bitcoin would
 * release sees no way to get it back.
 *
 * The recorded backend serves the app's reads, but the recording ends before any
 * deposit exists, so this spec states the premise of each case: the indexer's
 * row, the registry's record, the chain head and the Bitcoin confirmations. The
 * real hooks, polling and pages run on top of them. Nothing here signs.
 */

import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core/contracts";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  encodeFunctionResult,
  toFunctionSelector,
  toHex,
  type Hex,
} from "viem";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend, type ReplayBackend } from "./fixtures/replay";
import {
  RECORDED_DEPLOYMENT,
  RECORDED_DEPOSITOR,
  RECORDED_ENDPOINTS,
} from "./fixtures/replay/contracts";
import { blockOffsiteRequests, recordedPageWallets } from "./visual/capture";

/** `IBTCVaultRegistry.BTCVaultStatus`, spelled out rather than imported as app state. */
const ON_CHAIN_PENDING = 0;
const ON_CHAIN_VERIFIED = 1;
const ON_CHAIN_REDEEMED = 3;
const ON_CHAIN_EXPIRED = 4;

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;
const PEGIN_TX_HASH = `0x${"22".repeat(32)}` as Hex;
const VAULT_PROVIDER = "0x00000000000000000000000000000000000000a1";
/** The injected wallet's x-only key, so the row belongs to the connected wallet. */
const DEPOSITOR_BTC_PUBKEY = `0x${RECORDED_DEPOSITOR.BTC_PUBLIC_KEY.slice(2)}`;
const AMOUNT_SATS = 2_000_000n;

/**
 * A well-formed one-input, one-output Bitcoin transaction. The app derives the
 * Pre-PegIn txid from it, which is all the row needs; nothing spends it.
 */
const PRE_PEGIN_TX_HEX = `0x${[
  "02000000", // version
  "01", // input count
  "11".repeat(32), // previous txid
  "00000000", // previous vout
  "00", // empty scriptSig
  "ffffffff", // sequence
  "01", // output count
  "80841e0000000000", // 2_000_000 sats, little-endian
  "00", // empty scriptPubKey
  "00000000", // locktime
].join("")}`;

const CHAIN_HEAD = 50_000_000n;
/** Registered so long ago that any recorded timeout has elapsed. */
const CREATED_LONG_AGO = 1n;
/** Registered just now, so no recorded timeout has elapsed. */
const CREATED_JUST_NOW = CHAIN_HEAD - 3n;

/** Past any refund timelock the recorded offchain params can hold. */
const CONFIRMATIONS_PAST_TIMELOCK = 1_000_000;
const CONFIRMATIONS_BEFORE_TIMELOCK = 1;
const BTC_TIP_HEIGHT = 2_000_000;

/** `COPY.vaults.actions.withdraw`. */
const WITHDRAW_LABEL = "Withdraw";
/** `COPY.vaults.actions.redeem`. */
const REDEEM_LABEL = "Redeem";
/** `COPY.vaults.actions.viewDetails`. */
const VIEW_DETAILS_LABEL = "View Details";
/** `COPY.pegin.labels.EXPIRED`. */
const EXPIRED_LABEL = "Expired";
/** `COPY.pegin.labels.REDEEM_IN_PROGRESS`. */
const REDEEM_IN_PROGRESS_LABEL = "Redeem in progress";
/** `COPY.pegin.labels.REFUNDING`. */
const REFUNDING_LABEL = "Refunding";
/** The head of `COPY.pegin.messages.refundMaturing`. */
const REFUND_COUNTDOWN = "Your refund will be claimable in";
/** The head of `COPY.pegin.messages.refundUnsettled`. */
const REFUND_UNSETTLED_MESSAGE = "A refund was broadcast from this device";
/** `COPY.pegin.messages.peginSweptExpiryUnreportedSubtext`. */
const SWEPT_UNREPORTED_SUBTEXT =
  "Refund unavailable: redeem opens once the expiry is recorded";
const PENDING_ROW_TEST_ID = "pending-deposit-row";

/** `STORAGE_KEY_PREFIX`, spelled out like the rest of the premise. */
const PENDING_PEGINS_STORAGE_PREFIX = "vault-pending-pegins";

const VAULT_ROW_WAIT_MS = 20_000;

interface Premise {
  /** The GraphQL status the indexer keeps reporting. */
  indexerStatus: "pending" | "verified";
  /** What the registry holds for the vault. */
  onChainStatus: number;
  createdAt: bigint;
  /** How deep the Pre-PegIn is on Bitcoin. */
  confirmations: number;
  /** The transaction that spent the HTLC, if one has. */
  htlcSpentBy?: Hex;
  /** The status of the record this browser holds for the vault, if any. */
  localRecord?: "pending" | "refund_broadcast";
}

function vaultRow({ indexerStatus }: Premise) {
  const hex = `0x${"33".repeat(32)}`;
  return {
    id: VAULT_ID,
    depositor: RECORDED_DEPOSITOR.ETH_ADDRESS,
    depositorBtcPubKey: DEPOSITOR_BTC_PUBKEY,
    vaultProvider: VAULT_PROVIDER,
    amount: AMOUNT_SATS.toString(),
    applicationEntryPoint: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
    status: indexerStatus,
    inUse: false,
    ackCount: 0,
    depositorSignedPeginTx: PRE_PEGIN_TX_HEX,
    unsignedPrePeginTx: PRE_PEGIN_TX_HEX,
    peginTxHash: PEGIN_TX_HASH,
    hashlock: hex,
    htlcVout: 0,
    secret: null,
    peginSigsPostedAt: null,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    offchainParamsVersion: 1,
    currentOwner: null,
    referralCode: 0,
    depositorPayoutBtcAddress: hex,
    depositorWotsPkHash: hex,
    btcPopSignature: null,
    pendingAt: "1700000000",
    verifiedAt: null,
    activatedAt: null,
    expiredAt: null,
    expirationReason: null,
    activationRedeemReason: null,
    activationFailedData: null,
    blockNumber: "1",
  };
}

/** Answers the indexer's vault list from the premise; the rest stays recorded. */
async function stateIndexerRow(page: Page, premise: Premise): Promise<void> {
  const origin = new URL(RECORDED_ENDPOINTS.GRAPHQL_ENDPOINT).origin;
  await page.route(
    (url) => url.origin === origin,
    async (route: Route) => {
      const query = route.request().postDataJSON()?.query as string | undefined;
      if (!query?.includes("GetVaultsByDepositorFirstPage")) {
        return route.fallback();
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            vaults: {
              items: [vaultRow(premise)],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      });
    },
  );
}

/** Writes this browser's record of the deposit, before the app reads it. */
async function stateLocalRecord(
  page: Page,
  status: NonNullable<Premise["localRecord"]>,
): Promise<void> {
  const registry = RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY.toLowerCase();
  await page.addInitScript(
    ([key, record]) => localStorage.setItem(key, record),
    [
      `${PENDING_PEGINS_STORAGE_PREFIX}-${registry}-${RECORDED_DEPOSITOR.ETH_ADDRESS}`,
      JSON.stringify([
        {
          id: VAULT_ID,
          peginTxHash: PEGIN_TX_HASH,
          timestamp: 1,
          status,
          unsignedTxHex: PRE_PEGIN_TX_HEX,
          buildOffchainParamsVersion: 1,
          buildAppVaultKeepersVersion: 1,
          buildUniversalChallengersVersion: 1,
          buildVaultCoreVersion: 1,
          ...(status === "refund_broadcast" ? { refundBroadcastAt: 1 } : {}),
        },
      ]),
    ] as const,
  );
}

/** Answers the Pre-PegIn's depth and the HTLC's spend. */
async function stateBitcoin(page: Page, premise: Premise): Promise<void> {
  const tipPath = /\/blocks\/tip\/height$/;
  const outspendPath = /\/tx\/[0-9a-f]{64}\/outspend\/\d+$/;
  const txPath = /\/tx\/[0-9a-f]{64}$/;
  await page.route(
    (url) =>
      url.pathname.startsWith("/mempool") &&
      [tipPath, outspendPath, txPath].some((path) => path.test(url.pathname)),
    (route: Route) => {
      const { pathname } = new URL(route.request().url());
      if (tipPath.test(pathname)) {
        return route.fulfill({
          contentType: "text/plain",
          body: String(BTC_TIP_HEIGHT),
        });
      }
      if (outspendPath.test(pathname)) {
        return route.fulfill({
          json: premise.htlcSpentBy
            ? {
                spent: true,
                txid: premise.htlcSpentBy.slice("0x".length),
                vin: 0,
                status: { confirmed: true },
              }
            : { spent: false },
        });
      }
      return route.fulfill({
        json: {
          status: {
            confirmed: true,
            block_height: BTC_TIP_HEIGHT - premise.confirmations + 1,
          },
        },
      });
    },
  );
}

async function openVaults(
  page: Page,
  premise: Premise,
  path = "/vaults",
): Promise<ReplayBackend> {
  await blockOffsiteRequests(page);
  const backend = await installRecordedBackend(page, {
    statedMethods: { eth_blockNumber: toHex(CHAIN_HEAD) },
    statedAnswers: [
      {
        target: RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY,
        selector: toFunctionSelector(
          "function getBtcVaultBasicInfo(bytes32)",
        ),
        answer: () =>
          encodeFunctionResult({
            abi: BTCVaultRegistryABI,
            functionName: "getBtcVaultBasicInfo",
            result: {
              depositor: RECORDED_DEPOSITOR.ETH_ADDRESS,
              depositorBtcPubKey: DEPOSITOR_BTC_PUBKEY as Hex,
              amount: AMOUNT_SATS,
              vaultProvider: VAULT_PROVIDER,
              status: premise.onChainStatus,
              applicationEntryPoint: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
              createdAt: premise.createdAt,
            },
          }),
      },
    ],
  });
  await stateIndexerRow(page, premise);
  await stateBitcoin(page, premise);
  if (premise.localRecord) await stateLocalRecord(page, premise.localRecord);
  await injectPageWallets(page, recordedPageWallets());
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await connectInjectedWallets(page);
  return backend;
}

function registryWasAsked(backend: ReplayBackend): boolean {
  return backend.chain.statedAsks.some(
    (ask) =>
      ask.target === RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY.toLowerCase() &&
      ask.callData.includes(VAULT_ID.slice(2)),
  );
}

test.describe("refund offered from chain state", () => {
  test("offers the refund on a Verified vault past its deadline that nobody reported", async ({
    page,
  }) => {
    const backend = await openVaults(page, {
      indexerStatus: "verified",
      onChainStatus: ON_CHAIN_VERIFIED,
      createdAt: CREATED_LONG_AGO,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
    });

    await expect(
      page.getByRole("button", { name: WITHDRAW_LABEL }),
    ).toBeEnabled({ timeout: VAULT_ROW_WAIT_MS });
    await expect(page.getByText(EXPIRED_LABEL).first()).toBeVisible();
    await expect(page.getByTestId(PENDING_ROW_TEST_ID)).toHaveCount(0);
    expect(registryWasAsked(backend)).toBe(true);
  });

  test("offers the refund on a Pending vault past its deadline that nobody reported", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "pending",
      onChainStatus: ON_CHAIN_PENDING,
      createdAt: CREATED_LONG_AGO,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
    });

    await expect(
      page.getByRole("button", { name: WITHDRAW_LABEL }),
    ).toBeEnabled({ timeout: VAULT_ROW_WAIT_MS });
    await expect(page.getByTestId(PENDING_ROW_TEST_ID)).toHaveCount(0);
  });

  test("offers the refund when the registry records the expiry and the indexer has not caught up", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "verified",
      onChainStatus: ON_CHAIN_EXPIRED,
      createdAt: CREATED_JUST_NOW,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
    });

    await expect(
      page.getByRole("button", { name: WITHDRAW_LABEL }),
    ).toBeEnabled({ timeout: VAULT_ROW_WAIT_MS });
  });

  test("counts down, with no refund, until Bitcoin would accept it", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "verified",
      onChainStatus: ON_CHAIN_VERIFIED,
      createdAt: CREATED_LONG_AGO,
      confirmations: CONFIRMATIONS_BEFORE_TIMELOCK,
    });

    await expect(page.getByText(REFUND_COUNTDOWN)).toBeVisible({
      timeout: VAULT_ROW_WAIT_MS,
    });
    await expect(page.getByRole("button", { name: WITHDRAW_LABEL })).toHaveCount(
      0,
    );
  });

  test("reads a vault the registry records Redeemed as redeemed on a fresh load, whatever the indexer reports", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "verified",
      onChainStatus: ON_CHAIN_REDEEMED,
      createdAt: CREATED_LONG_AGO,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
    });

    await expect(page.getByText(REDEEM_IN_PROGRESS_LABEL)).toBeVisible({
      timeout: VAULT_ROW_WAIT_MS,
    });
    await expect(page.getByTestId(PENDING_ROW_TEST_ID)).toHaveCount(0);
  });

  test("keeps a Verified vault inside its window pending, with no refund", async ({
    page,
  }) => {
    const backend = await openVaults(page, {
      indexerStatus: "verified",
      onChainStatus: ON_CHAIN_VERIFIED,
      createdAt: CREATED_JUST_NOW,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
    });

    await expect(page.getByTestId(PENDING_ROW_TEST_ID)).toBeVisible({
      timeout: VAULT_ROW_WAIT_MS,
    });
    await expect.poll(() => registryWasAsked(backend)).toBe(true);
    await expect(page.getByRole("button", { name: WITHDRAW_LABEL })).toHaveCount(
      0,
    );
  });

  test("says a swept vault's redeem waits for the expiry to be recorded, offering neither exit", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "verified",
      onChainStatus: ON_CHAIN_VERIFIED,
      createdAt: CREATED_LONG_AGO,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
      htlcSpentBy: PEGIN_TX_HASH,
    });

    await expect(page.getByText(SWEPT_UNREPORTED_SUBTEXT)).toBeVisible({
      timeout: VAULT_ROW_WAIT_MS,
    });
    await expect(page.getByRole("button", { name: WITHDRAW_LABEL })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: REDEEM_LABEL })).toHaveCount(
      0,
    );
  });

  test("reads Refunding, with no details, on a vault this device refunded that reads Verified again", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "verified",
      onChainStatus: ON_CHAIN_VERIFIED,
      createdAt: CREATED_JUST_NOW,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
      localRecord: "refund_broadcast",
    });

    const row = page.getByTestId(PENDING_ROW_TEST_ID);
    await expect(row.getByText(REFUNDING_LABEL)).toBeVisible({
      timeout: VAULT_ROW_WAIT_MS,
    });
    await expect(row.getByText(REFUND_UNSETTLED_MESSAGE)).toBeVisible();
    await expect(
      row.getByRole("button", { name: VIEW_DETAILS_LABEL }),
    ).toHaveCount(0);
  });

  test("reads Refunding, with no details, on a vault this device refunded that reads Pending again", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "pending",
      onChainStatus: ON_CHAIN_PENDING,
      createdAt: CREATED_JUST_NOW,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
      localRecord: "refund_broadcast",
    });

    const row = page.getByTestId(PENDING_ROW_TEST_ID);
    await expect(row.getByText(REFUNDING_LABEL)).toBeVisible({
      timeout: VAULT_ROW_WAIT_MS,
    });
    await expect(row.getByText(REFUND_UNSETTLED_MESSAGE)).toBeVisible();
    await expect(
      row.getByRole("button", { name: VIEW_DETAILS_LABEL }),
    ).toHaveCount(0);
  });

  test("offers the refund on the Activity page when this browser still holds the deposit's record", async ({
    page,
  }) => {
    await openVaults(
      page,
      {
        indexerStatus: "verified",
        onChainStatus: ON_CHAIN_VERIFIED,
        createdAt: CREATED_LONG_AGO,
        confirmations: CONFIRMATIONS_PAST_TIMELOCK,
        localRecord: "pending",
      },
      "/activity",
    );

    await expect(
      page.getByRole("button", { name: WITHDRAW_LABEL }),
    ).toBeEnabled({ timeout: VAULT_ROW_WAIT_MS });
  });

  test("leaves an unregistered record at the indexer's status", async ({
    page,
  }) => {
    await openVaults(page, {
      indexerStatus: "pending",
      onChainStatus: ON_CHAIN_PENDING,
      createdAt: 0n,
      confirmations: CONFIRMATIONS_PAST_TIMELOCK,
    });

    await expect(page.getByTestId(PENDING_ROW_TEST_ID)).toBeVisible({
      timeout: VAULT_ROW_WAIT_MS,
    });
    await expect(page.getByRole("button", { name: WITHDRAW_LABEL })).toHaveCount(
      0,
    );
  });
});
