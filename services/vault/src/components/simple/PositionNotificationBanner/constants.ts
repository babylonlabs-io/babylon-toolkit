import type { BannerSeverity } from "@/applications/aave/positionNotifications";

export const SEVERITY_STYLES: Record<BannerSeverity, string> = {
  red: "border-2 border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
  yellow:
    "border-2 border-yellow-500 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200",
  green:
    "border-2 border-green-500 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200",
  // Muted advisory tone for soft warnings (weird-params): protocol params are
  // governance-set, so this is informational rather than actionable.
  soft: "border border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  hidden: "",
};

export const GREEN_BANNER_TITLE = "Position optimally structured";
export const GREEN_BANNER_DETAIL =
  "BTC Vault ordering is correct and partial liquidation is enabled.";

export const STALE_PRICE_BANNER_TITLE =
  "Position notifications temporarily unavailable";
export const STALE_PRICE_BANNER_DETAIL =
  "BTC price data is stale or unavailable. Notifications will resume when fresh price data is available.";
