import type { BannerSeverity } from "@/applications/aave/positionNotifications";

export const SEVERITY_STYLES: Record<BannerSeverity, string> = {
  red: "border-2 border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
  yellow:
    "border-2 border-yellow-500 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200",
  green:
    "border-2 border-green-500 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200",
  hidden: "",
};

export const GREEN_BANNER_TITLE = "Position optimally structured";
export const GREEN_BANNER_DETAIL =
  "Vault ordering is correct and partial liquidation is enabled.";

export const STALE_PRICE_BANNER_TITLE =
  "Position notifications temporarily unavailable";
export const STALE_PRICE_BANNER_DETAIL =
  "BTC price data is stale or unavailable. Notifications will resume when fresh price data is available.";
