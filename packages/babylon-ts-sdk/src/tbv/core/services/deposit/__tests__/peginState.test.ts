import { describe, expect, it } from "vitest";

import {
  canPerformAction,
  ContractStatus,
  getPeginProtocolState,
  PeginAction,
} from "../peginState";

describe("peginProtocolState", () => {
  // ==========================================================================
  // getPeginProtocolState — PENDING contract status
  // ==========================================================================
  describe("getPeginProtocolState - PENDING", () => {
    it("offers broadcast when VP has not ingested yet", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {
        pendingIngestion: true,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
    });

    it("returns empty actions when no polling response yet (undefined)", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {});
      expect(state.availableActions).toEqual([]);
    });

    it("offers SUBMIT_WOTS_KEY when VP needs WOTS key", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {
        needsWotsKey: true,
      });
      expect(state.availableActions).toContain(PeginAction.SUBMIT_WOTS_KEY);
    });

    it("returns empty actions when VP ingested but not ready", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: false,
      });
      expect(state.availableActions).toEqual([]);
    });

    it("offers SIGN_PAYOUT_TRANSACTIONS when transactions are ready", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: true,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
    });

    it("offers SIGN_PAYOUT_TRANSACTIONS when pendingIngestion is true but transactions are ready", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {
        pendingIngestion: true,
        transactionsReady: true,
      });
      expect(state.availableActions).toContain(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
    });
  });

  // ==========================================================================
  // getPeginProtocolState — VERIFIED contract status
  // ==========================================================================
  describe("getPeginProtocolState - VERIFIED", () => {
    it("offers ACTIVATE_VAULT", () => {
      const state = getPeginProtocolState(ContractStatus.VERIFIED);
      expect(state.availableActions).toContain(PeginAction.ACTIVATE_VAULT);
    });
  });

  // ==========================================================================
  // getPeginProtocolState — ACTIVE contract status
  // ==========================================================================
  describe("getPeginProtocolState - ACTIVE", () => {
    it("returns empty actions", () => {
      const state = getPeginProtocolState(ContractStatus.ACTIVE);
      expect(state.availableActions).toEqual([]);
    });
  });

  // ==========================================================================
  // getPeginProtocolState — Terminal statuses
  // ==========================================================================
  describe("getPeginProtocolState - terminal statuses", () => {
    it("returns empty actions for REDEEMED", () => {
      const state = getPeginProtocolState(ContractStatus.REDEEMED);
      expect(state.availableActions).toEqual([]);
    });

    it("returns empty actions for LIQUIDATED", () => {
      const state = getPeginProtocolState(ContractStatus.LIQUIDATED);
      expect(state.availableActions).toEqual([]);
    });

    it("returns empty actions for INVALID", () => {
      const state = getPeginProtocolState(ContractStatus.INVALID);
      expect(state.availableActions).toEqual([]);
    });

    it("returns empty actions for DEPOSITOR_WITHDRAWN", () => {
      const state = getPeginProtocolState(ContractStatus.DEPOSITOR_WITHDRAWN);
      expect(state.availableActions).toEqual([]);
    });
  });

  // ==========================================================================
  // getPeginProtocolState — EXPIRED contract status
  // ==========================================================================
  describe("getPeginProtocolState - EXPIRED", () => {
    it("offers REFUND_HTLC action when canRefund is true", () => {
      const state = getPeginProtocolState(ContractStatus.EXPIRED, {
        canRefund: true,
      });
      expect(state.availableActions).toEqual([PeginAction.REFUND_HTLC]);
    });

    it("returns empty actions when canRefund is false", () => {
      const state = getPeginProtocolState(ContractStatus.EXPIRED, {
        canRefund: false,
      });
      expect(state.availableActions).toEqual([]);
    });

    it("returns empty actions when canRefund is not provided", () => {
      const state = getPeginProtocolState(ContractStatus.EXPIRED);
      expect(state.availableActions).toEqual([]);
    });
  });

  // ==========================================================================
  // getPeginProtocolState — hasProviderTerminalFailure priority
  // ==========================================================================
  describe("getPeginProtocolState - hasProviderTerminalFailure priority", () => {
    it("returns empty actions when VP reports terminal failure", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {
        hasProviderTerminalFailure: true,
        needsWotsKey: true,
      });
      expect(state.availableActions).toEqual([]);
    });
  });

  // ==========================================================================
  // Helper functions
  // ==========================================================================
  describe("canPerformAction", () => {
    it("returns true when action is available", () => {
      const state = getPeginProtocolState(ContractStatus.PENDING, {
        pendingIngestion: false,
        transactionsReady: true,
      });
      expect(
        canPerformAction(state, PeginAction.SIGN_PAYOUT_TRANSACTIONS),
      ).toBe(true);
    });

    it("returns false when action is not available", () => {
      const state = getPeginProtocolState(ContractStatus.ACTIVE);
      expect(
        canPerformAction(state, PeginAction.SIGN_PAYOUT_TRANSACTIONS),
      ).toBe(false);
    });
  });
});
