/**
 * Shared liquidation-cascade simulator (dev / QA only), used by both the
 * Position and Liquidations tabs — the two duplicated cascade UIs the old
 * `PositionNotificationsDebugPanel` and `LiquidationAnalysisDebugPanel`
 * hand-rolled around the same store now collapse into this one component.
 *
 * `CascadeSimulator` is pure UI: it reads/writes `debugPositionStore` and
 * renders the Live/Simulated control + banner preview. It never publishes to
 * `@/overrides/position` itself — every tab that shows it is mounted at once
 * (see `GodModePanel`'s header comment), so two simultaneous instances would
 * both run the publish effect and race each other's unmount-clear.
 * `CascadeOverridePublisher` owns that effect instead, mounted exactly once
 * by the shell, gated the same way the old standalone section was.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  usePositionNotifications,
  type PositionNotificationsStatus,
} from "@/applications/aave/hooks/usePositionNotifications";
import {
  calculate,
  deriveBannerState,
  fmt,
  fmtUsd,
  type BannerSeverity,
  type CalculatorParams,
  type CalculatorResult,
  type LiquidationGroup,
  type Vault,
  type Warning,
  type WarningType,
} from "@/applications/aave/positionNotifications";
import { useETHWallet } from "@/context/wallet";
import { setPositionCascadeOverride } from "@/overrides/position";

import {
  DEBUG_DEFAULT_CF,
  DEBUG_DEFAULT_EXPECTED_HF,
  DEBUG_DEFAULT_MAX_LB,
  DEBUG_DEFAULT_THF,
  DEBUG_PRESETS,
  applyDebugPreset,
  resetDebugManualParams,
  setDebugManualMode,
  setDebugManualParams,
  setDebugSimulateStalePrice,
  useDebugManualMode,
  useDebugManualParams,
  useDebugSimulateStalePrice,
} from "../debugPositionStore";
import {
  PANEL_BUTTON_CLASS,
  PANEL_HINT_CLASS,
  PANEL_INPUT_CLASS,
  PANEL_LABEL_CLASS,
  PANEL_SECTION_CLASS,
  PANEL_SECTION_TITLE_CLASS,
} from "../panelChrome";
import { positionDebugGate } from "../registry";

import { SegmentButton } from "./segmentButton";

// Severity tints for the banner preview. Dark-only (no light variants): the
// god-mode box is a fixed zinc surface regardless of the app's theme.
const SEVERITY_COLORS: Record<BannerSeverity, string> = {
  red: "border-red-500 bg-red-500/15 text-red-200",
  yellow: "border-yellow-500 bg-yellow-500/15 text-yellow-200",
  soft: "border-zinc-600 bg-zinc-800/60 text-zinc-400",
  green: "border-green-500 bg-green-500/15 text-green-200",
  hidden: "border-zinc-700 bg-zinc-800/40 text-zinc-500",
};

const WARNING_TYPE_COLORS: Record<WarningType, string> = {
  urgent: "bg-red-600 text-white",
  cliff: "bg-orange-600 text-white",
  reorder: "bg-yellow-500 text-black",
  dust: "bg-zinc-600 text-white",
  "weird-params": "bg-blue-500 text-white",
  "too-many-vaults": "bg-teal-600 text-white",
};

const STATUS_MESSAGES: Record<
  Exclude<PositionNotificationsStatus, "ready">,
  string
> = {
  loading: "Loading position data...",
  "no-wallet": "Wallet not connected",
  "no-vaults": "No collateral vaults found",
  "no-price": "Waiting for BTC price...",
  "stale-price": "BTC price is stale or unavailable",
};

// The panel lives inside the ~420px god-mode box, so every layout here is
// container-sized: full-width inputs in a fixed 2-column grid. Viewport `md:`
// breakpoints would fire on a wide window and overflow the narrow box.
const FIELD_GRID_CLASS = "grid grid-cols-2 gap-x-3 gap-y-2";
const PRESET_BUTTON_CLASS = `${PANEL_BUTTON_CLASS} text-zinc-200 hover:bg-zinc-800`;

/** Initial counter for generated vault IDs (avoids collision with default vaults) */
const INITIAL_VAULT_ID_COUNTER = 100;

