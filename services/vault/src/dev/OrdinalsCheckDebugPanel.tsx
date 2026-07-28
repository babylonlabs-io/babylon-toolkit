/**
 * God-mode section for the deposit form's inscription check (dev / QA only).
 *
 * Each scenario swaps the wallet's UTXOs for a fixed synthetic set and forces a
 * classifier result, so the three things this app does about inscriptions can be
 * seen side by side in the deposit form: which UTXOs fund a deposit, the
 * disabled CTA while the check runs, and the notice when it fails. "Before fix"
 * reproduces the old behaviour for comparison.
 *
 * The synthetic UTXOs are not on-chain, so any scenario other than Auto will
 * fail at signing — this is for looking, not for depositing.
 */

import {
  ORDINALS_DEBUG_SCENARIOS,
  ORDINALS_DEBUG_UTXOS,
  setOrdinalsDebugScenario,
  useOrdinalsDebugScenario,
} from "./ordinalsDebugStore";
import {
  PANEL_HINT_CLASS,
  PANEL_SECTION_CLASS,
  PANEL_SECTION_TITLE_CLASS,
  panelSegmentClass,
} from "./panelChrome";

export function OrdinalsCheckDebugPanel() {
  const scenario = useOrdinalsDebugScenario();
  const active = ORDINALS_DEBUG_SCENARIOS.find((s) => s.value === scenario);

  return (
    <details className={PANEL_SECTION_CLASS}>
      <summary className={PANEL_SECTION_TITLE_CLASS}>
        Inscription check
        {scenario !== "auto" && ` (${scenario})`}
      </summary>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          {ORDINALS_DEBUG_SCENARIOS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrdinalsDebugScenario(value)}
              className={panelSegmentClass(scenario === value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={PANEL_HINT_CLASS}>{active?.outcome}</p>
        {scenario !== "auto" && (
          <div className="space-y-1">
            <p className={PANEL_HINT_CLASS}>Synthetic wallet:</p>
            <ul className="space-y-0.5 font-mono text-xs text-zinc-400">
              {ORDINALS_DEBUG_UTXOS.map(({ utxo, hasInscription, note }) => (
                <li key={utxo.txid} title={note}>
                  {utxo.value.toLocaleString()} sats
                  {hasInscription ? " · inscription" : " · plain"}
                </li>
              ))}
            </ul>
            <p className={PANEL_HINT_CLASS}>
              These outputs do not exist on-chain — open the deposit form to see
              the balance, CTA and notice, but don&apos;t try to sign.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
