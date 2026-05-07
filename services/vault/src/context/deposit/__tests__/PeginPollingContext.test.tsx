import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContractStatus,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
} from "../../../models/peginStateMachine";
import type { VaultActivity } from "../../../types/activity";
import { PeginPollingProvider, usePeginPolling } from "../PeginPollingContext";

const mockQueryResult = {
  errors: undefined as Map<string, Error> | undefined,
  needsWotsKey: undefined as Set<string> | undefined,
  pendingIngestion: undefined as Set<string> | undefined,
  pendingDepositorSignatures: undefined as Set<string> | undefined,
  isLoading: false,
  refetch: vi.fn(),
  depositsToPoll: [],
};

vi.mock("../../../hooks/deposit/usePeginPollingQuery", () => ({
  usePeginPollingQuery: () => mockQueryResult,
}));

const ACTIVITY_ID = "0xpegin" as Hex;
const BTC_PUBKEY = "ab".repeat(32);

const ACTIVITY: VaultActivity = {
  id: ACTIVITY_ID,
  collateral: { amount: "0.1", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  peginTxHash: ACTIVITY_ID,
  contractStatus: ContractStatus.PENDING,
  isInUse: false,
  displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
  depositorBtcPubkey: BTC_PUBKEY,
  unsignedPrePeginTx: "0xdeadbeef",
  depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
  depositorWotsPkHash: "0xwotsh",
};

function renderProvider() {
  const wrapper = ({ children }: PropsWithChildren) => (
    <PeginPollingProvider
      activities={[ACTIVITY]}
      pendingPegins={[]}
      btcPublicKey={BTC_PUBKEY}
    >
      {children}
    </PeginPollingProvider>
  );
  return renderHook(() => usePeginPolling(), { wrapper });
}

describe("PeginPollingContext", () => {
  beforeEach(() => {
    mockQueryResult.errors = undefined;
    mockQueryResult.needsWotsKey = undefined;
    mockQueryResult.pendingIngestion = undefined;
    mockQueryResult.pendingDepositorSignatures = undefined;
    mockQueryResult.isLoading = false;
    mockQueryResult.refetch.mockClear();
  });

  it("trusts an in-memory PAYOUT_SIGNED over a stale-cached transactionsReady so the Sign button hides immediately after signing", () => {
    // Reproduces the dashboard bug: after the user signs payouts, the
    // optimistic in-memory PAYOUT_SIGNED is set, but the previous 30s
    // poll cycle still has the deposit in `pendingDepositorSignatures`.
    // Without the fix, the VP cross-check in `applyTrackingOverrides`
    // rejects the optimistic status (treating it as "stale or tampered")
    // and re-exposes SIGN_PAYOUT_TRANSACTIONS until the next poll.
    mockQueryResult.pendingDepositorSignatures = new Set([ACTIVITY_ID]);

    const { result } = renderProvider();

    const before = result.current.getPollingResult(ACTIVITY_ID);
    expect(before?.peginState.availableActions).toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );

    act(() => {
      result.current.setOptimisticStatus(
        ACTIVITY_ID,
        LocalStorageStatus.PAYOUT_SIGNED,
      );
    });

    const after = result.current.getPollingResult(ACTIVITY_ID);
    expect(after?.peginState.availableActions).not.toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );
    expect(after?.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(after?.peginState.displayLabel).toBe(
      PEGIN_DISPLAY_LABELS.PROCESSING,
    );
  });

  it("does not suppress transactionsReady from a localStorage-only PAYOUT_SIGNED — keeps the existing stale-localStorage cross-check intact", () => {
    // Companion guarantee for the fix: the override only trusts
    // *in-memory* optimistic status (set in this session by the signing
    // flow). A PAYOUT_SIGNED loaded from localStorage on page reload could
    // be stale or tampered, so the VP cross-check must still apply.
    mockQueryResult.pendingDepositorSignatures = new Set([ACTIVITY_ID]);

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[ACTIVITY]}
        pendingPegins={[
          {
            id: ACTIVITY_ID,
            timestamp: 0,
            status: LocalStorageStatus.PAYOUT_SIGNED,
            peginTxHash: ACTIVITY_ID,
            unsignedTxHex: "0xdeadbeef",
          },
        ]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );

    const { result } = renderHook(() => usePeginPolling(), { wrapper });

    const status = result.current.getPollingResult(ACTIVITY_ID);
    expect(status?.peginState.availableActions).toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );
  });
});
