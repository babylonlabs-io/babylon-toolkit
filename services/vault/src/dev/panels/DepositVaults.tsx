/**
 * "Deposit & Vaults" god-mode tab (dev / QA only): the demo deposit / vault
 * mock gallery (Normal / Expired / Different wallet / Activation window
 * deposit flows, plus collateral, loan and activity mocks over the same
 * shared items list — see `demoDeposit.ts`), and the artifact-download demo.
 */
import { useEffect, useState } from "react";

import { setActivityOverride } from "@/overrides/activity";
import { setArtifactDownloadOverride } from "@/overrides/artifactDownload";
import { setCollateralOverride } from "@/overrides/collateral";
import { setDepositOverride } from "@/overrides/deposits";
import { setLoanOverride } from "@/overrides/loans";
import { clearArtifactDownloadReceipts } from "@/utils/artifactDownloadStorage";

import {
  DEMO_ARTIFACT_SCENARIO_LABELS,
  DEMO_ARTIFACT_SCENARIOS,
  type DemoArtifactScenario,
  demoFetchAndDownloadArtifacts,
  setArtifactDownloadMockEnabled,
  setArtifactDownloadScenario,
  useArtifactDownloadMockEnabled,
  useArtifactDownloadScenario,
} from "../demoArtifactDownload";
import {
  addDemoItem,
  amountUnitFor,
  buildActivitiesDemo,
  buildCollateralsDemo,
  buildDepositsDemo,
  buildLoansDemo,
  DEMO_BORROW_SYMBOL_OPTIONS,
  type DemoBorrowSymbol,
  type DemoCta,
  type DemoItem,
  type DemoType,
  DEPOSIT_ACTIVATION_WINDOW_SCENARIO_COUNT,
  DEPOSIT_DIFFERENT_WALLET_SCENARIO_COUNT,
  DEPOSIT_EXPIRED_SCENARIO_COUNT,
  DEPOSIT_FLOW_SCENARIO_COUNT,
  itemSectionHint,
  removeDemoItem,
  scenariosForType,
  setDemoBorrowSymbol,
  setDemoEnabled,
  setDemoHideReal,
  setDemoItemAmount,
  setDemoItemBatched,
  setDemoItemState,
  setDemoItemType,
  useDemoBorrowSymbol,
  useDemoEnabled,
  useDemoHideReal,
  useDemoItems,
} from "../demoDeposit";
import {
  PANEL_BUTTON_CLASS,
  PANEL_SECTION_CLASS,
  PANEL_SECTION_TITLE_CLASS,
} from "../panelChrome";

const TYPE_LABELS: Record<DemoType, string> = {
  deposit: "Deposit",
  collateral: "Collateral",
  loan: "Loan",
  activity: "Activity",
};

const CTA_BADGE: Record<DemoCta, { label: string; className: string }> = {
  primary: { label: "Orange CTA", className: "bg-orange-500 text-white" },
  outlined: {
    label: "Outlined CTA",
    className: "border border-zinc-400 text-zinc-200",
  },
  none: { label: "No CTA", className: "bg-zinc-700 text-zinc-300" },
};

/**
 * Deposit "mode" segments over the flat DEPOSIT_SCENARIOS list. The mode select
 * picks a segment; the slider/dropdown scrub within it. Different wallet is a
 * single state (count 1), so its slider is inert.
 */
const DEPOSIT_SEGMENTS: {
  mode: string;
  label: string;
  offset: number;
  count: number;
}[] = [
  {
    mode: "normal",
    label: "Normal",
    offset: 0,
    count: DEPOSIT_FLOW_SCENARIO_COUNT,
  },
  {
    mode: "expired",
    label: "Expired",
    offset: DEPOSIT_FLOW_SCENARIO_COUNT,
    count: DEPOSIT_EXPIRED_SCENARIO_COUNT,
  },
  {
    mode: "different-wallet",
    label: "Different wallet",
    offset: DEPOSIT_FLOW_SCENARIO_COUNT + DEPOSIT_EXPIRED_SCENARIO_COUNT,
    count: DEPOSIT_DIFFERENT_WALLET_SCENARIO_COUNT,
  },
  {
    mode: "activation-window",
    label: "Activation window",
    offset:
      DEPOSIT_FLOW_SCENARIO_COUNT +
      DEPOSIT_EXPIRED_SCENARIO_COUNT +
      DEPOSIT_DIFFERENT_WALLET_SCENARIO_COUNT,
    count: DEPOSIT_ACTIVATION_WINDOW_SCENARIO_COUNT,
  },
];

