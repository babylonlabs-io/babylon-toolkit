/**
 * A failing position read must not leave the dashboard or the Liquidations page
 * showing an empty or current-looking account.
 *
 * The recorded backend answers the app's reads, and this spec fails the request
 * carrying the position read on demand, along with anything batched into the
 * same multicall, so the real hook, React Query and the real pages run together.
 * The recorded depositor holds no position, so the "already read" case here is
 * an account last read as empty; the hook's own tests cover a cached position.
 * The page clock lets polls and the 90-second threshold pass in moments.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { toFunctionSelector } from "viem";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import { RECORDED_ENDPOINTS } from "./fixtures/replay/contracts";
import { blockOffsiteRequests, recordedPageWallets } from "./visual/capture";

const GET_POSITION_SELECTOR = toFunctionSelector(
  "function getPosition(address)",
).slice(2);
const NOTICE_TEST_ID = "position-unavailable-notice";
/** `COPY.risk.status.unavailable` and `.noPosition`. */
const STATUS_UNAVAILABLE = "Unavailable";
const STATUS_NO_POSITION = "No Position";
/** `COPY.liquidations.empty.noDepositTitle`. */
const NO_DEPOSIT_TITLE = "No deposit yet";
/** `COPY.liquidations.empty.unavailableTitle`. */
const ANALYSIS_UNAVAILABLE_TITLE = "Liquidation analysis unavailable";
/** `COPY.overview.borrowedAssetEmpty`: shown only once a read has settled. */
const NOTHING_BORROWED = "Not Selected";

const POLL_INTERVAL_MS = 30_000;
const STALENESS_THRESHOLD_MS = 90_000;
/**
 * Four attempts at a fetch, and viem retries each one's request once. Nothing
 * else asks until the next poll once this many have failed.
 */
const REQUESTS_PER_FAILED_FETCH = 8;
/** Long enough to see a poll's first attempts, before its second one fails. */
const POLL_START_SAMPLE_MS = 1_000;
/** Long enough for a failed fetch's last 503 to settle it in the page. */
const FETCH_SETTLE_SAMPLE_MS = 500;
const SAMPLE_INTERVAL_MS = 100;
/** A full failed fetch takes about 8s of real retries. */
const FAILED_FETCH_TIMEOUT_MS = 30_000;
/** A started poll's first request arrives well within this. */
const POLL_START_TIMEOUT_MS = 1_000;

interface PositionReads {
  failing: boolean;
  failed: number;
}

async function openBackend(page: Page): Promise<PositionReads> {
  const reads: PositionReads = { failing: false, failed: 0 };
  await page.clock.install();
  await blockOffsiteRequests(page);
  await installRecordedBackend(page);
  await injectPageWallets(page, recordedPageWallets());
  // Added after the backend, so it runs first.
  await page.route(RECORDED_ENDPOINTS.ETH_RPC_URL, async (route: Route) => {
    const carriesPositionRead = route
      .request()
      .postData()
      ?.includes(GET_POSITION_SELECTOR);
    if (!reads.failing || !carriesPositionRead) return route.fallback();

    reads.failed += 1;
    return route.fulfill({ status: 503, body: "unavailable" });
  });
  return reads;
}

async function connectAndGoTo(page: Page, path: string): Promise<void> {
  await page.goto("/vaults", { waitUntil: "domcontentloaded" });
  await connectInjectedWallets(page);
  await page.locator(`a[href="${path}"]`).first().click();
}

async function waitForFailedFetch(reads: PositionReads): Promise<void> {
  await expect
    .poll(() => reads.failed, { timeout: FAILED_FETCH_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(REQUESTS_PER_FAILED_FETCH);
}

/**
 * Forwards until a new request shows a poll started. The count rises before the
 * page has that request's 503, and a forward landing in that gap only joins the
 * fetch on its way out, which puts the next poll a full interval away.
 */
async function forwardToNextPoll(
  page: Page,
  reads: PositionReads,
): Promise<void> {
  const failedSoFar = reads.failed;
  await expect(async () => {
    await page.clock.fastForward(POLL_INTERVAL_MS);
    await expect
      .poll(() => reads.failed, { timeout: POLL_START_TIMEOUT_MS })
      .toBeGreaterThan(failedSoFar);
  }).toPass();
}

/** Auto-retrying assertions would pass over a blink, so this samples instead. */
async function expectVisibleThroughout(
  page: Page,
  locator: Locator,
  ms: number,
): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    expect(await locator.isVisible()).toBe(true);
    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
  }
}

test.describe("position read failing", () => {
  test("a failed first read shows the notice instead of an empty account, through the next poll, until a read succeeds", async ({
    page,
  }) => {
    const reads = await openBackend(page);
    reads.failing = true;
    await connectAndGoTo(page, "/");

    const notice = page.getByTestId(NOTICE_TEST_ID);
    const unavailable = page.getByText(STATUS_UNAVAILABLE, { exact: true });
    await expect(notice).toBeVisible();
    await expect(unavailable).toBeVisible();
    await expect(page.getByText(NO_DEPOSIT_TITLE)).toHaveCount(0);
    await expect(
      page.getByText(STATUS_NO_POSITION, { exact: true }),
    ).toHaveCount(0);

    // The next poll resets a query with no data to loading: the notice holds.
    await waitForFailedFetch(reads);
    await forwardToNextPoll(page, reads);
    await expectVisibleThroughout(page, notice, POLL_START_SAMPLE_MS);

    reads.failing = false;
    await page.clock.fastForward(POLL_INTERVAL_MS);
    await expect(notice).toHaveCount(0);
    await expect(unavailable).toHaveCount(0);
  });

  test("reads failing after a success show the notice only once the last success is past the threshold", async ({
    page,
  }) => {
    const reads = await openBackend(page);
    await connectAndGoTo(page, "/");
    await expect(
      page.getByText(NOTHING_BORROWED, { exact: true }),
    ).toBeVisible();

    reads.failing = true;
    await page.clock.fastForward(POLL_INTERVAL_MS);
    await waitForFailedFetch(reads);

    const notice = page.getByTestId(NOTICE_TEST_ID);
    await expect(notice).toHaveCount(0);

    await page.clock.fastForward(STALENESS_THRESHOLD_MS);
    await expect(notice).toBeVisible();

    reads.failing = false;
    await page.clock.fastForward(POLL_INTERVAL_MS);
    await expect(notice).toHaveCount(0);
  });

  test("the Liquidations page explains a failed first read instead of inviting a deposit", async ({
    page,
  }) => {
    const reads = await openBackend(page);
    reads.failing = true;
    await connectAndGoTo(page, "/liquidations");

    const message = page.getByText(ANALYSIS_UNAVAILABLE_TITLE);
    await expect(message).toBeVisible();

    // Through that read settling as failed, not only through its retries.
    await waitForFailedFetch(reads);
    await expectVisibleThroughout(page, message, FETCH_SETTLE_SAMPLE_MS);
    await expect(page.getByText(NO_DEPOSIT_TITLE)).toHaveCount(0);
  });
});
