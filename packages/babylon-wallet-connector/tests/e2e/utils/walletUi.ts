/**
 * Generic, wallet-agnostic Playwright helpers shared by the real-extension wallet importers.
 *
 * These deal with the awkward realities of driving wallet-extension UIs: text nodes with
 * pointer-events:none (click by coordinates), submit buttons that stay disabled until validation
 * passes (wait for enabled), and addresses shown only in truncated form (prefix/suffix matching).
 */
import { type Page } from "@playwright/test";

import { SETTLE, WAIT_FOR } from "./timing";

/** Click the first element whose text matches `re` (best-effort; resolves nothing → returns false). */
export async function clickText(page: Page, re: RegExp, timeout: number = WAIT_FOR.ACTION_MS): Promise<boolean> {
  const loc = page.getByText(re).first();
  if ((await loc.count()) > 0) {
    await loc.click({ timeout }).catch(() => {});
    await page.waitForTimeout(SETTLE.MODAL);
    return true;
  }
  return false;
}

/**
 * Click a real <button> by accessible name, but only once it is enabled. Wallet submit buttons
 * (SRP Continue, Create password, Unlock) stay disabled until their form validates; a plain click on
 * the label span while disabled is silently dropped.
 */
export async function clickWhenEnabled(page: Page, re: RegExp, timeout: number = WAIT_FOR.ACTION_MS): Promise<boolean> {
  const btn = page.getByRole("button", { name: re }).first();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await btn.count()) > 0 && !(await btn.isDisabled().catch(() => true))) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(SETTLE.BRIEF);
      return true;
    }
    await page.waitForTimeout(SETTLE.KEYSTROKE);
  }
  return false;
}

/**
 * Advance past a step whose button is a <div>/<span> with pointer-events:none text: click the LAST
 * match by screen coordinates, which bypasses the text node that swallows element-resolved clicks.
 */
export async function advance(page: Page, re: RegExp): Promise<void> {
  const box = await page.getByText(re).last().boundingBox().catch(() => null);
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
  await page.waitForTimeout(SETTLE.MEDIUM);
}

/** Click the LAST element matching `re` by screen coordinates (robust for div-buttons/rows). */
export async function tap(page: Page, re: RegExp): Promise<boolean> {
  const loc = page.getByText(re).last();
  if ((await loc.count()) === 0) return false;
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
  await page.waitForTimeout(SETTLE.MODAL);
  return true;
}

/** Click the TOPMOST element matching `re` (e.g. a header network pill among several matches). */
export async function tapTopmost(page: Page, re: RegExp): Promise<boolean> {
  const cands = await page.getByText(re).all();
  let best: { x: number; y: number; width: number; height: number } | null = null;
  for (const c of cands) {
    const b = await c.boundingBox().catch(() => null);
    if (b && (!best || b.y < best.y)) best = b;
  }
  if (!best) return false;
  await page.mouse.click(best.x + best.width / 2, best.y + best.height / 2).catch(() => {});
  await page.waitForTimeout(SETTLE.BRIEF);
  return true;
}

/**
 * True if `actual` matches the full `expected` address. `actual` may be full or truncated
 * (`0xAAA…ZZZ` / `0xAAA...ZZZ`); truncated forms are compared by prefix + suffix. Case-insensitive
 * (ETH is EIP-55 checksummed; bech32 is lowercase).
 */
export function addrMatches(actual: string | null, expected: string | null): boolean {
  if (!actual || !expected) return false;
  const a = actual.toLowerCase().replace(/…/g, "...");
  const e = expected.toLowerCase();
  if (a === e) return true;
  if (a.includes("...")) {
    const [pre, suf] = a.split(/\.{2,}/);
    return e.startsWith(pre) && e.endsWith(suf);
  }
  return false;
}

/** Scan the page body for a full (un-truncated) 0x… Ethereum address. */
export async function scanEthAddress(page: Page): Promise<string | null> {
  const body = await page.locator("body").innerText().catch(() => "");
  const m = body.match(/0x[0-9a-fA-F]{40}/);
  return m ? m[0] : null;
}