function WarningBadge({ type }: { type: WarningType }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${WARNING_TYPE_COLORS[type]}`}
    >
      {type}
    </span>
  );
}

function WarningCard({ warning }: { warning: Warning }) {
  return (
    <div className="rounded border border-zinc-700 bg-zinc-800/60 p-3">
      <div className="mb-1 flex items-center gap-2">
        <WarningBadge type={warning.type} />
        <span className="font-medium">{warning.title}</span>
      </div>
      <p className="text-sm text-zinc-300">{warning.detail}</p>
      {warning.suggestion && (
        <p className="mt-1 text-sm font-medium text-sky-300">
          {warning.suggestion}
        </p>
      )}
    </div>
  );
}

function GroupRow({ group }: { group: LiquidationGroup }) {
  return (
    <tr className={group.isFullLiquidation ? "bg-red-950/40" : ""}>
      <td className="px-2 py-1 text-center">{group.index}</td>
      <td className="px-2 py-1">
        {group.vaults.map((v) => v.name).join(", ")}
      </td>
      <td className="px-2 py-1 text-right">{fmt(group.combinedBtc, 4)}</td>
      <td className="px-2 py-1 text-right">{fmtUsd(group.liquidationPrice)}</td>
      <td className="px-2 py-1 text-right">
        {fmt(Math.abs(group.distancePct), 1)}%
      </td>
      <td className="px-2 py-1 text-right">{fmt(group.targetSeizureBtc, 4)}</td>
      <td className="px-2 py-1 text-right">{fmt(group.overSeizureBtc, 4)}</td>
      <td className="px-2 py-1 text-right">{fmtUsd(group.debtRepaid)}</td>
      <td className="px-2 py-1 text-right">
        {fmt(group.btcRemainingAfter, 4)}
      </td>
    </tr>
  );
}

function VaultOrderDisplay({
  label,
  vaults,
}: {
  label: string;
  vaults: Vault[];
}) {
  return (
    <div className="text-sm">
      <span className="font-medium">{label}:</span>{" "}
      {vaults.map((v) => `${v.name} (${fmt(v.btc, 4)})`).join(" → ")}
    </div>
  );
}

function ResultPanel({ result }: { result: CalculatorResult }) {
  const banner = deriveBannerState(result);

  return (
    <div className="space-y-4">
      {/* Banner Preview */}
      <div
        className={`rounded-lg border-2 p-3 ${SEVERITY_COLORS[banner.severity]}`}
      >
        <div className="text-sm font-semibold">
          Banner: {banner.severity.toUpperCase()}
        </div>
        {banner.primaryWarning && (
          <div className="mt-1 text-sm">
            <strong>{banner.primaryWarning.title}</strong> —{" "}
            {banner.primaryWarning.detail}
          </div>
        )}
        {banner.secondaryWarnings.length > 0 && (
          <div className="mt-1 text-xs opacity-80">
            + {banner.secondaryWarnings.length} secondary warning(s)
          </div>
        )}
      </div>

      {/* Protocol Parameters */}
      <details open>
        <summary className="cursor-pointer font-medium">
          Protocol Parameters
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            HF: <strong>{fmt(result.currentHF, 3)}</strong>
          </div>
          <div>
            Collateral: <strong>{fmtUsd(result.collateralValue)}</strong>
          </div>
          <div>
            Target Seizure:{" "}
            <strong>{fmt(result.targetSeizureBtc, 4)} BTC</strong>
          </div>
        </div>
      </details>

      {/* Liquidation Groups */}
      {result.groups.length > 0 && (
        <details open>
          <summary className="cursor-pointer font-medium">
            Liquidation Groups ({result.groups.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700 text-left">
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Vaults</th>
                  <th className="px-2 py-1 text-right">BTC</th>
                  <th className="px-2 py-1 text-right">Liq $</th>
                  <th className="px-2 py-1 text-right">Dist%</th>
                  <th className="px-2 py-1 text-right">Target</th>
                  <th className="px-2 py-1 text-right">Over</th>
                  <th className="px-2 py-1 text-right">Repaid</th>
                  <th className="px-2 py-1 text-right">Remain</th>
                </tr>
              </thead>
              <tbody>
                {result.groups.map((g) => (
                  <GroupRow key={g.index} group={g} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <details open>
          <summary className="cursor-pointer font-medium">
            Warnings ({result.warnings.length})
          </summary>
          <div className="mt-2 space-y-2">
            {result.warnings.map((w, i) => (
              <WarningCard key={i} warning={w} />
            ))}
          </div>
        </details>
      )}

      {/* Suggested order (manual "Apply Optimal Order") */}
      {result.optimalVaultOrder && (
        <details open>
          <summary className="cursor-pointer font-medium">Suggestions</summary>
          <div className="mt-2 space-y-2 text-sm">
            <VaultOrderDisplay
              label="Suggested order"
              vaults={result.optimalVaultOrder}
            />
          </div>
        </details>
      )}
    </div>
  );
}

function renameVaults(vaults: Vault[]): Vault[] {
  return vaults.map((v, i) => ({ ...v, name: `Vault ${i + 1}` }));
}

function ManualInputPanel({
  params,
  onParamsChange,
}: {
  params: CalculatorParams;
  onParamsChange: (p: CalculatorParams) => void;
}) {
  const nextVaultIdRef = useRef(INITIAL_VAULT_ID_COUNTER);

  const updateField = useCallback(
    (field: keyof CalculatorParams, value: number) => {
      onParamsChange({ ...params, [field]: value });
    },
    [params, onParamsChange],
  );

  const updateVaultBtc = useCallback(
    (index: number, btc: number) => {
      const updated = params.vaults.map((v, i) =>
        i === index ? { ...v, btc } : v,
      );
      onParamsChange({ ...params, vaults: updated });
    },
    [params, onParamsChange],
  );

  const addVault = useCallback(() => {
    nextVaultIdRef.current++;
    const newVault: Vault = {
      id: `v-${nextVaultIdRef.current}`,
      name: `Vault ${params.vaults.length + 1}`,
      btc: 0.1,
    };
    onParamsChange({
      ...params,
      vaults: renameVaults([...params.vaults, newVault]),
    });
  }, [params, onParamsChange]);

  const removeVault = useCallback(
    (index: number) => {
      if (params.vaults.length <= 1) return;
      const updated = params.vaults.filter((_, i) => i !== index);
      onParamsChange({ ...params, vaults: renameVaults(updated) });
    },
    [params, onParamsChange],
  );

  return (
    <div className="space-y-3 rounded border border-zinc-700 bg-zinc-800/40 p-3">
      {/* Market & Debt */}
      <div className={FIELD_GRID_CLASS}>
        <div>
          <div className={PANEL_LABEL_CLASS}>BTC Price ($)</div>
          <input
            type="number"
            step="100"
            className={PANEL_INPUT_CLASS}
            value={params.btcPrice}
            onChange={(e) =>
              updateField("btcPrice", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div>
          <div className={PANEL_LABEL_CLASS}>Total Debt ($)</div>
          <input
            type="number"
            step="1000"
            className={PANEL_INPUT_CLASS}
            value={params.totalDebtUsd}
            onChange={(e) =>
              updateField("totalDebtUsd", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div>
          <div className={PANEL_LABEL_CLASS}>CF</div>
          <input
            type="number"
            step="0.05"
            min="0.1"
            max="0.99"
            className={PANEL_INPUT_CLASS}
            value={params.CF}
            onChange={(e) =>
              updateField("CF", parseFloat(e.target.value) || DEBUG_DEFAULT_CF)
            }
          />
        </div>
        <div>
          <div className={PANEL_LABEL_CLASS}>THF</div>
          <input
            type="number"
            step="0.01"
            min="1.01"
            max="2.0"
            className={PANEL_INPUT_CLASS}
            value={params.THF}
            onChange={(e) =>
              updateField(
                "THF",
                parseFloat(e.target.value) || DEBUG_DEFAULT_THF,
              )
            }
          />
        </div>
      </div>
      <div className={FIELD_GRID_CLASS}>
        <div>
          <div className={PANEL_LABEL_CLASS}>LB (maxLB)</div>
          <input
            type="number"
            step="0.01"
            min="1.0"
            max="1.5"
            className={PANEL_INPUT_CLASS}
            value={params.maxLB}
            onChange={(e) =>
              updateField(
                "maxLB",
                parseFloat(e.target.value) || DEBUG_DEFAULT_MAX_LB,
              )
            }
          />
        </div>
        <div>
          <div className={PANEL_LABEL_CLASS}>Expected HF</div>
          <input
            type="number"
            step="0.01"
            min="0.5"
            max="1.0"
            className={PANEL_INPUT_CLASS}
            value={params.expectedHF}
            onChange={(e) =>
              updateField(
                "expectedHF",
                parseFloat(e.target.value) || DEBUG_DEFAULT_EXPECTED_HF,
              )
            }
          />
        </div>
      </div>

      {/* Vaults */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300">
            Vaults ({params.vaults.length})
          </span>
          <button
            type="button"
            onClick={addVault}
            className={PRESET_BUTTON_CLASS}
          >
            + Add
          </button>
        </div>
        <div className="space-y-1">
          {params.vaults.map((vault, i) => (
            <div key={vault.id} className="flex items-center gap-2">
              <span className="w-16 text-xs text-zinc-400">{vault.name}</span>
              <input
                type="number"
                step="0.01"
                min="0.001"
                className={`w-24 ${PANEL_INPUT_CLASS}`}
                value={vault.btc}
                onChange={(e) =>
                  updateVaultBtc(i, parseFloat(e.target.value) || 0.01)
                }
              />
              <span className="text-xs text-zinc-400">BTC</span>
              {params.vaults.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVault(i)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Publishes `debugPositionStore`'s cascade inputs to `@/overrides/position`
 * so the real banner/chart can pick them up, and clears the override on
 * unmount. Mounted exactly once by the shell (`GodModePanel`), gated the
 * same double flag as the old standalone position-notifications section —
 * `CascadeSimulator` itself never does this (see this file's header).
 */
function CascadeOverridePublisherEffect() {
  const manualMode = useDebugManualMode();
  const simulateStalePrice = useDebugSimulateStalePrice();
  const manualParams = useDebugManualParams();

  const manualResult = useMemo(
    () => (manualMode ? calculate(manualParams) : null),
    [manualMode, manualParams],
  );

  // Publish the derived override so the dashboard banner reflects the debug
  // state. Live mode publishes nothing (every consumer already falls back to
  // the live calculation); simulated mode publishes the simulated cascade;
  // stale-price publishes the status with no cascade to chart.
  useEffect(() => {
    if (simulateStalePrice) {
      setPositionCascadeOverride({
        result: null,
        status: "stale-price",
        params: manualParams,
      });
    } else if (manualMode && manualResult) {
      setPositionCascadeOverride({
        result: manualResult,
        status: null,
        params: manualParams,
      });
    } else {
      setPositionCascadeOverride(null);
    }
  }, [manualMode, manualResult, manualParams, simulateStalePrice]);

  // Stop overriding the banner once this unmounts (god-mode hidden or the
  // popped-out window closed) — otherwise the last simulated / stale-price
  // override would linger in the module store and keep driving the
  // dashboard banner.
  useEffect(() => () => setPositionCascadeOverride(null), []);

  return null;
}

export function CascadeOverridePublisher() {
  if (!positionDebugGate()) return null;
  return <CascadeOverridePublisherEffect />;
}

/**
 * Scenario-based cascade simulator: Live | Simulated, one-click named
 * presets, a "Stale price" status action, and a Custom… escape hatch holding
 * the freeform param editor. Selecting Live clears both the simulated params
 * and the stale-price status; the publish side lives in
 * `CascadeOverridePublisher`, not here (see this file's header).
 */
export function CascadeSimulator() {
  const { address } = useETHWallet();
  const { result: hookResult, status } = usePositionNotifications(address);
  const manualMode = useDebugManualMode();
  const simulateStalePrice = useDebugSimulateStalePrice();
  const manualParams = useDebugManualParams();

  const manualResult = useMemo(
    () => (manualMode ? calculate(manualParams) : null),
    [manualMode, manualParams],
  );

  const simulated = manualMode || simulateStalePrice;
  const displayResult = simulateStalePrice
    ? null
    : simulated
      ? manualResult
      : hookResult;

  if (!positionDebugGate()) {
    return (
      <p className={PANEL_HINT_CLASS}>
        Cascade simulator needs ENABLE_LIQUIDATION_NOTIFICATIONS and
        POSITION_DEBUG_PANEL both on.
      </p>
    );
  }

  const goLive = () => {
    setDebugManualMode(false);
    setDebugSimulateStalePrice(false);
  };

  const applyPreset = (preset: (typeof DEBUG_PRESETS)[number]) => {
    setDebugSimulateStalePrice(false);
    applyDebugPreset(preset);
  };

  return (
    <div className="space-y-3">
      <div className={PANEL_SECTION_TITLE_CLASS}>
        Cascade simulator
        {simulateStalePrice && " (stale price)"}
        {!simulateStalePrice && manualMode && " (simulated)"}
      </div>

      <div className="flex gap-2">
        <SegmentButton label="Live" active={!simulated} onClick={goLive} />
        <SegmentButton
          label="Simulated"
          active={simulated}
          onClick={() => setDebugManualMode(true)}
        />
      </div>

      {simulated && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {DEBUG_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={PRESET_BUTTON_CLASS}
              >
                {preset.label}
              </button>
            ))}
            <SegmentButton
              label="Stale price"
              active={simulateStalePrice}
              onClick={() => setDebugSimulateStalePrice(!simulateStalePrice)}
            />
          </div>

          <details className={PANEL_SECTION_CLASS}>
            <summary className={PANEL_SECTION_TITLE_CLASS}>Custom…</summary>
            <div className="mt-3 space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => resetDebugManualParams()}
                  className={PANEL_BUTTON_CLASS}
                >
                  Reset defaults
                </button>
              </div>
              <ManualInputPanel
                params={manualParams}
                onParamsChange={setDebugManualParams}
              />
            </div>
          </details>
        </>
      )}

      {/* Status message (live mode only) */}
      {!simulated && status !== "ready" && (
        <p className={PANEL_HINT_CLASS}>{STATUS_MESSAGES[status]}</p>
      )}

      {/* Results */}
      {displayResult && <ResultPanel result={displayResult} />}
    </div>
  );
}
