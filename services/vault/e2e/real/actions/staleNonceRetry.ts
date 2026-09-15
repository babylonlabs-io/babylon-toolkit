/**
 * TEMPORARY: delete with https://github.com/babylonlabs-io/babylon-toolkit/issues/2514.
 *
 * MetaMask can sign a transaction with the nonce the previous, just-mined one already used, because its
 * node lags the receipt the app waited for. The node rejects it before broadcast, so resubmitting is
 * safe. Until the app waits for the wallet's nonce itself, a borrow/repay submit that fails this way is
 * resubmitted once. After that fix the form should never show this failure again, and the E2E must fail
 * on it, so this module goes away with it.
 */
import type { Locator, Page } from "@playwright/test";

import {
  MS_PER_SECOND,
  STALE_NONCE_RETRY_DELAY_MS,
  STALE_NONCE_RETRY_LIMIT,
  STEP_TIMEOUT_MS,
} from "../timing";

import { STALE_NONCE_RX, TX_FAILED_RX } from "./selectors";

/**
 * Called when the form shows "Transaction failed". Resubmits (clicks `cta` again after a delay) only when
 * the failure names a stale nonce and fewer than STALE_NONCE_RETRY_LIMIT retries were used, then waits
 * for the failure callout to clear so the caller's success loop doesn't re-read the old failure.
 *
 * @returns true when it resubmitted; false when the caller should fail the run.
 */
export async function resubmitAfterStaleNonce(
  page: Page,
  cta: Locator,
  log: (m: string) => void,
  retriesUsed: number,
): Promise<boolean> {
  if (retriesUsed >= STALE_NONCE_RETRY_LIMIT) return false;
  const staleNonce = await page
    .getByText(STALE_NONCE_RX)
    .first()
    .isVisible()
    .catch(() => false);
  if (!staleNonce) return false;

  log(
    `⚠️ The wallet signed with a stale nonce (known issue #2514; nothing was broadcast) — resubmitting in ${STALE_NONCE_RETRY_DELAY_MS / MS_PER_SECOND}s.`,
  );
  await page.waitForTimeout(STALE_NONCE_RETRY_DELAY_MS);
  await cta.click({ timeout: STEP_TIMEOUT_MS });
  await page
    .getByText(TX_FAILED_RX)
    .first()
    .waitFor({ state: "hidden", timeout: STEP_TIMEOUT_MS })
    .catch((error: unknown) => {
      throw new Error(
        `Resubmitted after a stale nonce, but the "Transaction failed" callout did not clear within ${STEP_TIMEOUT_MS / MS_PER_SECOND}s.`,
        { cause: error },
      );
    });
  return true;
}
