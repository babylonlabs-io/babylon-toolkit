import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SigningNotificationProvider } from "@/context/SigningNotificationContext";

import { DepositFlowStep } from "../depositFlowSteps/types";
import { useDepositSigningNotification } from "../useDepositSigningNotification";

const shown = vi.fn();
class TestNotification {
  static permission: NotificationPermission = "granted";
  close = vi.fn();
  constructor(title: string, options: NotificationOptions) {
    shown(title, options);
  }
}

const wrapper = ({ children }: React.PropsWithChildren) => (
  <SigningNotificationProvider>{children}</SigningNotificationProvider>
);
const initial = {
  step: DepositFlowStep.SUBMIT_WOTS_KEYS,
  active: true,
  index: 0 as number | null,
  waiting: true,
};
function renderFlow(state = initial) {
  return renderHook(
    ({ step, active, index, waiting }) =>
      useDepositSigningNotification(step, active, index, waiting),
    { initialProps: state, wrapper },
  );
}
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

describe("useDepositSigningNotification with its provider", () => {
  beforeEach(() => {
    shown.mockClear();
    TestNotification.permission = "granted";
    vi.stubGlobal("Notification", TestNotification);
    setVisibility("hidden");
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not notify before the flow starts", () => {
    renderFlow({ ...initial, active: false, waiting: false });
    expect(shown).not.toHaveBeenCalled();
  });

  it("does not ask for an action during automatic cached WOTS submission", () => {
    const { rerender } = renderFlow();
    rerender({ ...initial, index: 1 });
    rerender({ ...initial, index: null });
    expect(shown).not.toHaveBeenCalled();
  });

  it("notifies once for each WOTS wallet request and skips a cleared index", () => {
    const { rerender } = renderFlow();
    rerender({ ...initial, waiting: false });
    rerender({ ...initial, waiting: false });
    rerender({ ...initial, index: null, waiting: false });
    expect(shown).toHaveBeenCalledTimes(1);
    rerender({ ...initial, index: 1 });
    rerender({ ...initial, index: 1, waiting: false });
    expect(shown).toHaveBeenCalledTimes(2);
    expect(shown.mock.calls[0][1].tag).toContain(":wots:0");
    expect(shown.mock.calls[1][1].tag).toContain(":wots:1");
  });

  it("groups payout signing within each vault, then notifies for the next vault", () => {
    const { rerender } = renderFlow({
      ...initial,
      step: DepositFlowStep.SIGN_AUTH_ANCHOR,
    });
    expect(shown).toHaveBeenCalledTimes(1);
    for (const index of [0, 1]) {
      for (const step of [
        DepositFlowStep.SIGN_AUTH_ANCHOR,
        DepositFlowStep.SIGN_PAYOUTS,
        DepositFlowStep.SIGN_DEPOSITOR_GRAPH,
      ]) {
        rerender({ ...initial, step, index, waiting: false });
        rerender({ ...initial, step, index });
      }
      expect(shown).toHaveBeenCalledTimes(index + 1);
    }
    expect(shown.mock.calls[0][1].tag).toContain(":payouts:0");
    expect(shown.mock.calls[1][1].tag).toContain(":payouts:1");
  });

  it.each([
    DepositFlowStep.AWAIT_BTC_CONFIRMATION,
    DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
    DepositFlowStep.AWAIT_VP_VERIFICATION,
  ])("does not notify for the automatic wait %s", (step) => {
    renderFlow({ ...initial, step, waiting: false });
    expect(shown).not.toHaveBeenCalled();
  });

  it("does not send a stale registration alert after a tab or wait change", () => {
    setVisibility("visible");
    const state = { ...initial, step: DepositFlowStep.SUBMIT_PEGIN };
    const { rerender } = renderFlow({ ...state, waiting: false });
    setVisibility("hidden");
    rerender({ ...state, index: 1 });
    expect(shown).not.toHaveBeenCalled();
    rerender({ ...state, step: DepositFlowStep.BROADCAST_PRE_PEGIN });
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["visible", "granted"],
    ["hidden", "denied"],
    ["hidden", "default"],
  ] as const)(
    "suppresses wallet alerts when %s with permission %s",
    (visibility, permission) => {
      setVisibility(visibility);
      TestNotification.permission = permission;
      const { rerender } = renderFlow({ ...initial, waiting: false });
      rerender({
        ...initial,
        step: DepositFlowStep.SIGN_PAYOUTS,
        waiting: false,
      });
      expect(shown).not.toHaveBeenCalled();
    },
  );
});
