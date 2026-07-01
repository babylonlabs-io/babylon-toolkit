import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import {
  canPerformAction,
  ContractStatus,
  getNextLocalStatus,
  getPeginDisplayStep,
  getPeginState,
  getPrimaryActionButton,
  isRefundInFlightOrSettled,
  isVaultActivated,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
  type PeginState,
  shouldRemoveFromLocalStorage,
} from "../peginStateMachine";

describe("peginStateMachine", () => {
  // ==========================================================================
  // getPeginState — PENDING contract status
  // ==========================================================================
  describe("getPeginState - PENDING", () => {
    it("offers broadcast when VP has not ingested yet", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.availableActions).toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
      expect(state.message).toContain("not detected your deposit");
    });

    it("shows waiting state after broadcast even if VP has not ingested yet", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(state.message).toContain(
        "Pre-Pegin transaction has been broadcast",
      );
    });

    it("shows the VP-ingestion message at the confirming-deposit step when BTC is confirmed but VP still ingesting", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: true,
        prePeginBroadcastConfirmed: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(state.message).toContain("Waiting for vault provider to ingest");
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_BTC_CONFIRMATION,
      );
    });

    it("drops the broadcast action and surfaces VP ingestion when BTC is confirmed at depth with no local tracking", () => {
      // Cross-window / cleared-storage case: no localStatus CONFIRMING marker
      // survives, so the SDK still offers SIGN_AND_BROADCAST. But the chain
      // proves the Pre-PegIn is confirmed at protocol depth, so there is
      // nothing left to broadcast — the deposit is waiting on the VP, not BTC.
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: true,
        prePeginBroadcastConfirmed: true,
      });
      expect(state.availableActions).not.toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
      expect(state.message).toBe(COPY.pegin.messages.prePeginIngesting);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_BTC_CONFIRMATION,
      );
    });

    it("keeps the broadcast action and shows 'not detected' when prePeginBroadcastConfirmed is not set", () => {
      // Counter to the chain-truth override: with no chain confirmation signal
      // the legit "broadcast may have failed" prompt must still appear.
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: true,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
      expect(state.message).toBe(COPY.pegin.messages.broadcastMayHaveFailed);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.BROADCAST_PRE_PEGIN,
      );
    });

    it("drops the broadcast action and shows the BTC-confirmation wait when the Pre-PegIn is seen on chain but shallow, with no local tracking", () => {
      // Cross-tab case (Image #11): the broadcasting tab wrote CONFIRMING; this
      // tab has no local marker, so the SDK still offers SIGN_AND_BROADCAST.
      // The chain proves the tx is already on the network, so every tab must
      // agree it is broadcast and waiting on Bitcoin depth — not re-offer it.
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: true,
        prePeginBroadcastSeen: true,
      });
      expect(state.availableActions).not.toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
      expect(state.message).toBe(COPY.pegin.messages.prePeginBroadcast);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_BTC_CONFIRMATION,
      );
    });

    it("shows the VP-ingestion message (not the BTC-confirmation message) at step 6 when seen and confirmed at depth", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: true,
        prePeginBroadcastSeen: true,
        prePeginBroadcastConfirmed: true,
      });
      expect(state.availableActions).not.toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
      expect(state.message).toBe(COPY.pegin.messages.prePeginIngesting);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_BTC_CONFIRMATION,
      );
    });

    it("does NOT show the VP-ingestion wait when VP has already ingested", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: false,
        prePeginBroadcastConfirmed: true,
      });
      // BTC confirmed AND ingested → falls through to the payout-prep branch,
      // not the VP-ingestion message.
      expect(state.message).not.toBe(COPY.pegin.messages.prePeginIngesting);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
      );
    });

    it("shows preparing transactions when CONFIRMING and VP has ingested", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: false,
        transactionsReady: false,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.message).toContain("prepare claim and payout");
    });

    it("shows signing required when CONFIRMING and transactions are ready", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: false,
        transactionsReady: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.SIGNING_REQUIRED);
      expect(state.availableActions).toContain(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
    });

    it("shows pending ingestion when no polling response yet (undefined)", () => {
      const state = getPeginState(ContractStatus.PENDING, {});
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.message).toContain("detect your deposit");
    });

    it("shows awaiting key when VP needs WOTS key", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        needsWotsKey: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.AWAITING_KEY);
      expect(state.availableActions).toContain(PeginAction.SUBMIT_WOTS_KEY);
    });

    it("shows preparing transactions when VP ingested but not ready", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: false,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.message).toContain("prepare claim and payout");
    });

    it("shows signing required when transactions are ready", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.SIGNING_REQUIRED);
      expect(state.availableActions).toContain(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
    });

    it("shows processing after payout signed", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.PAYOUT_SIGNED,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PROCESSING);
      expect(state.message).toContain("verifying and collecting");
    });

    it("ignores stale PAYOUT_SIGNED when VP still needs WOTS key", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.PAYOUT_SIGNED,
        needsWotsKey: true,
      });
      expect(state.availableActions).toContain(PeginAction.SUBMIT_WOTS_KEY);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.AWAITING_KEY);
    });

    it("ignores stale PAYOUT_SIGNED when VP has transactions ready", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.PAYOUT_SIGNED,
        transactionsReady: true,
        pendingIngestion: false,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.SIGNING_REQUIRED);
    });

    it("ignores stale PAYOUT_SIGNED when VP reports pending ingestion", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.PAYOUT_SIGNED,
        pendingIngestion: true,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
    });
  });

  // ==========================================================================
  // getPeginState — VERIFIED contract status
  // ==========================================================================
  describe("getPeginState - VERIFIED", () => {
    it("shows ready to activate by default (pre-pegin guaranteed on-chain at VERIFIED)", () => {
      const state = getPeginState(ContractStatus.VERIFIED);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE);
      expect(state.availableActions).toContain(PeginAction.ACTIVATE_VAULT);
      expect(state.message).toContain("Reveal your HTLC secret");
    });

    it("shows ready to activate when BTC tx is broadcast", () => {
      const state = getPeginState(ContractStatus.VERIFIED, {
        localStatus: LocalStorageStatus.CONFIRMING,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE);
      expect(state.availableActions).toContain(PeginAction.ACTIVATE_VAULT);
    });

    it("shows processing when vault is activated but indexer hasn't caught up", () => {
      const state = getPeginState(ContractStatus.VERIFIED, {
        localStatus: LocalStorageStatus.CONFIRMED,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PROCESSING);
      expect(state.availableActions).toEqual([PeginAction.NONE]);
    });

    it("gates Activate as expired when the activation deadline passed on-chain", () => {
      const state = getPeginState(ContractStatus.VERIFIED, {
        activationDeadlinePassed: true,
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(state.availableActions).not.toContain(PeginAction.ACTIVATE_VAULT);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.EXPIRED);
      expect(state.displayVariant).toBe("warning");
      expect(state.message).toContain("not activated in time");
      expect(getPrimaryActionButton(state)).toBeNull();
      // warning variant → no progress step
      expect(getPeginDisplayStep(state)).toBeNull();
    });

    it("keeps Activate available when the deadline has not passed", () => {
      const state = getPeginState(ContractStatus.VERIFIED, {
        activationDeadlinePassed: false,
      });
      expect(state.availableActions).toContain(PeginAction.ACTIVATE_VAULT);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE);
    });
  });

  // ==========================================================================
  // getPeginState — ACTIVE contract status
  // ==========================================================================
  describe("getPeginState - ACTIVE", () => {
    it("shows available when not in use", () => {
      const state = getPeginState(ContractStatus.ACTIVE, { isInUse: false });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.AVAILABLE);
      expect(state.availableActions).toEqual([PeginAction.NONE]);
    });

    it("shows in use when used as collateral", () => {
      const state = getPeginState(ContractStatus.ACTIVE, { isInUse: true });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.IN_USE);
      expect(state.availableActions).toEqual([PeginAction.NONE]);
    });
  });

  // ==========================================================================
  // getPeginState — Terminal statuses
  // ==========================================================================
  describe("getPeginState - terminal statuses", () => {
    it("shows redeem in progress", () => {
      const state = getPeginState(ContractStatus.REDEEMED);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS);
    });

    it("shows liquidated", () => {
      const state = getPeginState(ContractStatus.LIQUIDATED);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.LIQUIDATED);
      expect(state.displayVariant).toBe("danger");
    });

    it("shows invalid", () => {
      const state = getPeginState(ContractStatus.INVALID);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.INVALID);
    });

    it("shows redeemed (depositor withdrawn)", () => {
      const state = getPeginState(ContractStatus.DEPOSITOR_WITHDRAWN);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REDEEMED);
      expect(state.displayVariant).toBe("inactive");
    });
  });

  // ==========================================================================
  // getPeginState — EXPIRED contract status
  // ==========================================================================
  describe("getPeginState - EXPIRED", () => {
    it("shows expired with no reason or timestamp", () => {
      const state = getPeginState(ContractStatus.EXPIRED);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.EXPIRED);
      expect(state.displayVariant).toBe("warning");
      expect(state.message).toBe("This BTC Vault has expired.");
    });

    it("shows expired with ack_timeout reason", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        expirationReason: "ack_timeout",
      });
      expect(state.message).toContain("This BTC Vault has expired.");
      expect(state.message).toContain(
        "The vault provider did not acknowledge in time",
      );
    });

    it("shows expired with proof_timeout reason", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        expirationReason: "proof_timeout",
      });
      expect(state.message).toContain(
        "The inclusion proof was not submitted in time",
      );
    });

    it("shows expired with timestamp (minutes ago)", () => {
      const now = Date.now();
      vi.useFakeTimers({ now });
      const state = getPeginState(ContractStatus.EXPIRED, {
        expiredAt: now - 15 * 60_000, // 15 minutes ago
      });
      expect(state.message).toContain("Expired 15m ago.");
      vi.useRealTimers();
    });

    it("shows expired with timestamp (hours ago)", () => {
      const now = Date.now();
      vi.useFakeTimers({ now });
      const state = getPeginState(ContractStatus.EXPIRED, {
        expiredAt: now - 3 * 60 * 60_000, // 3 hours ago
      });
      expect(state.message).toContain("Expired 3h ago.");
      vi.useRealTimers();
    });

    it("shows expired with timestamp (days ago)", () => {
      const now = Date.now();
      vi.useFakeTimers({ now });
      const state = getPeginState(ContractStatus.EXPIRED, {
        expiredAt: now - 5 * 24 * 60 * 60_000, // 5 days ago
      });
      expect(state.message).toContain("Expired 5d ago.");
      vi.useRealTimers();
    });

    it("shows 'just now' for future timestamp", () => {
      const now = Date.now();
      vi.useFakeTimers({ now });
      const state = getPeginState(ContractStatus.EXPIRED, {
        expiredAt: now + 10_000,
      });
      expect(state.message).toContain("Expired just now.");
      vi.useRealTimers();
    });

    it("shows 'just now' for less than a minute ago", () => {
      const now = Date.now();
      vi.useFakeTimers({ now });
      const state = getPeginState(ContractStatus.EXPIRED, {
        expiredAt: now - 30_000, // 30 seconds ago
      });
      expect(state.message).toContain("Expired just now.");
      vi.useRealTimers();
    });

    it("shows full message with reason and timestamp", () => {
      const now = Date.now();
      vi.useFakeTimers({ now });
      const state = getPeginState(ContractStatus.EXPIRED, {
        expirationReason: "ack_timeout",
        expiredAt: now - 2 * 60 * 60_000,
      });
      expect(state.message).toBe(
        "This BTC Vault has expired. The vault provider did not acknowledge in time. Expired 2h ago.",
      );
      vi.useRealTimers();
    });

    it("offers REFUND_HTLC action when canRefund is true", () => {
      const state = getPeginState(ContractStatus.EXPIRED, { canRefund: true });
      expect(state.availableActions).toEqual([PeginAction.REFUND_HTLC]);
    });

    it("offers no action when canRefund is false", () => {
      const state = getPeginState(ContractStatus.EXPIRED, { canRefund: false });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
    });

    it("offers no action when canRefund is not provided", () => {
      const state = getPeginState(ContractStatus.EXPIRED);
      expect(state.availableActions).toEqual([PeginAction.NONE]);
    });

    it("hides refund action and flips label to Refunding after the user has broadcast a refund", () => {
      const now = 1_700_000_000_000;
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: true,
        localStatus: LocalStorageStatus.REFUND_BROADCAST,
        refundBroadcastAt: now - 60_000,
        now,
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDING);
      expect(state.displayVariant).toBe("pending");
    });

    it("re-exposes refund action once the broadcast TTL has elapsed (dropped tx)", () => {
      const now = 1_700_000_000_000;
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: true,
        localStatus: LocalStorageStatus.REFUND_BROADCAST,
        refundBroadcastAt: now - 7 * 60 * 60 * 1000,
        now,
      });
      expect(state.availableActions).toEqual([PeginAction.REFUND_HTLC]);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.EXPIRED);
    });

    it("treats legacy REFUND_BROADCAST without timestamp as expired (allows retry)", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: true,
        localStatus: LocalStorageStatus.REFUND_BROADCAST,
      });
      expect(state.availableActions).toEqual([PeginAction.REFUND_HTLC]);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.EXPIRED);
    });

    it("shows Refunded (terminal, no action) when the HTLC spend has confirmed", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: false,
        refundSettlement: "confirmed",
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDED);
      expect(state.displayVariant).toBe("inactive");
      expect(state.availableActions).toEqual([PeginAction.NONE]);
    });

    it("shows Refunding when the HTLC spend is seen but not yet confirmed", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: false,
        refundSettlement: "pending",
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDING);
      expect(state.displayVariant).toBe("pending");
    });

    it("chain-confirmed refund overrides a stale REFUND_BROADCAST optimistic state", () => {
      const now = 1_700_000_000_000;
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: false,
        refundSettlement: "confirmed",
        localStatus: LocalStorageStatus.REFUND_BROADCAST,
        refundBroadcastAt: now - 60_000,
        now,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDED);
    });

    it("surfaces a CSV-maturing countdown when refund timelock has not elapsed", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        expirationReason: "ack_timeout",
        canRefund: false,
        refundMaturityState: "maturing",
        refundMaturesInBlocks: 24,
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(state.refundMaturityState).toBe("maturing");
      expect(state.refundMaturesInBlocks).toBe(24);
      // 24 blocks × 10 min = 240 min → ceil(240/60) = 4h.
      // The countdown lives only in `inlineSubtext`; `message` (tooltip)
      // stays focused on the expired reason so the user doesn't see the
      // same sentence twice.
      expect(state.inlineSubtext).toBe(
        "Your refund will be claimable in ~24 Bitcoin blocks (~4h).",
      );
      expect(state.message).not.toContain("claimable in");
    });

    it("uses singular 'block' when exactly one block remains", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: false,
        refundMaturityState: "maturing",
        refundMaturesInBlocks: 1,
      });
      // 1 block * 10 min = 10 min → ceil(10/60)=1h, floored to min 1h.
      expect(state.inlineSubtext).toBe(
        "Your refund will be claimable in ~1 Bitcoin block (~1h).",
      );
    });

    it("shows the generic pending message when refund maturity is unknown", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        expirationReason: "ack_timeout",
        canRefund: false,
        refundMaturityState: "unknown",
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(state.refundMaturityState).toBe("unknown");
      expect(state.refundMaturesInBlocks).toBeUndefined();
      // Maturing copy lives only in `inlineSubtext`; tooltip stays focused
      // on the expired reason.
      expect(state.inlineSubtext).toBe(
        "Checking when your refund will be claimable...",
      );
      expect(state.message).not.toContain("Checking when your refund");
    });

    it("marks state as 'mature' when canRefund is true and no maturity flag was passed", () => {
      // The default-to-mature fallback preserves the pre-feature behavior for
      // any caller that hasn't been updated to pass the maturity inputs yet.
      const state = getPeginState(ContractStatus.EXPIRED, { canRefund: true });
      expect(state.availableActions).toEqual([PeginAction.REFUND_HTLC]);
      expect(state.refundMaturityState).toBe("mature");
    });
  });

  // ==========================================================================
  // Helper functions
  // ==========================================================================
  describe("canPerformAction", () => {
    it("returns true when action is available", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: true,
      });
      expect(
        canPerformAction(state, PeginAction.SIGN_PAYOUT_TRANSACTIONS),
      ).toBe(true);
    });

    it("returns false when action is not available", () => {
      const state = getPeginState(ContractStatus.ACTIVE);
      expect(
        canPerformAction(state, PeginAction.SIGN_PAYOUT_TRANSACTIONS),
      ).toBe(false);
    });
  });

  describe("isRefundInFlightOrSettled", () => {
    it("is true while a refund is in flight (Refunding)", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: false,
        refundSettlement: "pending",
      });
      expect(isRefundInFlightOrSettled(state)).toBe(true);
    });

    it("is true once a refund has settled (Refunded)", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        canRefund: false,
        refundSettlement: "confirmed",
      });
      expect(isRefundInFlightOrSettled(state)).toBe(true);
    });

    it("is false for a still-refundable expired vault", () => {
      const state = getPeginState(ContractStatus.EXPIRED, { canRefund: true });
      expect(isRefundInFlightOrSettled(state)).toBe(false);
    });

    it("is false for a pending vault", () => {
      const state = getPeginState(ContractStatus.PENDING, {});
      expect(isRefundInFlightOrSettled(state)).toBe(false);
    });
  });

  describe("getPrimaryActionButton", () => {
    it("returns Submit WOTS Key for WOTS key", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        needsWotsKey: true,
      });
      const button = getPrimaryActionButton(state);
      expect(button).toEqual({
        label: "Submit WOTS Key",
        action: PeginAction.SUBMIT_WOTS_KEY,
      });
    });

    it("returns Sign Payouts for payout transactions", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: true,
      });
      const button = getPrimaryActionButton(state);
      expect(button).toEqual({
        label: "Sign Payouts",
        action: PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      });
    });

    it("returns Activate for verified (pre-pegin guaranteed on-chain)", () => {
      const state = getPeginState(ContractStatus.VERIFIED);
      const button = getPrimaryActionButton(state);
      expect(button).toEqual({
        label: "Activate",
        action: PeginAction.ACTIVATE_VAULT,
      });
    });

    it("returns null for available vault (no user action)", () => {
      const state = getPeginState(ContractStatus.ACTIVE);
      expect(getPrimaryActionButton(state)).toBeNull();
    });

    it("returns Refund for expired vault with canRefund", () => {
      const state = getPeginState(ContractStatus.EXPIRED, { canRefund: true });
      const button = getPrimaryActionButton(state);
      expect(button).toEqual({
        label: "Refund",
        action: PeginAction.REFUND_HTLC,
      });
    });

    it("returns null when no action available", () => {
      const state = getPeginState(ContractStatus.REDEEMED);
      expect(getPrimaryActionButton(state)).toBeNull();
    });
  });

  describe("getNextLocalStatus", () => {
    it("returns PAYOUT_SIGNED after signing", () => {
      expect(getNextLocalStatus(PeginAction.SIGN_PAYOUT_TRANSACTIONS)).toBe(
        LocalStorageStatus.PAYOUT_SIGNED,
      );
    });

    it("returns CONFIRMING after broadcast", () => {
      expect(
        getNextLocalStatus(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN),
      ).toBe(LocalStorageStatus.CONFIRMING);
    });

    it("returns null for other actions", () => {
      expect(getNextLocalStatus(PeginAction.NONE)).toBeNull();
    });
  });

  describe("shouldRemoveFromLocalStorage", () => {
    it.each([
      ContractStatus.ACTIVE,
      ContractStatus.REDEEMED,
      ContractStatus.LIQUIDATED,
      ContractStatus.INVALID,
      ContractStatus.DEPOSITOR_WITHDRAWN,
      ContractStatus.EXPIRED,
    ])("removes for terminal status %s", (status) => {
      expect(
        shouldRemoveFromLocalStorage(status, LocalStorageStatus.PENDING),
      ).toBe(true);
    });

    it("removes stale PENDING when contract is VERIFIED", () => {
      expect(
        shouldRemoveFromLocalStorage(
          ContractStatus.VERIFIED,
          LocalStorageStatus.PENDING,
        ),
      ).toBe(true);
    });

    it("keeps PAYOUT_SIGNED when contract is PENDING", () => {
      expect(
        shouldRemoveFromLocalStorage(
          ContractStatus.PENDING,
          LocalStorageStatus.PAYOUT_SIGNED,
        ),
      ).toBe(false);
    });

    it("keeps CONFIRMING when contract is VERIFIED", () => {
      expect(
        shouldRemoveFromLocalStorage(
          ContractStatus.VERIFIED,
          LocalStorageStatus.CONFIRMING,
        ),
      ).toBe(false);
    });

    it("keeps REFUND_BROADCAST while contract is still EXPIRED and within TTL", () => {
      const now = 1_700_000_000_000;
      expect(
        shouldRemoveFromLocalStorage(
          ContractStatus.EXPIRED,
          LocalStorageStatus.REFUND_BROADCAST,
          now - 60_000,
          now,
        ),
      ).toBe(false);
    });

    it("clears stale REFUND_BROADCAST past the TTL so the user can retry", () => {
      const now = 1_700_000_000_000;
      expect(
        shouldRemoveFromLocalStorage(
          ContractStatus.EXPIRED,
          LocalStorageStatus.REFUND_BROADCAST,
          now - 7 * 60 * 60 * 1000,
          now,
        ),
      ).toBe(true);
    });

    it("clears legacy REFUND_BROADCAST without a broadcast timestamp", () => {
      expect(
        shouldRemoveFromLocalStorage(
          ContractStatus.EXPIRED,
          LocalStorageStatus.REFUND_BROADCAST,
        ),
      ).toBe(true);
    });

    it("removes REFUND_BROADCAST once contract reaches DEPOSITOR_WITHDRAWN", () => {
      expect(
        shouldRemoveFromLocalStorage(
          ContractStatus.DEPOSITOR_WITHDRAWN,
          LocalStorageStatus.REFUND_BROADCAST,
        ),
      ).toBe(true);
    });
  });

  // ==========================================================================
  // getPeginDisplayStep — derives the live deposit flow step from real state
  // ==========================================================================
  describe("getPeginDisplayStep", () => {
    it("maps a pending broadcast action to BROADCAST_PRE_PEGIN", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: true,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.BROADCAST_PRE_PEGIN,
      );
    });

    it("maps the awaiting-confirmation PENDING state (no action) to AWAIT_BTC_CONFIRMATION", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: true,
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_BTC_CONFIRMATION,
      );
      // Step and message must agree: at AWAIT_BTC_CONFIRMATION the wait is on
      // Bitcoin depth, so the message is the BTC-confirmation copy — not the
      // "vault provider to detect/ingest" wording, which belongs to step 7.
      expect(state.message).toBe(COPY.pegin.messages.prePeginBroadcast);
    });

    it("maps BTC-confirmed-but-VP-still-ingesting to the confirming-deposit step", () => {
      // The diagnostic case: localStorage says CONFIRMING (broadcast happened)
      // and mempool reports the Pre-PegIn has reached the protocol depth, but
      // the VP is still at PendingIngestion. The step stays on the shared
      // "confirming deposit" step; the VP-side wait is surfaced via the message.
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: true,
        prePeginBroadcastConfirmed: true,
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(state.message).toBe(COPY.pegin.messages.prePeginIngesting);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_BTC_CONFIRMATION,
      );
    });

    it("maps a pending WOTS-key action to SUBMIT_WOTS_KEYS", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        needsWotsKey: true,
      });
      expect(state.availableActions).toContain(PeginAction.SUBMIT_WOTS_KEY);
      expect(getPeginDisplayStep(state)).toBe(DepositFlowStep.SUBMIT_WOTS_KEYS);
    });

    it("maps a pending payout-signing action to SIGN_AUTH_ANCHOR (the next step)", () => {
      // A deposit waiting to sign payouts is resting before it acts: clicking
      // "Sign Payouts" runs the auth-anchor step first, so the deposit is
      // positioned on SIGN_AUTH_ANCHOR, not SIGN_PAYOUTS (which would count the
      // auth-anchor step as already done).
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: false,
        transactionsReady: true,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
      expect(getPeginDisplayStep(state)).toBe(DepositFlowStep.SIGN_AUTH_ANCHOR);
    });

    it("maps provider-processing-with-no-action to AWAIT_PAYOUT_TRANSACTIONS", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.CONFIRMING,
        pendingIngestion: false,
        transactionsReady: false,
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
      );
    });

    it("keys the payout-prep step off the boolean, not the display message", () => {
      const state: PeginState = {
        contractStatus: ContractStatus.PENDING,
        localStatus: LocalStorageStatus.CONFIRMING,
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
        message: "an unrelated display message",
        awaitingPayoutPrep: true,
      };
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
      );
    });

    it("maps payouts-signed-and-awaiting-verification to AWAIT_VP_VERIFICATION", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        localStatus: LocalStorageStatus.PAYOUT_SIGNED,
      });
      expect(state.availableActions).toEqual([PeginAction.NONE]);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_VP_VERIFICATION,
      );
    });

    it("maps a VERIFIED vault ready to activate to RETRIEVE_SECRET", () => {
      const state = getPeginState(ContractStatus.VERIFIED);
      expect(getPeginDisplayStep(state)).toBe(DepositFlowStep.RETRIEVE_SECRET);
    });

    it("maps a VERIFIED vault with activation broadcast to AWAIT_ACTIVATION_CONFIRMATION", () => {
      const state = getPeginState(ContractStatus.VERIFIED, {
        localStatus: LocalStorageStatus.CONFIRMED,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PROCESSING);
      expect(getPeginDisplayStep(state)).toBe(
        DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION,
      );
    });

    it("returns null for a failed pending deposit so it does not look like it is progressing", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        vpTerminalError: "Deposit rejected by the vault provider.",
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.FAILED);
      expect(state.displayVariant).toBe("warning");
      expect(getPeginDisplayStep(state)).toBe(null);
    });

    it("returns null for terminal states with no in-progress step", () => {
      expect(getPeginDisplayStep(getPeginState(ContractStatus.EXPIRED))).toBe(
        null,
      );
      expect(getPeginDisplayStep(getPeginState(ContractStatus.ACTIVE))).toBe(
        null,
      );
    });
  });

  describe("isVaultActivated", () => {
    it("is true for an ACTIVE vault", () => {
      expect(isVaultActivated(getPeginState(ContractStatus.ACTIVE))).toBe(true);
    });

    it("is true for the optimistic VERIFIED + CONFIRMED state", () => {
      expect(
        isVaultActivated(
          getPeginState(ContractStatus.VERIFIED, {
            localStatus: LocalStorageStatus.CONFIRMED,
          }),
        ),
      ).toBe(true);
    });

    it("is false while VERIFIED but not yet confirmed (ready to activate)", () => {
      expect(isVaultActivated(getPeginState(ContractStatus.VERIFIED))).toBe(
        false,
      );
    });

    it("is false for a PENDING vault and for undefined", () => {
      expect(isVaultActivated(getPeginState(ContractStatus.PENDING))).toBe(
        false,
      );
      expect(isVaultActivated(undefined)).toBe(false);
    });

    it("is false for terminal non-activation states (e.g. REDEEMED)", () => {
      // REDEEMED is past activation but NOT "activated" — it must never read
      // as an activation success.
      expect(isVaultActivated(getPeginState(ContractStatus.REDEEMED))).toBe(
        false,
      );
    });
  });
});