function ItemRow({ item, index }: { item: DemoItem; index: number }) {
  const borrowSymbol = useDemoBorrowSymbol();
  const scenarios = scenariosForType(item.type, borrowSymbol);
  const total = scenarios.length;
  // Deposits pick a "mode" (Normal / Expired / Different wallet); the slider and
  // dropdown then scrub within that mode's segment. Other types are one flat
  // segment with no mode select. `stateIndex` still addresses the flat list.
  const isDeposit = item.type === "deposit";
  const segment = isDeposit
    ? (DEPOSIT_SEGMENTS.find(
        (s) =>
          item.stateIndex >= s.offset && item.stateIndex < s.offset + s.count,
      ) ?? DEPOSIT_SEGMENTS[0])
    : null;
  const offset = segment?.offset ?? 0;
  const count = segment?.count ?? total;
  const localIndex = item.stateIndex - offset;
  const scenario = scenarios[item.stateIndex] ?? scenarios[0];
  const badge = CTA_BADGE[scenario.expectedCta];
  const position = index + 1;
  const clampLocal = (next: number) => Math.min(count - 1, Math.max(0, next));

  return (
    <div className={`space-y-2 ${PANEL_SECTION_CLASS}`}>
      <div className="flex items-center justify-between gap-2">
        <select
          value={item.type}
          onChange={(e) =>
            setDemoItemType(item.key, e.target.value as DemoType)
          }
          className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
          aria-label={`Mock ${position} type`}
        >
          {(Object.keys(TYPE_LABELS) as DemoType[]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-zinc-400">
            {localIndex + 1}/{count}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <button
            type="button"
            onClick={() => removeDemoItem(item.key)}
            className={PANEL_BUTTON_CLASS}
            aria-label={`Remove mock ${position}`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Mode select (deposit only) sits above the slider: it picks the segment
          the slider scrubs — Normal (flow), Expired, or Different wallet. */}
      {isDeposit && segment && (
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="shrink-0">Mode</span>
          <select
            value={segment.mode}
            onChange={(e) => {
              const next = DEPOSIT_SEGMENTS.find(
                (s) => s.mode === e.target.value,
              );
              if (next) setDemoItemState(item.key, next.offset);
            }}
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
            aria-label={`Mock ${position} mode`}
          >
            {DEPOSIT_SEGMENTS.map((s) => (
              <option key={s.mode} value={s.mode}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Slider + dropdown both scrub within the current mode's segment —
          slider for quick stepping, dropdown for jumping straight to a state. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setDemoItemState(item.key, offset + clampLocal(localIndex - 1))
          }
          disabled={localIndex === 0}
          className={PANEL_BUTTON_CLASS}
        >
          Prev
        </button>
        <input
          type="range"
          min={0}
          max={count - 1}
          value={localIndex}
          disabled={count <= 1}
          onChange={(e) =>
            setDemoItemState(item.key, offset + Number(e.target.value))
          }
          className="min-w-0 flex-1 accent-orange-500 disabled:opacity-40"
          aria-label={`Mock ${position} step`}
        />
        <button
          type="button"
          onClick={() =>
            setDemoItemState(item.key, offset + clampLocal(localIndex + 1))
          }
          disabled={localIndex === count - 1}
          className={PANEL_BUTTON_CLASS}
        >
          Next
        </button>
      </div>

      {/* Current-state readout. The mode select + slider drive the state, so
          this is just a label — no redundant jump-to-state dropdown. */}
      <div
        className="truncate text-xs text-zinc-400"
        title={scenario.label}
        aria-label={`Mock ${position} state`}
      >
        {scenario.label}
      </div>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span>Amount ({amountUnitFor(item, borrowSymbol)})</span>
        <input
          type="number"
          min="0"
          step="0.0001"
          value={item.amount}
          onChange={(e) => setDemoItemAmount(item.key, e.target.value)}
          className="w-28 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
          aria-label={`Mock ${position} amount (${amountUnitFor(item, borrowSymbol)})`}
        />
      </label>

      {item.type === "deposit" && (
        <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
          <span>Batched (group with other batched deposits)</span>
          <input
            type="checkbox"
            checked={item.batched}
            onChange={(e) => setDemoItemBatched(item.key, e.target.checked)}
          />
        </label>
      )}

      <div className="text-xs text-zinc-500">
        Renders in: {itemSectionHint(item)}
      </div>
    </div>
  );
}

function DemoControls() {
  const enabled = useDemoEnabled();
  const hideReal = useDemoHideReal();
  const items = useDemoItems();
  const mockArtifactDownload = useArtifactDownloadMockEnabled();
  const artifactScenario = useArtifactDownloadScenario();
  const [clearedReceipts, setClearedReceipts] = useState<number | null>(null);
  const borrowSymbol = useDemoBorrowSymbol();

  // Publish the resolved deposit-family aggregates for the real dashboard
  // sections to read. "Inject demo" gates all four: merely adding a mock item
  // must not inject it until the toggle opts in.
  useEffect(() => {
    setDepositOverride(enabled ? buildDepositsDemo(items, hideReal) : null);
  }, [enabled, items, hideReal]);

  useEffect(() => {
    setActivityOverride(
      enabled ? buildActivitiesDemo(items, hideReal, borrowSymbol) : null,
    );
  }, [enabled, items, hideReal, borrowSymbol]);

  useEffect(() => {
    setCollateralOverride(
      enabled ? buildCollateralsDemo(items, hideReal) : null,
    );
  }, [enabled, items, hideReal]);

  useEffect(() => {
    setLoanOverride(
      enabled ? buildLoansDemo(items, hideReal, borrowSymbol) : null,
    );
  }, [enabled, items, hideReal, borrowSymbol]);

  // Independent of "Inject demo" — see the toggle's own label below.
  useEffect(() => {
    setArtifactDownloadOverride(
      mockArtifactDownload ? demoFetchAndDownloadArtifacts : null,
    );
  }, [mockArtifactDownload]);

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
        <span>Inject demo</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setDemoEnabled(e.target.checked)}
        />
      </label>

      {/* Independent of "Inject demo": the simulated fetch also applies to
          real vault rows, and demo rows only become downloadable through it. */}
      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
        <span>Mock artifact download</span>
        <input
          type="checkbox"
          checked={mockArtifactDownload}
          onChange={(e) => setArtifactDownloadMockEnabled(e.target.checked)}
        />
      </label>

      {/* The mock drives the real validator and file sink, so these pick what
          a hostile or broken vault provider sends back. */}
      <label
        className={`flex items-center justify-between gap-2 text-sm ${
          mockArtifactDownload ? "" : "opacity-40"
        }`}
      >
        <span>Artifact response</span>
        <select
          disabled={!mockArtifactDownload}
          value={artifactScenario}
          onChange={(e) =>
            setArtifactDownloadScenario(e.target.value as DemoArtifactScenario)
          }
          className="rounded bg-neutral-800 px-2 py-1 text-xs"
        >
          {DEMO_ARTIFACT_SCENARIOS.map((scenario) => (
            <option key={scenario} value={scenario}>
              {DEMO_ARTIFACT_SCENARIO_LABELS[scenario]}
            </option>
          ))}
        </select>
      </label>

      {/* A satisfied gate hides the card's download button, so re-testing the
          flow against the same vault needs the receipts gone. */}
      <button
        type="button"
        onClick={() => {
          const cleared = clearArtifactDownloadReceipts();
          setClearedReceipts(cleared);
        }}
        className="w-full rounded bg-neutral-800 px-2 py-1 text-left text-sm hover:bg-neutral-700"
      >
        {clearedReceipts === null
          ? "Clear artifact receipts"
          : `Cleared ${clearedReceipts} artifact receipt(s) — reload`}
      </button>

      <fieldset
        disabled={!enabled}
        className={`space-y-3 border-0 p-0 ${enabled ? "" : "opacity-40"}`}
      >
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
          <span>Hide real items</span>
          <input
            type="checkbox"
            checked={hideReal}
            onChange={(e) => setDemoHideReal(e.target.checked)}
          />
        </label>

        {/* Drives both the loan mock's row and the debt-denominated activity
            mocks (Borrow / Repay / liquidation), so a loan and its matching
            activity row never disagree about the asset. */}
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>Borrowed asset (loan + activity rows)</span>
          <select
            value={borrowSymbol}
            onChange={(e) =>
              setDemoBorrowSymbol(e.target.value as DemoBorrowSymbol)
            }
            className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
            aria-label="Borrowed asset"
          >
            {DEMO_BORROW_SYMBOL_OPTIONS.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </label>

        {items.map((item, index) => (
          <ItemRow key={item.key} item={item} index={index} />
        ))}

        <button
          type="button"
          onClick={() => addDemoItem("deposit")}
          className="w-full rounded border border-dashed border-zinc-600 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          + Add mock
        </button>
      </fieldset>
    </div>
  );
}

export function DepositVaultsPanel() {
  return (
    <div className="space-y-2">
      <div className={PANEL_SECTION_TITLE_CLASS}>Mocks</div>
      <DemoControls />
    </div>
  );
}
