/**
 * "Markets" god-mode tab (dev / QA only): the Borrowing Markets Data page.
 *
 * The page's populated layout — several markets, a degraded oracle-price
 * cell, a degraded liquidity/utilization cell — otherwise depends on live
 * devnet reserve state. This toggle injects a fixed set of demo reserves in
 * its place so the layout can be reviewed without a wallet or matching
 * on-chain data.
 */
import { useEffect } from "react";

import { setMarketDataOverride } from "@/overrides/marketData";

import { setDemoMarketDataEnabled, useDemoMarketData } from "../demoMarketData";
import {
  PANEL_HINT_CLASS,
  PANEL_SECTION_TITLE_CLASS,
  panelSegmentClass,
} from "../panelChrome";

export function MarketsPanel() {
  const demoMarketData = useDemoMarketData();
  const enabled = demoMarketData !== null;

  useEffect(() => {
    setMarketDataOverride(demoMarketData);
  }, [demoMarketData]);

  return (
    <div className="space-y-2">
      <div className={PANEL_SECTION_TITLE_CLASS}>
        Market Data{enabled && " (demo)"}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDemoMarketDataEnabled(!enabled)}
          className={panelSegmentClass(enabled)}
        >
          {enabled ? "Injected" : "Live"}
        </button>
      </div>
      <p className={PANEL_HINT_CLASS}>
        Substitutes fixed demo reserves (USDC, USDT, WBTC) for the Borrowing
        Markets Data page, including one reserve with a failed oracle-price read
        and one with a failed liquidity read.
      </p>
    </div>
  );
}
