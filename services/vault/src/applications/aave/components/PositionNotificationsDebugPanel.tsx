import { useCallback, useMemo, useRef, useState } from "react";

import { useETHWallet } from "@/context/wallet";

import {
  usePositionNotifications,
  type PositionNotificationsStatus,
} from "../hooks/usePositionNotifications";
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
} from "../positionNotifications";

const SEVERITY_COLORS: Record<BannerSeverity, string> = {
  red: "border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
  yellow:
    "border-yellow-500 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200",
  green:
    "border-green-500 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200",
  hidden:
    "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
};

const WARNING_TYPE_COLORS: Record<WarningType, string> = {
  urgent: "bg-red-600 text-white",
  cliff: "bg-red-500 text-white",
  dust: "bg-gray-500 text-white",
  reorder: "bg-yellow-500 text-black",
  rebalance: "bg-yellow-500 text-black",
  "weird-params": "bg-blue-500 text-white",
};

const STATUS_MESSAGES: Record<
  Exclude<PositionNotificationsStatus, "flag-off" | "ready">,
  string
> = {
  loading: "Loading position data...",
  "no-wallet": "Wallet not connected",
  "no-vaults": "No collateral vaults found",
  "no-price": "Waiting for BTC price...",
};

const INPUT_CLASS =
  "w-28 rounded border border-gray-300 px-2 py-1 text-sm font-mono dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200";
const LABEL_CLASS = "text-xs text-gray-600 dark:text-gray-400";

function makeDefaultParams(): CalculatorParams {
  return {
    btcPrice: 61722.5,
    totalDebtUsd: 44287.72,
    vaults: [
      { id: "v-1", name: "Vault 1", btc: 0.65 },
      { id: "v-2", name: "Vault 2", btc: 0.35 },
    ],
    CF: 0.75,
    THF: 1.1,
    maxLB: 1.05,
    expectedHF: 0.95,
  };
}

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
    <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-1 flex items-center gap-2">
        <WarningBadge type={warning.type} />
        <span className="font-medium">{warning.title}</span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {warning.detail}
      </p>
      {warning.suggestion && (
        <p className="mt-1 text-sm font-medium text-blue-700 dark:text-blue-400">
          {warning.suggestion}
        </p>
      )}
    </div>
  );
}

