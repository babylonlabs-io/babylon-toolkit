/**
 * The god-mode inscription-check scenarios, driven through the real `useUTXOs`.
 *
 * The panel advertises a spendable total per scenario. These run the actual
 * hook and assert the total matches the advertised one, so the demo can never
 * claim an outcome the production code does not produce.
 */

import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOrdinals } from "@/hooks/useOrdinals";
import { calculateBalance, useUTXOs } from "@/hooks/useUTXOs";
import { useAppState } from "@/state/AppState";

import {
  ORDINALS_DEBUG_SCENARIOS,
  setOrdinalsDebugScenario,
  type OrdinalsDebugScenario,
} from "../ordinalsDebugStore";

vi.mock("@babylonlabs-io/ts-sdk", () => ({ getAddressUtxos: vi.fn() }));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  LOW_VALUE_UTXO_THRESHOLD: 10_000,
  filterInscriptionUtxos: vi.fn((utxos, inscriptions) => {
    const inscribed = new Set(
      inscriptions.map(
        (i: { txid: string; vout: number }) => `${i.txid}:${i.vout}`,
      ),
    );
    return {
      availableUtxos: utxos.filter(
        (u: { txid: string; vout: number }) =>
          !inscribed.has(`${u.txid}:${u.vout}`),
      ),
      inscriptionUtxos: utxos.filter((u: { txid: string; vout: number }) =>
        inscribed.has(`${u.txid}:${u.vout}`),
      ),
    };
  }),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@/hooks/useOrdinals", () => ({ useOrdinals: vi.fn() }));
vi.mock("@/state/AppState", () => ({ useAppState: vi.fn() }));
vi.mock("@/clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.test/api"),
}));
vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// The scenarios only resolve when god mode is on; production forces this false.
vi.mock("@/config/featureFlags", () => ({
  default: { isGodModePanelEnabled: true },
}));

/** The spendable total the panel advertises, e.g. "Spendable: 400,000 sats". */
function advertisedSpendableSats(
  scenario: OrdinalsDebugScenario,
): number | null {
  const outcome = ORDINALS_DEBUG_SCENARIOS.find(
    (s) => s.value === scenario,
  )?.outcome;
  const match = outcome?.match(/Spendable: ([\d,]+) sats/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function renderScenario(scenario: OrdinalsDebugScenario) {
  setOrdinalsDebugScenario(scenario);
  return renderHook(() => useUTXOs("bc1qtest"));
}

describe("god-mode inscription-check scenarios", () => {
  beforeEach(() => {
    vi.mocked(useAppState).mockReturnValue({
      ordinalsExcluded: true,
    } as ReturnType<typeof useAppState>);
    // The live wallet is empty — every UTXO below comes from the scenario.
    vi.mocked(useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    vi.mocked(useOrdinals).mockReturnValue({
      inscriptions: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrdinals>);
    setOrdinalsDebugScenario("auto");
  });

  it("leaves the live wallet alone on auto", () => {
    const { result } = renderScenario("auto");

    expect(result.current.spendableUTXOs).toEqual([]);
    expect(result.current.inscriptionCheckFailed).toBe(false);
  });

  it.each([
    ["good", 400_000],
    ["checking", 440_000],
    ["bad", 440_000],
    ["before", 445_546],
  ] as const)("spends %s sats in the %s scenario", (scenario, expected) => {
    const { result } = renderScenario(scenario);

    expect(calculateBalance(result.current.spendableUTXOs)).toBe(expected);
    expect(calculateBalance(result.current.spendableMempoolUTXOs)).toBe(
      expected,
    );
  });

  it.each(["good", "bad", "before"] as const)(
    "advertises the %s scenario's real spendable total in the panel",
    (scenario) => {
      const { result } = renderScenario(scenario);

      expect(advertisedSpendableSats(scenario)).toBe(
        calculateBalance(result.current.spendableUTXOs),
      );
    },
  );

  it("keeps the 546-sat inscription spendable only in the pre-fix scenario", () => {
    // The single line that shows what the fix changed.
    const before = renderScenario("before");
    expect(before.result.current.spendableUTXOs.map((u) => u.txid)).toContain(
      "dbg-inscription-dust",
    );

    const bad = renderScenario("bad");
    expect(bad.result.current.spendableUTXOs.map((u) => u.txid)).not.toContain(
      "dbg-inscription-dust",
    );
  });

  it("shows the failure notice in the bad scenario and not in good", () => {
    expect(renderScenario("bad").result.current.inscriptionCheckFailed).toBe(
      true,
    );
    expect(renderScenario("good").result.current.inscriptionCheckFailed).toBe(
      false,
    );
    expect(renderScenario("checking").result.current.ordinalsCheckPending).toBe(
      true,
    );
  });
});
