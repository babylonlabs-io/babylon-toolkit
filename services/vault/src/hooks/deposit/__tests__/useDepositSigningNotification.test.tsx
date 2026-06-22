import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock("@/context/SigningNotificationContext", () => ({
  useSigningNotificationOptional: () => ({
    requestPermission: vi.fn(),
    notifySigningRequired: ctx.notify,
    shouldPromptForPermission: false,
    promptDismissed: false,
    dismissPrompt: vi.fn(),
    resetPromptDismissal: vi.fn(),
  }),
}));

import { DepositFlowStep } from "../depositFlowSteps/types";
import { useDepositSigningNotification } from "../useDepositSigningNotification";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

describe("useDepositSigningNotification", () => {
  beforeEach(() => {
    ctx.notify.mockClear();
    setVisibility("visible");
  });

  it("does not notify before the flow has started", () => {
    renderHook(() =>
      useDepositSigningNotification(DepositFlowStep.DERIVE_VAULT_SECRET, false),
    );
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("notifies for a pre-broadcast signing step once active", () => {
    renderHook(() =>
      useDepositSigningNotification(DepositFlowStep.SIGN_POP, true),
    );
    expect(ctx.notify).toHaveBeenCalledTimes(1);
    expect(ctx.notify.mock.calls[0][0]).toContain(
      `:${DepositFlowStep.SIGN_POP}`,
    );
  });

  it("does not notify for a post-broadcast step", () => {
    renderHook(() =>
      useDepositSigningNotification(DepositFlowStep.SUBMIT_PEGIN, true),
    );
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("re-fires when the tab becomes hidden", () => {
    renderHook(() =>
      useDepositSigningNotification(DepositFlowStep.SIGN_POP, true),
    );
    ctx.notify.mockClear();

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(ctx.notify).toHaveBeenCalledTimes(1);
  });
});
