import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({
  notify: vi.fn(),
  documentHidden: false,
}));

vi.mock("@/context/SigningNotificationContext", () => ({
  useSigningNotificationOptional: () => ({
    requestPermission: vi.fn(),
    notifySigningRequired: ctx.notify,
    shouldPromptForPermission: false,
    dismissPrompt: vi.fn(),
    resetPromptDismissal: vi.fn(),
    documentHidden: ctx.documentHidden,
    isActiveFlow: false,
    setActiveFlow: vi.fn(),
  }),
}));

import { DepositFlowStep } from "../depositFlowSteps/types";
import { useDepositSigningNotification } from "../useDepositSigningNotification";

describe("useDepositSigningNotification", () => {
  beforeEach(() => {
    ctx.notify.mockClear();
    ctx.documentHidden = false;
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
    expect(ctx.notify.mock.calls[0][0]).toContain(":pop");
  });

  it("notifies for a post-broadcast payout signing step", () => {
    renderHook(() =>
      useDepositSigningNotification(DepositFlowStep.SIGN_PAYOUTS, true),
    );
    expect(ctx.notify).toHaveBeenCalledTimes(1);
    expect(ctx.notify.mock.calls[0][0]).toContain(":payouts");
  });

  it("collapses auth-anchor/payout/recovery to one payout phase key", () => {
    expect(DepositFlowStep.SIGN_AUTH_ANCHOR).not.toBe(
      DepositFlowStep.SIGN_DEPOSITOR_GRAPH,
    );
    renderHook(() =>
      useDepositSigningNotification(DepositFlowStep.SIGN_AUTH_ANCHOR, true),
    );
    expect(ctx.notify.mock.calls[0][0]).toContain(":payouts");
  });

  it("does not notify for a non-signing step", () => {
    renderHook(() =>
      useDepositSigningNotification(
        DepositFlowStep.AWAIT_VP_VERIFICATION,
        true,
      ),
    );
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("re-fires when the tab becomes hidden", () => {
    const { rerender } = renderHook(() =>
      useDepositSigningNotification(DepositFlowStep.SIGN_POP, true),
    );
    ctx.notify.mockClear();

    ctx.documentHidden = true;
    rerender();

    expect(ctx.notify).toHaveBeenCalledTimes(1);
  });
});
