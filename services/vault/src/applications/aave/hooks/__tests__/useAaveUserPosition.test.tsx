/**
 * Tests for the position read's availability signal, on the app's real
 * QueryClient: what it pins is how React Query's error and loading state moves
 * through retries and polls, which a mocked useQuery would only restate.
 *
 * Timeline with every read failing: the app's retry policy spends 1 + 2 + 4 =
 * 7s on a fetch, and the next poll starts 30s after that one settles. From a
 * success at t0, failures settle at t37, t74 and t111.
 */

import {
  focusManager,
  QueryClientProvider,
  type QueryClient,
} from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryClient } from "@/config/queryClient";

import { getUserPositionsWithLiveData } from "../../services";
import { useAaveUserPosition } from "../useAaveUserPosition";

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), event: vi.fn() },
}));

vi.mock("../../services", () => ({ getUserPositionsWithLiveData: vi.fn() }));

const CONFIG = {
  config: {
    coreSpokeAddress: "0x0000000000000000000000000000000000000001",
    vaultBtcReserveId: 2n,
  },
  allBorrowReserves: [],
};
vi.mock("../../context", () => ({ useAaveConfig: () => CONFIG }));

const USER = "0x00000000000000000000000000000000000000aa";
const OTHER_USER = "0x00000000000000000000000000000000000000bb";

const RETRIES_MS = 7_000;
const POLL_INTERVAL_MS = 30_000;
const FAILED_CYCLE_MS = POLL_INTERVAL_MS + RETRIES_MS;
/** Enough for a resolved read or a started fetch to reach the hook's result. */
const SETTLE_MS = 100;
/** Viem's 10s timeout and its one 150ms retry, for one attempt at the read. */
const SLOW_ATTEMPT_MS = 20_150;

const POSITION = {
  accountData: {
    totalCollateralValue: 0n,
    totalDebtValueRay: 0n,
    healthFactor: 0n,
  },
  totalCollateral: 0n,
  accountDataReceivedAt: 0,
};

const readPositions = vi.mocked(getUserPositionsWithLiveData);

function readsSucceed(positions: unknown[] = [POSITION]) {
  readPositions.mockResolvedValue(positions as never);
}

function readsFail() {
  readPositions.mockRejectedValue(new Error("RPC failure"));
}

