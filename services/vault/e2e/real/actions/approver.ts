/**
 * Context-level auto-approver for wallet extension pop-ups.
 *
 * Every wallet approval — connect, BTC PSBT signing, BTC broadcast, and MetaMask ETH transaction
 * confirmations — opens as a separate `chrome-extension://` page in the same browser context. A single
 * `context.on("page")` handler centers each pop-up (so a human can watch) and clicks its primary
 * approve/confirm control across several rounds. It is deliberately generous: connect fires one pop-up,
 * but a peg-in fires many — BTC signing pop-ups at DERIVE_VAULT_SECRET(1), SIGN_PEGIN_BTC(2),
 * SIGN_POP(3), BROADCAST_PRE_PEGIN(5), SIGN_AUTH_ANCHOR(9), SIGN_PAYOUTS(10), SIGN_DEPOSITOR_GRAPH(11),
 * RETRIEVE_SECRET(13), and MetaMask tx confirmations at SUBMIT_PEGIN(4) + ACTIVATE_VAULT(14) — so the
 * same handler must cover every wallet's control shapes:
 *   - MetaMask: real <button> matched by role name (Confirm/Approve/Next/Sign), plus stable testids
 *     on its tx-confirm + gas screens (`confirm-footer-button`, `page-container-footer-next`).
 *   - UniSat: styled <div preset="primary">, plus two peg-in-only shapes: the "use at your own risk"
 *     gate on SIGN_PEGIN_BTC (a text input that must read CONFIRM before the <div preset="danger">
 *     Confirm enables — see fillUnisatRiskGate), and the batch <div preset="primaryV2"> "Sign all N
 *     transactions at once" on the payout/graph steps.
 *   - OKX: OKD-styled <button data-testid="okd-button">.
 *   - OneKey: real <button>, gated on an insecure-origin consent checkbox (see tickConsent).
 *
 * The handler guards everything: a pop-up that closes mid-approve (the expected outcome of approving)
 * must never reject and crash the run.
 */
import type { BrowserContext, Page } from "@playwright/test";

import {
  APPROVE_CLICK_TIMEOUT_MS,
  APPROVE_ROUND_MS,
  APPROVE_ROUNDS,
} from "../timing";
import { centerWindow } from "../windowUtils";

/** Accessible-name pattern for the approve/confirm/sign control across wallets. */
const APPROVE_NAME_RX =
  /^(connect|approve|next|confirm|sign|broadcast|got it)$/i;

/** MetaMask's tx-confirm and gas/next screens expose these stable testids on the primary button. */
const METAMASK_PRIMARY_TESTIDS = [
  '[data-testid="confirm-footer-button"]',
  '[data-testid="page-container-footer-next"]',
].join(", ");

/**
 * UniSat's styled (non-<button>) approve controls, in click priority. `primaryV2` is the batch
 * "Sign all N transactions at once" button (payout/graph steps) — preferred over the plain `primary`
 * "(x/y) Signed" so batch signing actually completes; `okd-button` is OKX's primary control.
 */
const STYLED_APPROVE_SELECTORS = [
  '[preset="primaryV2"]',
  '[preset="primary"]',
  'button[data-testid="okd-button"]',
];

/** UniSat's "use at your own risk" gate (SIGN_PEGIN_BTC): a danger Confirm behind a text input. */
const UNISAT_RISK_DANGER = '[preset="danger"]';
const UNISAT_RISK_INPUT = 'input[preset="text"]';
/** The exact word UniSat requires typed into the risk input before its danger Confirm enables. */
const UNISAT_RISK_CONFIRM_WORD = "CONFIRM";

const readLabel = async (
  loc: ReturnType<Page["locator"]>,
  fallback: string,
): Promise<string> =>
  (await loc.textContent().catch(() => ""))?.trim() || fallback;

/**
 * Satisfy UniSat's "use at your own risk" gate on the peg-in BTC signing step: its danger Confirm
 * stays disabled until the literal word CONFIRM is typed into the risk input. No-op on every other
 * screen (double-gated on the danger control AND the risk input being present), and idempotent — it
 * only types when the field isn't already CONFIRM, so re-entering it across approve rounds is safe.
 */
async function fillUnisatRiskGate(popup: Page): Promise<void> {
  const danger = popup.locator(UNISAT_RISK_DANGER).first();
  if (!(await danger.isVisible().catch(() => false))) return;
  const input = popup.locator(UNISAT_RISK_INPUT).first();
  if (!(await input.isVisible().catch(() => false))) return;
  const current = (await input.inputValue().catch(() => "")) ?? "";
  if (current.trim().toUpperCase() === UNISAT_RISK_CONFIRM_WORD) return;
  await input.fill(UNISAT_RISK_CONFIRM_WORD).catch(() => {});
}

/**
 * Click UniSat's / OKX's styled (non-<button>) approve control. Tries the risk-gate danger Confirm
 * first — but only when it reads as a confirm/sign, never a destructive "reject"-style danger — then
 * the batch and plain primary controls in {@link STYLED_APPROVE_SELECTORS}. Returns the clicked
 * control's text, or null if none matched.
 */