function GroupRow({ group }: { group: LiquidationGroup }) {
  return (
    <tr
      className={group.isFullLiquidation ? "bg-red-50 dark:bg-red-950/30" : ""}
    >
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
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
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
          <div>
            Rec. Sacrificial:{" "}
            <strong>{fmt(result.recommendedSacrificialBtc, 4)} BTC</strong>
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
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
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

      {/* Suggestions */}
      {(result.suggestedVaultOrder ||
        result.suggestedNewVaultBtc !== null ||
        result.suggestedRebalanceVaultBtc !== null) && (
        <details open>
          <summary className="cursor-pointer font-medium">Suggestions</summary>
          <div className="mt-2 space-y-2 text-sm">
            {result.suggestedVaultOrder && (
              <VaultOrderDisplay
                label="Suggested order"
                vaults={result.suggestedVaultOrder}
              />
            )}
            {result.suggestedNewVaultBtc !== null && (
              <div>
                Add sacrificial vault:{" "}
                <strong>{fmt(result.suggestedNewVaultBtc, 4)} BTC</strong>
              </div>
            )}
            {result.suggestedRebalanceVaultBtc !== null && (
              <div>
                Add rebalance vault:{" "}
                <strong>{fmt(result.suggestedRebalanceVaultBtc, 4)} BTC</strong>
              </div>
            )}
            {result.suggestedRebalanceOrder && (
              <VaultOrderDisplay
                label="Rebalance order"
                vaults={result.suggestedRebalanceOrder}
              />
            )}
            {result.rebalanceImprovementBtc > 0 && (
              <div>
                Improvement:{" "}
                <strong>+{fmt(result.rebalanceImprovementBtc, 4)} BTC</strong>{" "}
                additional protection
              </div>
            )}
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
    <div className="space-y-3 rounded border border-purple-200 bg-white p-3 dark:border-purple-800 dark:bg-gray-800/50">
      {/* Market & Debt */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <div className={LABEL_CLASS}>BTC Price ($)</div>
          <input
            type="number"
            step="100"
            className={INPUT_CLASS}
            value={params.btcPrice}
            onChange={(e) =>
              updateField("btcPrice", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div>
          <div className={LABEL_CLASS}>Total Debt ($)</div>
          <input
            type="number"
            step="1000"
            className={INPUT_CLASS}
            value={params.totalDebtUsd}
            onChange={(e) =>
              updateField("totalDebtUsd", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div>
          <div className={LABEL_CLASS}>CF</div>
          <input
            type="number"
            step="0.05"
            min="0.1"
            max="0.99"
            className={INPUT_CLASS}
            value={params.CF}
            onChange={(e) =>
              updateField("CF", parseFloat(e.target.value) || 0.75)
            }
          />
        </div>
        <div>
          <div className={LABEL_CLASS}>THF</div>
          <input
            type="number"
            step="0.01"
            min="1.01"
            max="2.0"
            className={INPUT_CLASS}
            value={params.THF}
            onChange={(e) =>
              updateField("THF", parseFloat(e.target.value) || 1.1)
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <div className={LABEL_CLASS}>LB (maxLB)</div>
          <input
            type="number"
            step="0.01"
            min="1.0"
            max="1.5"
            className={INPUT_CLASS}
            value={params.maxLB}
            onChange={(e) =>
              updateField("maxLB", parseFloat(e.target.value) || 1.05)
            }
          />
        </div>
        <div>
          <div className={LABEL_CLASS}>Expected HF</div>
          <input
            type="number"
            step="0.01"
            min="0.5"
            max="1.0"
            className={INPUT_CLASS}
            value={params.expectedHF}
            onChange={(e) =>
              updateField("expectedHF", parseFloat(e.target.value) || 0.95)
            }
          />
        </div>
      </div>

      {/* Vaults */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Vaults ({params.vaults.length})
          </span>
          <button
            type="button"
            onClick={addVault}
            className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-800/50"
          >
            + Add
          </button>
        </div>
        <div className="space-y-1">
          {params.vaults.map((vault, i) => (
            <div key={vault.id} className="flex items-center gap-2">
              <span className="w-16 text-xs text-gray-500 dark:text-gray-400">
                {vault.name}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.001"
                className="w-24 rounded border border-gray-300 px-2 py-1 font-mono text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                value={vault.btc}
                onChange={(e) =>
                  updateVaultBtc(i, parseFloat(e.target.value) || 0.01)
                }
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                BTC
              </span>
              {params.vaults.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVault(i)}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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

export function PositionNotificationsDebugPanel() {
  const { address } = useETHWallet();
  const { result: hookResult, status } = usePositionNotifications(address);
  const [manualMode, setManualMode] = useState(false);
  const [manualParams, setManualParams] =
    useState<CalculatorParams>(makeDefaultParams);

  const manualResult = useMemo(
    () => (manualMode ? calculate(manualParams) : null),
    [manualMode, manualParams],
  );

  const displayResult = manualMode ? manualResult : hookResult;

  if (status === "flag-off") return null;

  return (
    <details className="rounded-lg border border-dashed border-purple-400 bg-purple-50 p-4 dark:border-purple-700 dark:bg-purple-950/30">
      <summary className="cursor-pointer text-sm font-semibold text-purple-700 dark:text-purple-300">
        Position Notifications Debug Panel
        {!manualMode && status === "loading" && " (loading...)"}
        {manualMode && " (manual)"}
      </summary>
      <div className="mt-3 space-y-3">
        {/* Mode toggle */}
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => setManualMode(e.target.checked)}
              className="rounded"
            />
            Manual Mode
          </label>
          {manualMode && (
            <button
              type="button"
              onClick={() => setManualParams(makeDefaultParams())}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Reset defaults
            </button>
          )}
        </div>

        {/* Manual inputs */}
        {manualMode && (
          <ManualInputPanel
            params={manualParams}
            onParamsChange={setManualParams}
          />
        )}

        {/* Status message (live mode only) */}
        {!manualMode && status !== "ready" && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {STATUS_MESSAGES[status]}
          </p>
        )}

        {/* Results */}
        {displayResult && <ResultPanel result={displayResult} />}
      </div>
    </details>
  );
}
