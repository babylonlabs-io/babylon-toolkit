/**
 * Reclaim poller tests.
 *
 * The behaviour under test is what happens when a per-vault read fails but the
 * tip read does not. The poller keeps the previous observation so a transient
 * rate-limit does not blank the row for a cycle — which means the confirmation
 * arithmetic must not then measure that frozen observation against a tip that
 * has kept moving.
 */

import {
  getOutspend,
  getTipHeight,
  getUtxoInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  PEGIN_VAULT_VOUT,
  getReclaimEligibility,
} from "@/models/reclaimEligibility";

import { useReclaimStatus } from "../useReclaimStatus";

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
  >()),
  getOutspend: vi.fn(),
  getTipHeight: vi.fn(),
  getUtxoInfo: vi.fn(),
}));

vi.mock("@/clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn().mockReturnValue("https://mempool.space/api"),
}));

const VAULT_ID = `0x${"aa".repeat(32)}`;
const PEGIN_TXID = "cd".repeat(32);
const OUTPOINTS = [{ depositId: VAULT_ID, peginTxid: PEGIN_TXID }];

const TIP_AT_FIRST_TICK = 900_000;
/** The Payout is one block deep on the first tick — nowhere near the bar. */
const PAYOUT_HEIGHT = TIP_AT_FIRST_TICK;

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Payout mined at `PAYOUT_HEIGHT`, reserve unspent. */
function shallowPayoutReads() {
  (getOutspend as Mock).mockImplementation(
    async (_txid: string, vout: number) =>
      vout === PEGIN_VAULT_VOUT
        ? {
            spent: true,
            status: { confirmed: true, block_height: PAYOUT_HEIGHT },
          }
        : { spent: false },
  );
  (getUtxoInfo as Mock).mockResolvedValue({ value: 33_000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  shallowPayoutReads();
  (getTipHeight as Mock).mockResolvedValue(TIP_AT_FIRST_TICK);
});

describe("useReclaimStatus", () => {
  it("stamps each status with the tip height its spends were read against", async () => {
    const { result } = renderHook(() => useReclaimStatus(OUTPOINTS), {
      wrapper,
    });

    await waitFor(() => expect(result.current.statusByDepositId.size).toBe(1));
    expect(
      result.current.statusByDepositId.get(VAULT_ID)?.observedTipHeight,
    ).toBe(TIP_AT_FIRST_TICK);
  });

  it("does not let a carried-forward payout age into eligibility", async () => {
    // Tick 1 observes the Payout at one confirmation, so the row is correctly
    // actionless. Then the per-vault probes start failing — a plausible
    // rate-limit, which is why the fan-out is capped at two vaults — while the
    // single lightweight tip request keeps succeeding. Six blocks later the
    // frozen observation must still read as one confirmation, not seven.
    const { result } = renderHook(() => useReclaimStatus(OUTPOINTS), {
      wrapper,
    });

    await waitFor(() => expect(result.current.statusByDepositId.size).toBe(1));

    (getOutspend as Mock).mockRejectedValue(new Error("429 Too Many Requests"));
    (getUtxoInfo as Mock).mockRejectedValue(new Error("429 Too Many Requests"));
    (getTipHeight as Mock).mockResolvedValue(TIP_AT_FIRST_TICK + 6);

    await queryClient.refetchQueries();
    await waitFor(() => expect(getTipHeight).toHaveBeenCalledTimes(2));

    const carried = result.current.statusByDepositId.get(VAULT_ID);
    expect(carried).toBeDefined();
    // The entry survives the failure — that is the point of carrying it —
    // but it carries the tip it was read at, so the gate still says no.
    expect(carried?.observedTipHeight).toBe(TIP_AT_FIRST_TICK);
    expect(
      getReclaimEligibility({
        onChainStatus: 3,
        payoutSpend: carried!.payoutSpend,
        reserveSpend: carried!.reserveSpend,
        tipHeight: carried!.observedTipHeight,
        isOwnedByWallet: true,
        isLedgerWallet: false,
        isWithdrawBlocked: false,
        isReclaimInFlight: false,
      }),
    ).toEqual({ type: "absent" });
  });

  it("leaves the tip stamp unset when the tip read fails", async () => {
    // The gate reads an absent tip as "not yet known" and withholds the action.
    (getTipHeight as Mock).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useReclaimStatus(OUTPOINTS), {
      wrapper,
    });

    await waitFor(() => expect(result.current.statusByDepositId.size).toBe(1));
    expect(
      result.current.statusByDepositId.get(VAULT_ID)?.observedTipHeight,
    ).toBeUndefined();
  });

  it("omits a vault that fails on its very first read", async () => {
    (getOutspend as Mock).mockRejectedValue(new Error("429"));

    const { result } = renderHook(() => useReclaimStatus(OUTPOINTS), {
      wrapper,
    });

    await waitFor(() => expect(getOutspend).toHaveBeenCalled());
    expect(result.current.statusByDepositId.has(VAULT_ID)).toBe(false);
  });
});
