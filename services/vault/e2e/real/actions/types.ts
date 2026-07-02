/**
 * The pluggable "action" contract. Each step of the depositor lifecycle (connect → pegin → borrow →
 * repay → withdraw) is an Action. Today only `connect` is implemented; the interface is intentionally
 * small so future actions drop in, and `ActionContext.delayMs` gives them the mock-mode inter-step
 * pause the CLI collects (a no-op for the single-step real connect).
 */
import type { BrowserContext, Page } from "@playwright/test";

import type { ActionId, BtcWalletId, EthWalletId, RunConfig } from "../config";

export interface ActionContext {
  page: Page;
  context: BrowserContext;
  config: RunConfig;
  log: (message: string) => void;
  artifactsDir: string;
  /** Artificial delay applied at each "waiting" seam (mock-only; 0 for real). */
  delayMs: number;
  btc: { id: BtcWalletId; address: string };
  eth: { id: EthWalletId; address: string };
}

export interface Action {
  id: ActionId;
  run(ctx: ActionContext): Promise<void>;
}

/** Sleep the mock-mode inter-step delay, if any. No-op when delayMs is 0 (real mode). */
export async function waitSeam(
  ctx: ActionContext,
  label: string,
): Promise<void> {
  if (ctx.delayMs <= 0) return;
  ctx.log(`(mock delay ${ctx.delayMs}ms before: ${label})`);
  await ctx.page.waitForTimeout(ctx.delayMs);
}
