import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The progress UI and split-progress hook are exercised elsewhere; here we only
// care that the runner advances the demo store on its timer. The split hook
// reads the polling context, so it must be stubbed to render outside a provider.
vi.mock("@/components/simple/DepositProgressView", () => ({
  DepositProgressView: () => <div data-testid="demo-progress" />,
}));

vi.mock("@/hooks/deposit/useSplitVaultProgress", () => ({
  useSplitVaultProgress: () => ({
    vaultCount: 1,
    currentVaultIndex: null,
    perVaultSteps: undefined,
  }),
}));

// The deposit-flow-steps barrel pulls the heavy ts-sdk step orchestration, which
// vitest can't transform. Re-export just the real DepositFlowStep enum (from the
// leaf types module) so the runner and its derived-state helper still see real
// step values.
vi.mock("@/hooks/deposit/depositFlowSteps", async () => ({
  DepositFlowStep: (
    await vi.importActual<
      typeof import("@/hooks/deposit/depositFlowSteps/types")
    >("@/hooks/deposit/depositFlowSteps/types")
  ).DepositFlowStep,
}));

import DemoActivationContent from "../DemoActivationContent";
import {
  ACTIVATION_CONFIRMING_SCENARIO_INDEX,
  buildDepositsDemo,
  READY_TO_ACTIVATE_SCENARIO_INDEX,
  resetDemoState,
  setDemoItemState,
  useDemoItems,
} from "../demoDeposit";

/** Reset to a single demo deposit parked at "ready to activate" and return a
 *  live view of the store plus that deposit's built VaultActivity. */
function readyToActivateVault() {
  const { result } = renderHook(() => useDemoItems());
  const key = result.current[0].key;
  act(() => setDemoItemState(key, READY_TO_ACTIVATE_SCENARIO_INDEX));
  const activity = buildDepositsDemo(result.current, false)
    .pendingActivities[0];
  return { items: result, activity };
}

describe("DemoActivationContent", () => {
  beforeEach(() => {
    resetDemoState();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances the demo store to the confirming state after the simulated beat", () => {
    const { items, activity } = readyToActivateVault();
    render(<DemoActivationContent activity={activity} onClose={vi.fn()} />);

    // Nothing happens until the simulated submission beat elapses.
    expect(items.current[0].stateIndex).toBe(READY_TO_ACTIVATE_SCENARIO_INDEX);

    act(() => vi.advanceTimersByTime(2000));
    expect(items.current[0].stateIndex).toBe(
      ACTIVATION_CONFIRMING_SCENARIO_INDEX,
    );
  });

  it("does not advance the store when unmounted before the beat elapses", () => {
    const { items, activity } = readyToActivateVault();
    const { unmount } = render(
      <DemoActivationContent activity={activity} onClose={vi.fn()} />,
    );
    unmount();

    act(() => vi.advanceTimersByTime(5000));
    expect(items.current[0].stateIndex).toBe(READY_TO_ACTIVATE_SCENARIO_INDEX);
  });
});
