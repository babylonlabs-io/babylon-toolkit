/**
 * Shell-level "active overrides" chip (dev / QA only): a pinned strip in the
 * panel header listing every ACTIVE override across every dev store, with a
 * per-item clear and a "Reset all to live" button.
 *
 * Reads (and clears) the SAME dev stores each tab writes — never
 * `src/overrides/*` directly. Clearing an override store straight from here
 * would desync it from whichever tab's own publish effect is still mounted
 * (every tab stays mounted while the panel is open; see `GodModePanel`), so
 * every clear routes back through the dev-store setter that effect reads.
 *
 * Theme is a preview convenience, not an override — excluded on purpose.
 */
import { COPY } from "@/copy";

import {
  setDebugBorrowCapacityStateOverride,
  setDebugHealthFactorOverride,
  setDebugManualMode,
  setDebugMaxVaultsOverride,
  setDebugProtocolStatusOverride,
  setDebugSimulateStalePrice,
  useDebugBorrowCapacityStateOverride,
  useDebugHealthFactorOverride,
  useDebugManualMode,
  useDebugMaxVaultsOverride,
  useDebugProtocolStatusOverride,
  useDebugSimulateStalePrice,
} from "./debugPositionStore";
import {
  setArtifactDownloadMockEnabled,
  useArtifactDownloadMockEnabled,
} from "./demoArtifactDownload";
import { setDemoEnabled, useDemoEnabled } from "./demoDeposit";
import { setDemoMarketDataEnabled, useDemoMarketData } from "./demoMarketData";
import {
  setLiquidationDebugState,
  setLiquidationPositionOverrideEnabled,
  useLiquidationDebugState,
  useLiquidationPositionOverrideEnabled,
} from "./liquidationDebugStore";
import { PANEL_BUTTON_CLASS } from "./panelChrome";

interface ActiveOverride {
  id: string;
  label: string;
  clear: () => void;
}

function useActiveOverrides(): ActiveOverride[] {
  const manualMode = useDebugManualMode();
  const simulateStalePrice = useDebugSimulateStalePrice();
  const healthFactorOverride = useDebugHealthFactorOverride();
  const borrowCapacityOverride = useDebugBorrowCapacityStateOverride();
  const maxVaultsOverride = useDebugMaxVaultsOverride();
  const protocolStatusOverride = useDebugProtocolStatusOverride();
  const liquidationCardState = useLiquidationDebugState();
  const liquidationPositionOverrideEnabled =
    useLiquidationPositionOverrideEnabled();
  const demoEnabled = useDemoEnabled();
  const artifactMockEnabled = useArtifactDownloadMockEnabled();
  const marketDataDemo = useDemoMarketData();

  const items: ActiveOverride[] = [];

  if (manualMode || simulateStalePrice) {
    items.push({
      id: "cascade",
      label: simulateStalePrice ? "Cascade: stale price" : "Cascade: simulated",
      clear: () => {
        setDebugManualMode(false);
        setDebugSimulateStalePrice(false);
      },
    });
  }
  if (healthFactorOverride !== null) {
    items.push({
      id: "health-factor",
      label: `Health factor: ${healthFactorOverride}`,
      clear: () => setDebugHealthFactorOverride(null),
    });
  }
  if (borrowCapacityOverride !== null) {
    items.push({
      id: "borrow-capacity",
      label: `Borrow capacity: ${borrowCapacityOverride}`,
      clear: () => setDebugBorrowCapacityStateOverride(null),
    });
  }
  if (maxVaultsOverride !== null) {
    items.push({
      id: "max-vaults",
      label: COPY.liquidationWarnings.maxVaults.titleV3,
      clear: () => setDebugMaxVaultsOverride(null),
    });
  }
  if (protocolStatusOverride !== null) {
    items.push({
      id: "protocol-status",
      label: `Protocol status: ${protocolStatusOverride}`,
      clear: () => setDebugProtocolStatusOverride(null),
    });
  }
  if (liquidationCardState !== "auto") {
    items.push({
      id: "liquidation-card",
      label: `Liquidation card: ${liquidationCardState}`,
      clear: () => setLiquidationDebugState("auto"),
    });
  }
  if (liquidationPositionOverrideEnabled) {
    items.push({
      id: "liquidation-stats",
      label: "Liquidations stat cards",
      clear: () => setLiquidationPositionOverrideEnabled(false),
    });
  }
  if (demoEnabled) {
    items.push({
      id: "demo-mocks",
      label: "Demo mocks injected",
      clear: () => setDemoEnabled(false),
    });
  }
  if (artifactMockEnabled) {
    items.push({
      id: "artifact-download",
      label: "Artifact download mock",
      clear: () => setArtifactDownloadMockEnabled(false),
    });
  }
  if (marketDataDemo !== null) {
    items.push({
      id: "market-data",
      label: "Market data mock",
      clear: () => setDemoMarketDataEnabled(false),
    });
  }

  return items;
}

export function SummaryChip() {
  const items = useActiveOverrides();
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 p-2">
      {items.map((item) => (
        <span
          key={item.id}
          className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200"
        >
          {item.label}
          <button
            type="button"
            onClick={item.clear}
            aria-label={`Clear ${item.label}`}
            className="text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => items.forEach((item) => item.clear())}
        className={PANEL_BUTTON_CLASS}
      >
        Reset all to live
      </button>
    </div>
  );
}
