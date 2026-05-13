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

vi.mock("../useActivities", () => ({
  useActivities: (arg: unknown) => useActivitiesMock(arg),
}));

vi.mock("../../services/activity", () => ({
  getPendingActivities: (arg: unknown) => getPendingActivitiesMock(arg),
}));

const ADDR = "0xabc0000000000000000000000000000000000001" as const;

function makePending(id: string, dateMs: number): ActivityLog {
  return {
    id,
    date: new Date(dateMs),
  } as ActivityLog;
}

describe("useActivitiesWithPending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActivitiesMock.mockReturnValue({ data: [], isLoading: false });
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
    const pending = [makePending("pending-1", 2_000)];
    const confirmed = [makePending("confirmed-1", 1_000)];
    getPendingActivitiesMock.mockReturnValue(pending);
    useActivitiesMock.mockReturnValue({ data: confirmed, isLoading: false });

    const { result } = renderHook(() => useActivitiesWithPending(ADDR));

    expect(result.current.data.map((a) => a.id)).toEqual([
      "pending-1",
      "confirmed-1",
    ]);
  });
});
