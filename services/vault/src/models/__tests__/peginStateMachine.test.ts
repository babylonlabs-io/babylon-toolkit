import { describe, expect, it, vi } from "vitest";

import {
  canPerformAction,
  ContractStatus,
  getNextLocalStatus,
  getPeginState,
  getPrimaryActionButton,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
  shouldRemoveFromLocalStorage,
} from "../peginStateMachine";

describe("peginStateMachine", () => {
  // ==========================================================================
  // getPeginState — PENDING contract status
  // ==========================================================================
  describe("getPeginState - PENDING", () => {
    it("shows pending ingestion when VP has not ingested yet", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.message).toContain("detect your deposit");
    });

    it("shows pending ingestion when no polling response yet (undefined)", () => {
      const state = getPeginState(ContractStatus.PENDING, {});
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.message).toContain("detect your deposit");
    });

    it("shows awaiting key when VP needs lamport key", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        needsLamportKey: true,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.AWAITING_KEY);
      expect(state.availableActions).toContain(PeginAction.SUBMIT_LAMPORT_KEY);
    });

    it("shows preparing transactions when VP ingested but not ready", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: false,
      });
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.PENDING);
      expect(state.message).toContain("prepare Claim and Payout");
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
  });

  // ==========================================================================
  // getPeginState — VERIFIED contract status
  // ==========================================================================
  describe("getPeginState - VERIFIED", () => {
    it("shows verified (ready to broadcast)", () => {
      const state = getPeginState(ContractStatus.VERIFIED);
      expect(state.displayLabel).toBe(PEGIN_DISPLAY_LABELS.VERIFIED);
      expect(state.availableActions).toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
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
      expect(state.displayVariant).toBe("warning");
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
      expect(state.message).toBe("This vault has expired.");
    });

    it("shows expired with ack_timeout reason", () => {
      const state = getPeginState(ContractStatus.EXPIRED, {
        expirationReason: "ack_timeout",
      });
      expect(state.message).toContain("This vault has expired.");
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
        "This vault has expired. The vault provider did not acknowledge in time. Expired 2h ago.",
      );
      vi.useRealTimers();
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

  describe("getPrimaryActionButton", () => {
    it("returns Enter Mnemonic for lamport key", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        needsLamportKey: true,
      });
      const button = getPrimaryActionButton(state);
      expect(button).toEqual({
        label: "Enter Mnemonic",
        action: PeginAction.SUBMIT_LAMPORT_KEY,
      });
    });

    it("returns Sign for payout transactions", () => {
      const state = getPeginState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: true,
      });
      const button = getPrimaryActionButton(state);
      expect(button).toEqual({
        label: "Sign",
        action: PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      });
    });

    it("returns Broadcast for verified", () => {
      const state = getPeginState(ContractStatus.VERIFIED);
      const button = getPrimaryActionButton(state);
      expect(button).toEqual({
        label: "Broadcast",
        action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      });
    });

    it("returns null for available vault (no user action)", () => {
      const state = getPeginState(ContractStatus.ACTIVE);
      expect(getPrimaryActionButton(state)).toBeNull();
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
  });
});
