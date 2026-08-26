import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
} from "@/models/peginStateMachine";

import {
  type DepositWarning,
  isDepositWarningResolved,
} from "../depositWarnings";

const VAULT_ID = "0xvault" as Hex;

function wotsWarning(overrides: Partial<DepositWarning> = {}): DepositWarning {
  return {
    vaultId: VAULT_ID,
    stage: "wots",
    terminal: false,
    message: "Vault 1: WOTS skipped",
    ...overrides,
  };
}

function payoutWarning(
  overrides: Partial<DepositWarning> = {},
): DepositWarning {
  return {
    vaultId: VAULT_ID,
    stage: "payout",
    terminal: false,
    message: "Vault 1: payout signing failed",
    ...overrides,
  };
}

describe("isDepositWarningResolved", () => {
  it("keeps a WOTS warning while the VP poll is still loading (no signals)", () => {
    // The crux of the fix: an empty action set during the loading / pre-VP
    // window must NOT read as "advanced past WOTS".
    const state = getPeginState(ContractStatus.PENDING, {});
    expect(isDepositWarningResolved(wotsWarning(), state)).toBe(false);
  });

  it("keeps a WOTS warning while the vault still owes its WOTS key", () => {
    const state = getPeginState(ContractStatus.PENDING, { needsWotsKey: true });
    expect(isDepositWarningResolved(wotsWarning(), state)).toBe(false);
  });

  it("resolves a WOTS warning once payouts are ready (past WOTS)", () => {
    const state = getPeginState(ContractStatus.PENDING, {
      transactionsReady: true,
    });
    expect(isDepositWarningResolved(wotsWarning(), state)).toBe(true);
  });

  it("keeps a payout warning while payouts are still awaiting signing", () => {
    const state = getPeginState(ContractStatus.PENDING, {
      transactionsReady: true,
    });
    expect(isDepositWarningResolved(payoutWarning(), state)).toBe(false);
  });

  it("resolves wots but keeps payout while the VP is preparing payouts", () => {
    // awaitingPayoutPrep: VP has ingested and accepted the WOTS key but the
    // payout package is not ready yet — the window straddling both thresholds.
    const state = getPeginState(ContractStatus.PENDING, {
      pendingIngestion: false,
    });
    expect(isDepositWarningResolved(wotsWarning(), state)).toBe(true);
    expect(isDepositWarningResolved(payoutWarning(), state)).toBe(false);
  });

  it("resolves a payout warning once payouts have been signed", () => {
    const state = getPeginState(ContractStatus.PENDING, {
      localStatus: LocalStorageStatus.PAYOUT_SIGNED,
    });
    expect(isDepositWarningResolved(payoutWarning(), state)).toBe(true);
  });

  it("resolves both stages once the vault reaches VERIFIED", () => {
    const state = getPeginState(ContractStatus.VERIFIED, {});
    expect(isDepositWarningResolved(wotsWarning(), state)).toBe(true);
    expect(isDepositWarningResolved(payoutWarning(), state)).toBe(true);
  });

  it("resolves a stale warning once the vault is terminal (expired)", () => {
    const state = getPeginState(ContractStatus.EXPIRED, {});
    expect(isDepositWarningResolved(wotsWarning(), state)).toBe(true);
    expect(isDepositWarningResolved(payoutWarning(), state)).toBe(true);
  });

  it("never resolves a terminal warning, even when the vault advanced", () => {
    const state = getPeginState(ContractStatus.PENDING, {
      transactionsReady: true,
    });
    expect(
      isDepositWarningResolved(wotsWarning({ terminal: true }), state),
    ).toBe(false);
  });

  it("never resolves a global persistence warning", () => {
    const warning: DepositWarning = {
      stage: "persistence",
      terminal: true,
      message: "Could not save a local copy",
    };
    const state = getPeginState(ContractStatus.VERIFIED, {});
    expect(isDepositWarningResolved(warning, state)).toBe(false);
  });

  it("keeps the warning when live state is unknown (no optimistic clearing)", () => {
    expect(isDepositWarningResolved(wotsWarning(), undefined)).toBe(false);
  });

  it("keeps a per-vault warning that carries no vaultId", () => {
    const state = getPeginState(ContractStatus.VERIFIED, {});
    expect(
      isDepositWarningResolved(wotsWarning({ vaultId: undefined }), state),
    ).toBe(false);
  });
});
