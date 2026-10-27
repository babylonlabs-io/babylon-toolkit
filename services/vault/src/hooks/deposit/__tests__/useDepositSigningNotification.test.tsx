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
      useDepositSigningNotification(
        DepositFlowStep.DERIVE_VAULT_SECRET,
        false,
        null,
      ),
    );
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it.each([
    [DepositFlowStep.SIGN_POP, "pop"],
    [DepositFlowStep.SUBMIT_PEGIN, "register"],
    [DepositFlowStep.BROADCAST_PRE_PEGIN, "broadcast"],
    [DepositFlowStep.SIGN_PAYOUTS, "payouts"],
  ] as const)("notifies for %s once active", (step, phase) => {
    renderHook(() => useDepositSigningNotification(step, true, null));
    expect(ctx.notify).toHaveBeenCalledTimes(1);
    expect(ctx.notify.mock.calls[0][0]).toContain(`:${phase}`);
  });

  it("collapses auth-anchor/payout/recovery to one payout phase key", () => {
    expect(DepositFlowStep.SIGN_AUTH_ANCHOR).not.toBe(
      DepositFlowStep.SIGN_DEPOSITOR_GRAPH,
    );
    renderHook(() =>
      useDepositSigningNotification(
        DepositFlowStep.SIGN_AUTH_ANCHOR,
        true,
        null,
      ),
    );
    expect(ctx.notify.mock.calls[0][0]).toContain(":payouts");
  });

  it("does not notify for a non-signing step", () => {
    renderHook(() =>
      useDepositSigningNotification(
        DepositFlowStep.AWAIT_VP_VERIFICATION,
        true,
        null,
      ),
    );
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("does not repeat registration alerts on tab or vault index changes", () => {
    const { rerender } = renderHook(
      ({ index }) =>
        useDepositSigningNotification(
          DepositFlowStep.SUBMIT_PEGIN,
          true,
          index,
        ),
      { initialProps: { index: 0 } },
    );
    ctx.notify.mockClear();

    ctx.documentHidden = true;
    rerender({ index: 0 });
    rerender({ index: 1 });

    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("calls the notifier again when the flow re-enters the payout phase", () => {
    const { rerender } = renderHook(
      ({ step }) => useDepositSigningNotification(step, true, null),
      { initialProps: { step: DepositFlowStep.SIGN_DEPOSITOR_GRAPH } },
    );
    ctx.notify.mockClear();

    rerender({ step: DepositFlowStep.AWAIT_VP_VERIFICATION });
    rerender({ step: DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS });
    rerender({ step: DepositFlowStep.SIGN_AUTH_ANCHOR });

    expect(ctx.notify).toHaveBeenCalledTimes(1);
    expect(ctx.notify.mock.calls[0][0]).toContain(":payouts");
  });

  it("notifies for the next signing step the flow reaches", () => {
    const { rerender } = renderHook(
      ({ step }) => useDepositSigningNotification(step, true, null),
      { initialProps: { step: DepositFlowStep.SUBMIT_PEGIN } },
    );
    ctx.notify.mockClear();

    rerender({ step: DepositFlowStep.BROADCAST_PRE_PEGIN });

    expect(ctx.notify).toHaveBeenCalledTimes(1);
    expect(ctx.notify.mock.calls[0][0]).toContain(":broadcast");
  });

  it("notifies once per WOTS vault and skips a cleared index", () => {
    const { rerender } = renderHook(
      ({ index }: { index: number | null }) =>
        useDepositSigningNotification(
          DepositFlowStep.SUBMIT_WOTS_KEYS,
          true,
          index,
        ),
      { initialProps: { index: 0 as number | null } },
    );
    expect(ctx.notify).toHaveBeenCalledTimes(1);
    rerender({ index: 0 });
    expect(ctx.notify).toHaveBeenCalledTimes(1);
    rerender({ index: 1 });
    expect(ctx.notify).toHaveBeenCalledTimes(2);
    expect(ctx.notify.mock.calls[0][0]).toContain(":wots:0");
    expect(ctx.notify.mock.calls[1][0]).toContain(":wots:1");
    rerender({ index: null });
    expect(ctx.notify).toHaveBeenCalledTimes(2);
  });
});
