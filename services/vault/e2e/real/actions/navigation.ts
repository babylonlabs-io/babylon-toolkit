/**
 * Section navigation for the v3 UI.
 *
 * The v2 dashboard put deposit, collateral, pending deposits and the loan CTAs on ONE page, so the
 * actions never navigated. v3 splits them across routes (see markdown/e2e-v3/00-overview.md):
 *   /        overview — connect entry only
 *   /vaults  deposit CTA, pending-deposit rows + resume CTA, active vault rows, per-row Withdraw
 *   /loans   Borrow + Repay CTAs
 * so every action now opens its flow from a specific section.
 *
 * We CLICK the sidebar nav link rather than `page.goto`: a goto is a full reload, which re-hydrates
 * wagmi/AppKit and drops in-memory deposit state. Chained runs (`withdraw --borrow-first --pegin-first`)
 * navigate mid-lifecycle, so a reload there would be a real hazard; the nav link is a client-side route
 * change. The `a[href]` fallback keeps a run working against a deployed build that predates the testids.
 */
import type { Page } from "@playwright/test";

import { FORM_SETTLE_MS, MS_PER_SECOND, STEP_TIMEOUT_MS } from "../timing";

import { firstByTestid } from "./selectors";

/** The sections the actions navigate to (ids + paths mirror src/config/v3Navigation.ts). */
export const SECTION_PATHS = {
  overview: "/",
  vaults: "/vaults",
  loans: "/loans",
} as const;

export type SectionId = keyof typeof SECTION_PATHS;

/** Whether the browser is already showing `path` (pathname only — the loan overlays add ?search). */
function isOnSection(page: Page, path: string): boolean {
  try {
    return new URL(page.url()).pathname === path;
  } catch {
    return false; // about:blank / a non-URL page — treat as "not there yet"
  }
}

/**
 * Navigate to a v3 section by clicking its sidebar link, and wait for the route to settle. Idempotent:
 * a no-op when the page is already on that section, so every action can navigate unconditionally
 * (including the chained legs, which start from wherever the previous leg finished).
 *
 * THROWS when the link never appears. RootLayout renders the sidebar only when
 * `!isMobileView && !isEntryLayout`, so an absent link almost always means the app is not connected
 * yet (the entry layout hides it) — a clearer failure than the flow's own "control not found" a step
 * later. The runs are maximized, so the mobile branch (nav behind a drawer) doesn't apply.
 */
export async function goToSection(
  page: Page,
  section: SectionId,
  log: (m: string) => void,
): Promise<void> {
  const path = SECTION_PATHS[section];
  if (isOnSection(page, path)) return;

  const link = firstByTestid(
    page,
    `[data-testid="nav-${section}"]`,
    page.locator(`a[href="${path}"]`),
  );
  const appeared = await link
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared)
    throw new Error(
      `Could not navigate to ${path}: its sidebar link never appeared within ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s. The sidebar is hidden on the disconnected entry screen, so this usually means the app is not in the connected state.`,
    );

  log(`Navigating to ${path}`);
  await link.click({ timeout: STEP_TIMEOUT_MS });

  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (isOnSection(page, path)) return;
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `Clicked the ${path} nav link but the route stayed on ${page.url()} after ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s.`,
  );
}