async function clickStyledApprove(popup: Page): Promise<string | null> {
  const danger = popup.locator(UNISAT_RISK_DANGER).first();
  if (await danger.isVisible().catch(() => false)) {
    const text = (await danger.textContent().catch(() => ""))?.trim() ?? "";
    if (APPROVE_NAME_RX.test(text)) {
      await danger.click({ force: true }).catch(() => {});
      return text || "(danger)";
    }
  }
  for (const selector of STYLED_APPROVE_SELECTORS) {
    const control = popup.locator(selector).last();
    if (!(await control.isVisible().catch(() => false))) continue;
    const name = await readLabel(control, "(primary)");
    await control.click({ force: true }).catch(() => {});
    return name;
  }
  return null;
}

/**
 * Try every known "approve/confirm" control shape inside an extension pop-up. Returns the accessible
 * name/text of the control it clicked (so the caller can log WHAT it approved — an unexpected extra
 * prompt should be visible in the log, not silently confirmed), or null if nothing matched.
 */
export async function clickApprove(popup: Page): Promise<string | null> {
  const byRole = popup.getByRole("button", { name: APPROVE_NAME_RX }).first();
  if (await byRole.isVisible().catch(() => false)) {
    const name = await readLabel(byRole, "(button)");
    // Bounded timeout: if the button is still disabled (e.g. an unticked consent checkbox), fail fast
    // and let the next round retry after tickConsent runs, rather than blocking on the 30s default.
    await byRole.click({ timeout: APPROVE_CLICK_TIMEOUT_MS }).catch(() => {});
    return name;
  }
  const mmPrimary = popup.locator(METAMASK_PRIMARY_TESTIDS).first();
  if (await mmPrimary.isVisible().catch(() => false)) {
    const name = await readLabel(mmPrimary, "(metamask-primary)");
    await mmPrimary
      .click({ timeout: APPROVE_CLICK_TIMEOUT_MS })
      .catch(() => {});
    return name;
  }
  // UniSat / OKX styled controls. Satisfy the "use at your own risk" gate first so the danger Confirm
  // it guards can be clicked in this same round (or the next, once UniSat enables it).
  await fillUnisatRiskGate(popup);
  const styled = await clickStyledApprove(popup);
  if (styled) return styled;
  const byText = popup.getByText(APPROVE_NAME_RX, { exact: true }).last();
  if (await byText.isVisible().catch(() => false)) {
    const name = await readLabel(byText, "(text)");
    await byText.click({ force: true }).catch(() => {});
    return name;
  }
  return null;
}

/**
 * Tick the consent control that gates the approve button, if one is present. OneKey on an insecure
 * `http://localhost` origin shows "Proceed at my own risk" and keeps Approve `aria-disabled` until it's
 * ticked. That control is a custom element (a `div` with a stable testid, NOT a real checkbox — hence
 * no `role="checkbox"`). We click it only while Approve is still disabled: clicking toggles it, so the
 * `aria-disabled` gate keeps this idempotent across rounds, and it is a no-op on secure origins / other
 * wallets that have no such gate.
 */
export async function tickConsent(popup: Page): Promise<void> {
  const approve = popup.getByRole("button", { name: /^approve$/i }).first();
  if (!(await approve.isVisible().catch(() => false))) return;
  const gated =
    (await approve.getAttribute("aria-disabled").catch(() => null)) === "true";
  if (!gated) return;
  const consent = popup
    .locator('[data-testid="dapp-connection-continue-operate-checkbox"]')
    .first();
  if (await consent.isVisible().catch(() => false))
    await consent
      .click({ force: true, timeout: APPROVE_CLICK_TIMEOUT_MS })
      .catch(() => {});
}

/**
 * Center + auto-approve any extension approval pop-up that opens while installed. Returns the handler
 * so the caller can `context.off("page", handler)` when the approval phase ends (e.g. observe mode
 * uninstalls it after connect so the human approves the peg-in manually).
 */
export function installPopupApprover(
  context: BrowserContext,
  log: (m: string) => void,
): (p: Page) => void {
  const handler = (popup: Page) => {
    // Detached listener: guard EVERYTHING — a popup that closes mid-approve must never reject and crash
    // the process (the whole point of approving is that the popup then vanishes).
    void (async () => {
      try {
        // Wait for load FIRST, then filter: extension approval windows are opened by the service
        // worker and their URL is `about:blank` until the navigation commits — checking the URL at
        // 'page'-event time would skip the popup permanently.
        await popup.waitForLoadState("domcontentloaded").catch(() => {});
        if (!popup.url().startsWith("chrome-extension://")) return;
        await centerWindow(popup);
        const file = popup.url().split("/").pop();
        for (let round = 0; round < APPROVE_ROUNDS; round++) {
          if (popup.isClosed()) break;
          await popup.waitForTimeout(APPROVE_ROUND_MS).catch(() => {});
          if (popup.isClosed()) break;
          await tickConsent(popup).catch(() => {});
          const clicked = await clickApprove(popup).catch(() => null);
          if (!clicked) break;
          log(`Approved "${clicked}" in wallet popup ${file}`);
        }
      } catch {
        // popup vanished (approved) or navigated — nothing to do.
      }
    })();
  };
  context.on("page", handler);
  return handler;
}
