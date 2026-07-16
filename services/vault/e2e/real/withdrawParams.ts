/**
 * Withdraw-parameter pre-flight: read the depositor's active BTC-Vault collateral + outstanding debt for
 * the selected network — the SAME on-chain sources the web app uses — so the CLI can refuse a doomed
 * withdraw (no collateral) and warn when debt would health-factor-gate the release, before launching the
 * browser.
 *
 * Withdraw releases collateral via a single on-chain `withdrawCollaterals(vaultIds)` tx (no BTC signing;
 * the vault provider drives the Bitcoin payout off-chain afterward). A vault is withdrawable while the
 * projected health factor stays ≥ 1.0 — so with NO debt every active vault is freely withdrawable
 * (mirrors src/applications/aave/utils/withdrawEligibility.ts). This read is best-effort: the live
 * Withdraw modal (its per-vault checkbox eligibility + the Review HF gate) is authoritative.
 */
import { fetchBorrowContext, openPosition } from "./borrowParams";
import { type NetworkName } from "./config";

/** The depositor's withdraw-relevant on-chain state (active collateral + debt). */
export interface WithdrawContext {
  /** True when the position holds active BTC-Vault collateral (`totalCollateralBTC > 0`) — the same
   *  condition that makes the Collateral "⋯" → Withdraw menu meaningful. */
  hasCollateral: boolean;
  /** On-chain BTC collateral in sats (`getPosition.totalCollateralBTC`); falls after a withdraw. */
  collateralSats: bigint;
  /** Number of active BTC Vaults in the position (each a selectable row in the Withdraw modal). */
  vaultCount: number;
  /** True when the position carries outstanding debt — withdraw is then HF-gated (repay first to clear). */
  hasDebt: boolean;
  /** Aggregate outstanding debt in USD (0 when none). */
  currentDebtUsd: number;
}

/**
 * Read the depositor's active collateral + debt on `network`. Uses the same on-chain reads as the
 * borrow/repay pre-flights (`openPosition` for the vault list + sats, `fetchBorrowContext` for the
 * aggregate debt). Returns a `hasCollateral:false` context when the position doesn't exist / holds no
 * collateral. THROWS on a genuine read failure rather than defaulting (the caller treats this as best-
 * effort and warns).
 */
export async function fetchWithdrawContext(
  network: NetworkName,
  ethAddress: string,
): Promise<WithdrawContext> {
  const { position } = await openPosition(network, ethAddress);
  if (!position || position.totalCollateralBTC <= 0n)
    return {
      hasCollateral: false,
      collateralSats: 0n,
      vaultCount: 0,
      hasDebt: false,
      currentDebtUsd: 0,
    };

  const { currentDebtUsd } = await fetchBorrowContext(network, ethAddress);
  return {
    hasCollateral: true,
    collateralSats: position.totalCollateralBTC,
    vaultCount: position.vaultIds.length,
    hasDebt: currentDebtUsd > 0,
    currentDebtUsd,
  };
}
