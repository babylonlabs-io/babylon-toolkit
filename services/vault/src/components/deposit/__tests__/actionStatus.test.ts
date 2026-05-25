import { describe, expect, it } from "vitest";

import { ContractStatus, getPeginState } from "@/models/peginStateMachine";

import type { DepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import {
  getActionStatus,
  getSectionActionRequiredLabel,
  PeginAction,
} from "../actionStatus";

function pollingResultWithAction(
  depositId: string,
  peginState: DepositPollingResult["peginState"],
  overrides: Partial<
    Pick<
      DepositPollingResult,
      "isOwnedByCurrentWallet" | "depositorBtcPubkey" | "error"
    >
  > = {},
): DepositPollingResult {
  return {
    depositId,
    loading: false,
    error: overrides.error ?? null,
    peginState,
    isOwnedByCurrentWallet: overrides.isOwnedByCurrentWallet ?? true,
    depositorBtcPubkey: overrides.depositorBtcPubkey,
  };
}

describe("getSectionActionRequiredLabel", () => {
  it("returns null when no results", () => {
    expect(getSectionActionRequiredLabel([])).toBeNull();
  });

  it("returns null when all results are undefined", () => {
    expect(getSectionActionRequiredLabel([undefined, undefined])).toBeNull();
  });

  it("returns null when no deposit has an available action", () => {
    const noActionState = getPeginState(ContractStatus.ACTIVE);
    const results: (DepositPollingResult | undefined)[] = [
      pollingResultWithAction("id1", noActionState),
    ];
    expect(getSectionActionRequiredLabel(results)).toBeNull();
  });

  it("returns Signing required when one deposit needs signing", () => {
    const signState = getPeginState(ContractStatus.PENDING, {
      pendingIngestion: false,
      transactionsReady: true,
    });
    const results: (DepositPollingResult | undefined)[] = [
      pollingResultWithAction("id1", signState),
    ];
    expect(getSectionActionRequiredLabel(results)).toBe("Signing required");
  });

  it("returns Activation required when one deposit is verified", () => {
    const verifiedState = getPeginState(ContractStatus.VERIFIED);
    const results: (DepositPollingResult | undefined)[] = [
      pollingResultWithAction("id1", verifiedState),
    ];
    expect(getSectionActionRequiredLabel(results)).toBe("Activation required");
  });

  it("returns Key required when one deposit needs WOTS key", () => {
    const keyState = getPeginState(ContractStatus.PENDING, {
      needsWotsKey: true,
    });
    const results: (DepositPollingResult | undefined)[] = [
      pollingResultWithAction("id1", keyState),
    ];
    expect(getSectionActionRequiredLabel(results)).toBe("Key required");
  });

  it("returns highest priority action when multiple deposits need different actions", () => {
    const signState = getPeginState(ContractStatus.PENDING, {
      pendingIngestion: false,
      transactionsReady: true,
    });
    const keyState = getPeginState(ContractStatus.PENDING, {
      needsWotsKey: true,
    });
    const results: (DepositPollingResult | undefined)[] = [
      pollingResultWithAction("id1", keyState),
      pollingResultWithAction("id2", signState),
    ];
    expect(getSectionActionRequiredLabel(results)).toBe("Signing required");
  });

  it("skips undefined results and uses defined ones", () => {
    const signState = getPeginState(ContractStatus.PENDING, {
      pendingIngestion: false,
      transactionsReady: true,
    });
    const results: (DepositPollingResult | undefined)[] = [
      undefined,
      pollingResultWithAction("id2", signState),
    ];
    expect(getSectionActionRequiredLabel(results)).toBe("Signing required");
  });
});

describe("getActionStatus — wallet ownership mismatch", () => {
  // A 32-byte x-only BTC pubkey; truncated for display as `bcc5...f21c`
  // (BTC pubkeys are not 0x-prefixed in the rendered form).
  const FOREIGN_PUBKEY =
    "0xbcc5607100f99bd32e67b829104e534cfd5c5b11d88dc655cd17ddafd886f21c";

  it("returns disabled with the would-be action and an ownership tooltip", () => {
    // VERIFIED vault would normally surface an "Activate" button; ownership
    // mismatch keeps the same action visible (so the user sees what would be
    // available) but routes the UI through the dimmed/tooltip treatment.
    const verifiedState = getPeginState(ContractStatus.VERIFIED);
    const result = pollingResultWithAction("id1", verifiedState, {
      isOwnedByCurrentWallet: false,
      depositorBtcPubkey: FOREIGN_PUBKEY,
    });

    const status = getActionStatus(result);

    expect(status.type).toBe("disabled");
    if (status.type !== "disabled") return;
    expect(status.action.action).toBe(PeginAction.ACTIVATE_VAULT);
    expect(status.tooltip).toMatch(
      /this btc vault was created with a different btc public key/i,
    );
    expect(status.tooltip).toContain("bcc5...f21c");
    expect(status.tooltip).not.toContain("0x");
  });

  it("falls back to available when the vault has no known depositor pubkey", () => {
    // Defensive: `isVaultOwnedByWallet` returns true when either pubkey is
    // missing, so `isOwnedByCurrentWallet === false` with an undefined vault
    // pubkey should be unreachable in practice. The guard in `getActionStatus`
    // exists so a future change to that predicate can't sneak through an
    // un-nameable warning.
    const verifiedState = getPeginState(ContractStatus.VERIFIED);
    const result = pollingResultWithAction("id1", verifiedState, {
      isOwnedByCurrentWallet: false,
      depositorBtcPubkey: undefined,
    });

    const status = getActionStatus(result);

    // Falls back to the normal available-action path — the (impossible)
    // missing-pubkey case must never silently emit a useless warning.
    expect(status.type).toBe("available");
  });
});
