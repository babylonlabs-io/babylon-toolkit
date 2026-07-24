/**
 * Tests for useActivitiesWithPending hook
 *
 * Validates that activities returned to consumers are gated synchronously
 * on userAddress, so a connected → disconnected transition does not leak
 * the previous wallet's pendingActivities for one render.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityLog } from "../../types/activityLog";
import { useActivitiesWithPending } from "../useActivitiesWithPending";

const useActivitiesMock = vi.fn();
const getPendingActivitiesMock = vi.fn();
const useDemoActivityMock = vi.fn();

vi.mock("../useActivities", () => ({
  useActivities: (arg: unknown) => useActivitiesMock(arg),
}));

vi.mock("../../services/activity", () => ({
  getPendingActivities: (arg: unknown) => getPendingActivitiesMock(arg),
}));

vi.mock("../../dev/demoDeposit", () => ({
  useDemoActivity: () => useDemoActivityMock(),
}));

const ADDR = "0xabc0000000000000000000000000000000000001" as const;

function makePending(
  id: string,
  dateMs: number,
  tokenIcon = "/images/btc.svg",
): ActivityLog {
  return {
    kind: "row",
    id,
    date: new Date(dateMs),
    tokenIcon,
  } as ActivityLog;
}

describe("useActivitiesWithPending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActivitiesMock.mockReturnValue({ data: [], isLoading: false });
    useDemoActivityMock.mockReturnValue(null);
  });

  it("returns [] synchronously when userAddress is undefined, even if pending activities exist for a prior address", () => {
    const pending = [makePending("pending-1", 1_000)];
    getPendingActivitiesMock.mockReturnValue(pending);

    type Props = { addr: typeof ADDR | undefined };
    const initialProps: Props = { addr: ADDR };
    const { result, rerender } = renderHook<
      ReturnType<typeof useActivitiesWithPending>,
      Props
    >(({ addr }) => useActivitiesWithPending(addr), { initialProps });

    expect(result.current.data).toEqual(pending);

    rerender({ addr: undefined });

    expect(result.current.data).toEqual([]);
  });

  it("returns merged activities when userAddress is provided", () => {
    const pending = [makePending("pending-1", 2_000, "/images/btc.svg")];
    const confirmed = [makePending("confirmed-1", 1_000, "/images/usdc.svg")];
    getPendingActivitiesMock.mockReturnValue(pending);
    useActivitiesMock.mockReturnValue({ data: confirmed, isLoading: false });

    const { result } = renderHook(() => useActivitiesWithPending(ADDR));

    expect(result.current.data.map((a) => a.id)).toEqual([
      "pending-1",
      "confirmed-1",
    ]);
    expect(
      result.current.data.map((a) => (a.kind === "row" ? a.tokenIcon : null)),
    ).toEqual(["/images/btc.svg", "/images/usdc.svg"]);
  });
});

describe("useActivitiesWithPending — god-mode demo rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingActivitiesMock.mockReturnValue([]);
    useActivitiesMock.mockReturnValue({ data: [], isLoading: false });
    useDemoActivityMock.mockReturnValue(null);
  });

  it("renders demo rows while disconnected, without waiting on the live query", () => {
    useActivitiesMock.mockReturnValue({ data: [], isLoading: true });
    const demoRow = makePending("demo-activity-1", 5_000);
    useDemoActivityMock.mockReturnValue({ rows: [demoRow], hideReal: false });

    const { result } = renderHook(() => useActivitiesWithPending(undefined));

    expect(result.current.data).toEqual([demoRow]);
    expect(result.current.isLoading).toBe(false);
  });

  // hide-real with zero mocks is a deliberate empty demo-only feed, so the
  // page must show it rather than sitting on the live query's spinner.
  it("resolves to an empty feed when hide-real is set with no mocks", () => {
    useActivitiesMock.mockReturnValue({
      data: [makePending("confirmed-1", 1_000)],
      isLoading: true,
    });
    useDemoActivityMock.mockReturnValue({ rows: [], hideReal: true });

    const { result } = renderHook(() => useActivitiesWithPending(ADDR));

    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps the live loading state when the demo adds nothing to the feed", () => {
    useActivitiesMock.mockReturnValue({ data: [], isLoading: true });
    useDemoActivityMock.mockReturnValue({ rows: [], hideReal: false });

    const { result } = renderHook(() => useActivitiesWithPending(ADDR));

    expect(result.current.isLoading).toBe(true);
  });

  it("orders demo rows into the real feed by date, newest first", () => {
    const confirmed = makePending("confirmed-1", 3_000);
    const demoOlder = makePending("demo-activity-1", 2_000);
    useActivitiesMock.mockReturnValue({ data: [confirmed], isLoading: false });
    useDemoActivityMock.mockReturnValue({
      rows: [demoOlder],
      hideReal: false,
    });

    const { result } = renderHook(() => useActivitiesWithPending(ADDR));

    expect(result.current.data.map((row) => row.id)).toEqual([
      "confirmed-1",
      "demo-activity-1",
    ]);
  });
});
