import { renderHook } from "@testing-library/react";
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

import { PeginAction } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";

import { useSigningRequiredNotifications } from "../useSigningRequiredNotifications";

const ACTIVITIES = [{ id: "v1" }] as unknown as VaultActivity[];

function resultWith(actions: PeginAction[]): DepositPollingResult {
  return {
    isOwnedByCurrentWallet: true,
    loading: false,
    peginState: { availableActions: actions },
  } as unknown as DepositPollingResult;
}

function renderObserver(
  actions: PeginAction[],
  btcPublicKey: string | undefined,
) {
  renderHook(() =>
    useSigningRequiredNotifications(
      ACTIVITIES,
      () => resultWith(actions),
      btcPublicKey,
    ),
  );
}

describe("useSigningRequiredNotifications", () => {
  beforeEach(() => {
    ctx.notify.mockClear();
  });

  it("does not notify for payout signing when the BTC public key is unavailable", () => {
    renderObserver([PeginAction.SIGN_PAYOUT_TRANSACTIONS], undefined);
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("notifies for payout signing once the BTC public key is available", () => {
    renderObserver([PeginAction.SIGN_PAYOUT_TRANSACTIONS], "btcpubkey");
    expect(ctx.notify).toHaveBeenCalledTimes(1);
  });

  it("notifies for WOTS submission even without the BTC public key", () => {
    renderObserver([PeginAction.SUBMIT_WOTS_KEY], undefined);
    expect(ctx.notify).toHaveBeenCalledTimes(1);
  });
});
