import { fmt } from "./format";
import type { Vault, Warning } from "./types";

export function buildCliffSingleVaultWarning(
  vault: Vault,
  suggestedBtc: number | null,
  rawBtc: number,
): Warning {
  let suggestion: string;
  if (suggestedBtc !== null) {
    suggestion = `Add a ${suggestedBtc.toFixed(2)} BTC sacrificial vault at position 1 — your current vault (${vault.btc.toFixed(2)} BTC) becomes protected.`;
  } else {
    suggestion = `To enable partial liquidation, add ≥ ${fmt(rawBtc)} BTC as a sacrificial vault. You can also add collateral or repay part of the debt to keep this position safe. Alternatively: repay the loan, split BTC into optimal UTXOs, and re-open with a sacrificial vault.`;
  }
  return {
    type: "cliff",
    title: "No backup vault",
    detail:
      "Your vault will be fully seized at liquidation — nothing is protected behind it.",
    suggestion,
  };
}

export function buildCliff2VaultWarning(
  targetSeizureBtc: number,
  enablePartialStr: string,
): Warning {
  return {
    type: "cliff",
    title: "Both vaults seized together — no partial protection",
    detail: `Neither vault alone covers the target seizure (${targetSeizureBtc.toFixed(2)} BTC). Both will be liquidated in one event.`,
    suggestion: `${enablePartialStr}You can also add collateral or repay part of the debt to keep this position safe. Alternatively: repay the loan, split BTC into optimal UTXOs, and re-open with a sacrificial vault.`,
  };
}

export function buildCliff3PlusWarning(
  nVaults: number,
  hasReorderFix: boolean,
  orderStr: string,
): Warning {
  return {
    type: "cliff",
    title: "All vaults seized in one liquidation event",
    detail: `All ${nVaults} vaults land in Group 1 — no protected vaults remain after first liquidation. ${hasReorderFix ? "Reordering vaults will fix this." : "No combination of vaults covers the target seizure alone."}`,
    suggestion: hasReorderFix ? `Suggested order: ${orderStr}` : undefined,
  };
}

export function buildReorderDetail(
  sumImproves: boolean,
  savedSum: number,
  savedBtcAfterG1: number,
  currentG1Btc?: number,
  optimalG1Btc?: number,
): string {
  const g1Part =
    currentG1Btc !== undefined && optimalG1Btc !== undefined
      ? `Current order seizes ${currentG1Btc.toFixed(2)} BTC in Group 1. Optimal order seizes only ${optimalG1Btc.toFixed(2)} BTC. `
      : "";
  if (sumImproves) {
    return `${g1Part}Reordering leaves more BTC protected after each liquidation event (+${savedSum.toFixed(3)} BTC-events total).`;
  }
  return `${g1Part}Reordering leaves ${savedBtcAfterG1.toFixed(3)} more BTC protected after the first liquidation event.`;
}

export function buildRebalanceWarning(
  g1CombinedBtc: number,
  g1TargetSeizure: number,
  g1OverSeizure: number,
  rebalanceImprovementBtc: number,
  suggestedRebalanceVaultBtc: number | null,
  suggestedRebalanceOrder: Vault[] | null,
  vaults: Vault[],
  totalBtc: number,
  liqFactor: number,
): Warning {
  const detail = `Group 1 seizes ${fmt(g1CombinedBtc)} BTC but target is only ${fmt(g1TargetSeizure)} BTC — over-seizure of ${fmt(g1OverSeizure)} BTC. With optimal vault sizes, ${fmt(rebalanceImprovementBtc)} more BTC would be protected.`;

  let suggestion = "";
  if (suggestedRebalanceVaultBtc !== null && suggestedRebalanceOrder !== null) {
    const largest = vaults.reduce((a, b) => (a.btc > b.btc ? a : b));
    const smallVaults = vaults.filter((v) => v.id !== largest.id);
    const smallNames = smallVaults.map((v) => v.name).join(" + ");
    suggestion = `Add a ${fmt(suggestedRebalanceVaultBtc)} BTC vault and place it with ${smallNames} at the front — together they cover the target seizure, protecting ${largest.name} (${fmt(largest.btc)} BTC).`;
    suggestion +=
      " You can also add collateral or repay part of the debt to keep this position safe.";
    suggestion +=
      " Alternatively: repay the loan, split BTC into optimal UTXOs, and re-open the position.";
  } else {
    suggestion = `Repay the loan, split BTC into optimal UTXOs (sacrificial ~${fmt(totalBtc * Math.min(liqFactor, 1))} BTC + protected), and re-open the position.`;
  }

  return {
    type: "rebalance",
    title: "Vault sizes can be improved",
    detail,
    suggestion,
  };
}