function readsFailSlowly() {
  readPositions.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("RPC request timed out")),
          SLOW_ATTEMPT_MS,
        );
      }),
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useAaveUserPosition isPositionUnavailable", () => {
  let client: QueryClient;

  /** `seen` holds `isPositionUnavailable` from every render, in order. */
  function renderPosition(address: string | undefined) {
    const seen: boolean[] = [];
    const rendered = renderHook(
      ({ account }: { account: string | undefined }) => {
        const position = useAaveUserPosition(account);
        seen.push(position.isPositionUnavailable);
        return position;
      },
      {
        initialProps: { account: address },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    return { ...rendered, seen };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    readPositions.mockReset();
    vi.useFakeTimers();
    client = createQueryClient();
  });

  afterEach(() => {
    cleanup();
    client.clear();
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it("is false with no wallet, whose read never runs", async () => {
    const { result } = renderPosition(undefined);
    await advance(SETTLE_MS);

    expect(readPositions).not.toHaveBeenCalled();
    expect(result.current.isPositionUnavailable).toBe(false);
  });

  it("is false until the first read's second attempt fails", async () => {
    readsFail();
    const { result } = renderPosition(USER);

    // The first attempt has failed, and its retry is due in 1s.
    await advance(SETTLE_MS);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPositionUnavailable).toBe(false);

    await advance(1_000);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("turns true on a slow first read's second failed attempt, long before its retries run out", async () => {
    readsFailSlowly();
    const { result } = renderPosition(USER);

    await advance(SLOW_ATTEMPT_MS + SETTLE_MS);
    expect(result.current.isPositionUnavailable).toBe(false);

    await advance(1_000 + SLOW_ATTEMPT_MS);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("turns true at once for a first read that cannot be retried", async () => {
    readPositions.mockRejectedValue(
      Object.assign(new Error("Not retryable"), { retryable: false }),
    );
    const { result } = renderPosition(USER);

    await advance(SETTLE_MS);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("turns true once the first read fails, and holds through the next poll's retries", async () => {
    readsFail();
    const { result } = renderPosition(USER);

    await advance(RETRIES_MS + SETTLE_MS);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPositionUnavailable).toBe(true);

    // The next poll resets a query with no data to pending: this is why `error`
    // and `isLoading` can't carry the signal.
    await advance(POLL_INTERVAL_MS + SETTLE_MS);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("clears once a read succeeds after the first one failed", async () => {
    readsFail();
    const { result } = renderPosition(USER);
    await advance(RETRIES_MS + SETTLE_MS);
    expect(result.current.isPositionUnavailable).toBe(true);

    readsSucceed();
    await advance(POLL_INTERVAL_MS + SETTLE_MS);

    expect(result.current.position).not.toBeNull();
    expect(result.current.isPositionUnavailable).toBe(false);
  });

  it("stays false for failed refetches inside the staleness threshold", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);

    readsFail();
    await advance(FAILED_CYCLE_MS);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.position).not.toBeNull();
    expect(result.current.isPositionUnavailable).toBe(false);

    await advance(FAILED_CYCLE_MS);
    expect(result.current.isPositionUnavailable).toBe(false);
  });

  it("turns true once a refetch fails past the threshold, and holds while the next one retries", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);

    readsFail();
    await advance(3 * FAILED_CYCLE_MS);
    expect(result.current.position).not.toBeNull();
    expect(result.current.isPositionUnavailable).toBe(true);

    // In flight: this is why `isPositionDataStale` can't carry the signal.
    await advance(POLL_INTERVAL_MS + SETTLE_MS);
    expect(result.current.isPositionDataStale).toBe(false);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("turns true at the threshold itself, between failed refetches", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);

    // The last failure settled at t74, and the next poll starts at t104. Stepped
    // so each render flushes as in a browser: one long act would batch them and
    // leave `isPositionDataStale`'s interval due at t90, which hides the hook's
    // own timer.
    readsFail();
    for (let second = 0; second < 89; second++) {
      await advance(1_000);
    }
    expect(result.current.isPositionUnavailable).toBe(false);

    await advance(1_000);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("turns true at the threshold while a slow failing refetch has not settled", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);

    // Four attempts from the poll at t30 settle around t118.
    readsFailSlowly();
    await advance(90_000);

    expect(result.current.position).not.toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("counts the threshold from the latest success, not the first", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    // Healthy polls at t30 and t60, then an outage.
    await advance(2 * POLL_INTERVAL_MS);
    expect(readPositions).toHaveBeenCalledTimes(3);
    readsFail();

    // t100: past 90s from the first read, but only 40s from the latest.
    await advance(40_000);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isPositionUnavailable).toBe(false);

    await advance(51_000);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("holds when refetch restarts a slow failing fetch before any error has settled", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFailSlowly();
    await advance(90_000);
    expect(result.current.isPositionUnavailable).toBe(true);

    void result.current.refetch().catch(() => undefined);
    await advance(10_000);

    expect(result.current.error).toBeNull();
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("holds when invalidateQueries restarts a slow failing fetch before any error has settled", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFailSlowly();
    await advance(90_000);
    expect(result.current.isPositionUnavailable).toBe(true);

    void client.invalidateQueries({ queryKey: ["aaveUserPosition"] });
    await advance(10_000);

    expect(result.current.error).toBeNull();
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("remembers failures from before a restart once the read crosses the threshold", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFailSlowly();
    // Two attempts have failed by t72.
    await advance(75_000);

    void result.current.refetch().catch(() => undefined);
    await advance(16_000);

    expect(result.current.error).toBeNull();
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("clears when a restarted fetch succeeds", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFailSlowly();
    await advance(90_000);
    void result.current.refetch().catch(() => undefined);
    await advance(SETTLE_MS);
    expect(result.current.isPositionUnavailable).toBe(true);

    // The attempt in flight fails, and its retry a second later succeeds.
    readsSucceed();
    await advance(SLOW_ATTEMPT_MS + 1_000 + SETTLE_MS);

    expect(result.current.isPositionUnavailable).toBe(false);
  });

  it("reads the clock at render, so a read aged while timers were suspended counts as old", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);

    // A device sleeping: the wall clock jumps and no timer moves.
    vi.setSystemTime(Date.now() + 3_600_000);
    readsFail();
    await advance(POLL_INTERVAL_MS + 1_000 + SETTLE_MS);

    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("holds while the next refetch's first attempt has not failed yet", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFail();
    await advance(3 * FAILED_CYCLE_MS);
    expect(result.current.isPositionUnavailable).toBe(true);

    // A new fetch resets the failure count, so only `errorUpdatedAt` holds it.
    readPositions.mockReturnValue(new Promise(() => {}));
    await advance(POLL_INTERVAL_MS + SETTLE_MS);

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("is true from the first render on mounting over a cached read past the threshold and failing", async () => {
    readsSucceed();
    const { result, unmount } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFail();
    await advance(3 * FAILED_CYCLE_MS);
    expect(result.current.isPositionUnavailable).toBe(true);
    unmount();

    readPositions.mockReturnValue(new Promise(() => {}));
    const { seen } = renderPosition(USER);
    await advance(SETTLE_MS);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(false);
  });

  it("is true from the first render for a hook mounted after a restart", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFailSlowly();
    // Two attempts have failed by t72.
    await advance(75_000);

    // t91: past the threshold, with the restarted attempt in flight and no
    // fetch yet out of retries.
    void result.current.refetch().catch(() => undefined);
    await advance(16_000);
    expect(result.current.isPositionUnavailable).toBe(true);

    const { seen } = renderPosition(USER);
    await advance(SETTLE_MS);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(false);
  });

  it("is true from the first render for a hook mounted while a slow failing refetch retries", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFailSlowly();
    await advance(90_000);
    expect(result.current.isPositionUnavailable).toBe(true);

    const { seen } = renderPosition(USER);
    await advance(SETTLE_MS);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(false);
  });

  it("forgets the failures once a read succeeds, so a later healthy refocus never flips", async () => {
    readsSucceed();
    const { result, seen } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFail();
    await advance(3 * FAILED_CYCLE_MS);
    expect(result.current.isPositionUnavailable).toBe(true);
    readsSucceed();
    await advance(POLL_INTERVAL_MS + SETTLE_MS);
    expect(result.current.isPositionUnavailable).toBe(false);
    const rendersBeforeHiding = seen.length;

    focusManager.setFocused(false);
    await advance(5 * 60_000);
    readPositions.mockReturnValue(new Promise(() => {}));
    focusManager.setFocused(true);
    await advance(SETTLE_MS);

    expect(seen.slice(rendersBeforeHiding)).not.toContain(true);
  });

  it("forgets a failure seen on retries once a read succeeds", async () => {
    readsSucceed();
    const { result, seen } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFailSlowly();
    await advance(75_000);
    void result.current.refetch().catch(() => undefined);
    await advance(SETTLE_MS);

    // The attempt in flight fails, and its retry a second later succeeds.
    readsSucceed();
    await advance(SLOW_ATTEMPT_MS + 1_000 + SETTLE_MS);
    const rendersBeforeHiding = seen.length;

    focusManager.setFocused(false);
    // Old enough to count, and short of the query cache collecting the memory.
    await advance(2 * 60_000);
    readPositions.mockReturnValue(new Promise(() => {}));
    focusManager.setFocused(true);
    await advance(SETTLE_MS);

    expect(seen.slice(rendersBeforeHiding)).not.toContain(true);
  });

  it("clears as soon as a refetch succeeds", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    readsFail();
    await advance(3 * FAILED_CYCLE_MS);
    expect(result.current.isPositionUnavailable).toBe(true);

    readsSucceed();
    await advance(POLL_INTERVAL_MS + SETTLE_MS);

    expect(result.current.error).toBeNull();
    expect(result.current.isPositionUnavailable).toBe(false);
  });

  it("stays false for a healthy tab refetching a read it let go old while hidden", async () => {
    readsSucceed();
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);

    focusManager.setFocused(false);
    await advance(5 * 60_000);
    expect(readPositions).toHaveBeenCalledTimes(1);
    expect(result.current.isPositionDataStale).toBe(true);
    expect(result.current.isPositionUnavailable).toBe(false);

    readPositions.mockReturnValue(new Promise(() => {}));
    focusManager.setFocused(true);
    await advance(SETTLE_MS);

    expect(readPositions).toHaveBeenCalledTimes(2);
    expect(result.current.isPositionUnavailable).toBe(false);
  });

  it("never flips for a failed attempt its own retry rescues, on a tab back from hidden", async () => {
    readsSucceed();
    const { seen } = renderPosition(USER);
    await advance(SETTLE_MS);
    focusManager.setFocused(false);
    await advance(5 * 60_000);

    readPositions.mockRejectedValueOnce(new Error("Network changed"));
    focusManager.setFocused(true);
    await advance(SETTLE_MS);
    expect(readPositions).toHaveBeenCalledTimes(2);

    await advance(1_000 + SETTLE_MS);

    expect(readPositions).toHaveBeenCalledTimes(3);
    expect(seen).not.toContain(true);
  });

  it("turns true for an account last read as empty, which may no longer be", async () => {
    readsSucceed([]);
    const { result } = renderPosition(USER);
    await advance(SETTLE_MS);
    expect(result.current.position).toBeNull();
    expect(result.current.isPositionUnavailable).toBe(false);

    readsFail();
    await advance(3 * FAILED_CYCLE_MS);

    expect(result.current.position).toBeNull();
    expect(result.current.isPositionUnavailable).toBe(true);
  });

  it("starts clean for another wallet after this one's read failed", async () => {
    readsFail();
    const { result, rerender } = renderPosition(USER);
    await advance(RETRIES_MS + SETTLE_MS);
    expect(result.current.isPositionUnavailable).toBe(true);

    readPositions.mockReturnValue(new Promise(() => {}));
    rerender({ account: OTHER_USER });
    await advance(SETTLE_MS);

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPositionUnavailable).toBe(false);
  });
});
