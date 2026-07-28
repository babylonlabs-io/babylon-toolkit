/**
 * Cross-component store for the inscription-check debug scenarios
 * (dev / QA only — surfaced inside the god-mode panel).
 *
 * Same shape as liquidationDebugStore / debugPositionStore: the panel writes,
 * `useUTXOs` reads, and the state lives in a module store so it survives the
 * god-mode panel's float ↔ pop-out remount.
 *
 * Why this exists: the inscription check's states are all but impossible to
 * review against a real wallet — you would need a wallet holding an inscription
 * on a dust output AND a second one on a large output, plus a way to make the
 * classifier hang or fail. Each scenario below swaps in a fixed synthetic UTXO
 * set and a forced classifier result so the deposit form's balance, notice and
 * CTA can be seen directly.
 *
 * `auto` (the default, and the only value production can ever see) leaves
 * everything derived from the live wallet and the live classifier.
 */

import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import type { InscriptionIdentifier } from "@babylonlabs-io/wallet-connector";
import { LOW_VALUE_UTXO_THRESHOLD } from "@babylonlabs-io/wallet-connector";
import { useSyncExternalStore } from "react";

import featureFlags from "@/config/featureFlags";

export type OrdinalsDebugScenario =
  | "auto"
  | "good"
  | "checking"
  | "bad"
  | "before";

export const ORDINALS_DEBUG_SCENARIOS: {
  value: OrdinalsDebugScenario;
  label: string;
  /** One line shown under the control — what this scenario should produce. */
  outcome: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    outcome:
      "Live wallet and live classifier — no synthetic UTXOs. On signet the check is skipped entirely (no wallet reports inscriptions off mainnet), so expect no notice and a normal deposit; the dust floor still applies.",
  },
  {
    value: "good",
    label: "Good",
    outcome:
      "Check succeeds. Both inscriptions are kept out of the deposit: the large one by the classifier, the dust one by the floor. Spendable: 400,000 sats.",
  },
  {
    value: "checking",
    label: "Checking",
    outcome:
      'Check still running. CTA is disabled with "Checking for inscriptions…" — that gate no longer depends on the inscription toggle.',
  },
  {
    value: "bad",
    label: "Bad",
    outcome:
      "Check failed. Notice appears, deposits still work. The dust inscription stays protected by the floor; the 40,000-sat one does not — that is the accepted residual risk. Spendable: 440,000 sats.",
  },
  {
    value: "before",
    label: "Before fix",
    outcome:
      "Pre-fix behaviour: check failed AND no floor, so every UTXO is spendable — including the 546-sat inscription. Spendable: 445,546 sats. (The notice still shows here — it is part of the fix; watch the balance, not the notice.)",
  },
];

/**
 * Synthetic wallet used by every scenario except `auto`.
 *
 * Deliberately covers all four combinations that matter: inscribed/plain ×
 * below/above the floor. The 40,000-sat inscription is the one only the
 * classifier can catch — it is what makes the residual risk visible.
 */
export const ORDINALS_DEBUG_UTXOS: {
  utxo: MempoolUTXO;
  hasInscription: boolean;
  note: string;
}[] = [
  {
    utxo: makeDebugUtxo("dbg-inscription-dust", 546),
    hasInscription: true,
    note: "Inscription on a typical 546-sat output — below the floor.",
  },
  {
    utxo: makeDebugUtxo("dbg-plain-small", 5_000),
    hasInscription: false,
    note: "Plain output below the floor — never classified, never spent.",
  },
  {
    utxo: makeDebugUtxo("dbg-inscription-large", 40_000),
    hasInscription: true,
    note: "Inscription on a large output — only the classifier can catch this.",
  },
  {
    utxo: makeDebugUtxo("dbg-plain-large", 400_000),
    hasInscription: false,
    note: "Plain output above the floor — always spendable.",
  },
];

function makeDebugUtxo(txid: string, value: number): MempoolUTXO {
  return {
    txid,
    vout: 0,
    value,
    // P2WPKH-shaped script so anything that decodes it stays happy. These UTXOs
    // do not exist on-chain, so a scenario other than Auto cannot complete a
    // real deposit — the signing step will fail, by design.
    scriptPubKey: "0014000000000000000000000000000000000000dead",
    confirmed: true,
  };
}

/** What `useUTXOs` substitutes for the live wallet + classifier state. */
export interface OrdinalsDebugOverride {
  confirmedUTXOs: MempoolUTXO[];
  inscriptions: InscriptionIdentifier[];
  isLoadingOrdinals: boolean;
  ordinalsError: Error | null;
  /**
   * Minimum value for a UTXO to be spendable. Always the real floor except in
   * `before`, which sets 0 to reproduce the pre-fix behaviour.
   */
  spendFloorSats: number;
}

const DEBUG_INSCRIPTIONS: InscriptionIdentifier[] = ORDINALS_DEBUG_UTXOS.filter(
  (entry) => entry.hasInscription,
).map((entry) => ({ txid: entry.utxo.txid, vout: entry.utxo.vout }));

const DEBUG_UTXOS: MempoolUTXO[] = ORDINALS_DEBUG_UTXOS.map(
  (entry) => entry.utxo,
);

/**
 * Resolve the override for a scenario. Pure, so the panel's stated outcomes and
 * the hook's behaviour are driven by the same definition.
 */
export function resolveOrdinalsDebugOverride(
  scenario: OrdinalsDebugScenario,
): OrdinalsDebugOverride | null {
  switch (scenario) {
    case "auto":
      return null;
    case "good":
      return {
        confirmedUTXOs: DEBUG_UTXOS,
        inscriptions: DEBUG_INSCRIPTIONS,
        isLoadingOrdinals: false,
        ordinalsError: null,
        spendFloorSats: LOW_VALUE_UTXO_THRESHOLD,
      };
    case "checking":
      return {
        confirmedUTXOs: DEBUG_UTXOS,
        inscriptions: [],
        isLoadingOrdinals: true,
        ordinalsError: null,
        spendFloorSats: LOW_VALUE_UTXO_THRESHOLD,
      };
    case "bad":
      return {
        confirmedUTXOs: DEBUG_UTXOS,
        inscriptions: [],
        isLoadingOrdinals: false,
        ordinalsError: new Error("Ordinals API unavailable (debug scenario)"),
        spendFloorSats: LOW_VALUE_UTXO_THRESHOLD,
      };
    case "before":
      return {
        confirmedUTXOs: DEBUG_UTXOS,
        inscriptions: [],
        isLoadingOrdinals: false,
        ordinalsError: new Error("Ordinals API unavailable (debug scenario)"),
        // The pre-fix spendable set had no minimum value at all.
        spendFloorSats: 0,
      };
  }
}

let scenario: OrdinalsDebugScenario = "auto";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setOrdinalsDebugScenario(next: OrdinalsDebugScenario) {
  if (scenario === next) return;
  scenario = next;
  for (const listener of listeners) listener();
}

function getScenario() {
  return scenario;
}

export function useOrdinalsDebugScenario(): OrdinalsDebugScenario {
  return useSyncExternalStore(subscribe, getScenario, getScenario);
}

/**
 * The override `useUTXOs` consumes. Gated on the god-mode flag — itself
 * hard-gated on `import.meta.env.DEV` — so in production this is always null
 * and the live wallet + classifier pass through untouched.
 */
export function useOrdinalsDebugOverride(): OrdinalsDebugOverride | null {
  const current = useOrdinalsDebugScenario();
  if (!featureFlags.isGodModePanelEnabled) return null;
  return resolveOrdinalsDebugOverride(current);
}
