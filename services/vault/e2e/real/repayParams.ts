/**
 * Repay-parameter pre-flight: read which reserves the depositor currently owes on, each one's debt (in
 * token units, incl. accrued interest) and the wallet's balance of that token — the SAME sources the
 * web app's Repay form uses — so the CLI can offer a token menu, validate `--repay-token`, and size a
 * safe default amount before launching the browser.
 *
 * Reuses the borrow pre-flight's on-chain plumbing (no duplication): `fetchAllReserves` for the reserve
 * list (ALL non-vBTC reserves — matching the app's `allBorrowReserves` — NOT the borrowable subset, so a
 * loan on a reserve that has since been paused/frozen still surfaces), `openPosition` for the proxy/client,
 * and `resolveCoreSpoke` for the spoke. Per reserve it reads the SDK's `getUserTotalDebt` and a direct
 * viem `balanceOf`. The aggregate USD debt used by the run.ts no-debt gate + the action's "debt fell"
 * assertion comes from the existing `fetchBorrowContext` — this file stays token-level.
 *
 * Everything here is a best-effort ESTIMATE for a menu default / affordability heads-up — NEVER a hard
 * gate. The live repay form (its Max button + validation) is the authoritative, position-aware limit.
 */
import { getUserTotalDebt } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { type Address, erc20Abi, formatUnits } from "viem";

import { fetchAllReserves, openPosition } from "./borrowParams";
import { type NetworkName } from "./config";
import { resolveCoreSpoke } from "./networkContracts";

/**
 * Default repay = this fraction of the outstanding debt, keeping the repay partial (always affordable
 * from the borrowed principal, and leaving the loan open so the test is repeatable). A full clear stays
 * reachable via `--repay-amount=max` and the form's Max button.
 */
export const CONSERVATIVE_REPAY_FRACTION = 0.25;

/** A reserve the depositor currently owes on — offered in the CLI menu / used to drive the repay form. */
export interface RepayableDebt {
  symbol: string;
  name: string;
  reserveId: bigint;
  tokenAddress: string;
  /** Token (underlying) decimals — what the repay amount is parsed against. */
  decimals: number;
  /** Outstanding debt in token units (incl. accrued interest), from `getUserTotalDebt`. */
  debtTokens: number;
  /** Wallet balance of the debt token, in token units — for the affordability heads-up + amount cap. */
  balanceTokens: number;
}

/** Convert a raw on-chain token amount (smallest unit) to a decimal token count for display/sizing —
 *  via viem's `formatUnits` (no hand-rolled `10 ** decimals`). */
function rawToTokens(raw: bigint, decimals: number): number {
  return Number(formatUnits(raw, decimals));
}

/**
 * Read the reserves this position currently owes on (debt > 0), each with its debt + the wallet's token
 * balance. Iterates ALL non-vBTC reserves (`fetchAllReserves` — matching the app's `allBorrowReserves`,
 * not just the currently-borrowable subset, so a loan on a reserve that has since been paused/frozen is
 * still discovered) and reads on-chain `getUserTotalDebt(spoke, reserveId, proxy)` + `balanceOf(wallet)`
 * per reserve. Returns an empty list when there's no position (nothing borrowed yet) — the run.ts
 * pre-flight turns that into a clear "no debt to repay" error.
 */
export async function fetchRepayableDebts(
  network: NetworkName,
  ethAddress: string,
): Promise<RepayableDebt[]> {
  const reserves = await fetchAllReserves(network);
  const { client, appController, position } = await openPosition(
    network,
    ethAddress,
  );
  if (!position) return [];

  const spoke = await resolveCoreSpoke(client, appController);
  const proxy = position.proxyContract;

  const debts: RepayableDebt[] = [];
  for (const reserve of reserves) {
    const debtRaw = await getUserTotalDebt(
      client,
      spoke,
      reserve.reserveId,
      proxy,
    );
    if (debtRaw <= 0n) continue;
    const balanceRaw = await client.readContract({
      address: reserve.tokenAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [ethAddress as Address],
    });
    debts.push({
      symbol: reserve.symbol,
      name: reserve.name,
      reserveId: reserve.reserveId,
      tokenAddress: reserve.tokenAddress,
      decimals: reserve.decimals,
      debtTokens: rawToTokens(debtRaw, reserve.decimals),
      balanceTokens: rawToTokens(balanceRaw, reserve.decimals),
    });
  }
  return debts;
}
