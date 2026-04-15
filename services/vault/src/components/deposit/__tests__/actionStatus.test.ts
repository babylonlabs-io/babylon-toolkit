import { describe, expect, it } from "vitest";

import { ContractStatus, getPeginState } from "@/models/peginStateMachine";

import type { DepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import { getSectionActionRequiredLabel } from "../actionStatus";

function pollingResultWithAction(
  depositId: string,
  peginState: DepositPollingResult["peginState"],
): DepositPollingResult {
  return {
    depositId,
    transactions: null,
    depositorGraph: null,
    isReady: false,
    loading: false,
    error: null,
    peginState,
    isOwnedByCurrentWallet: true,
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

  it("returns Signing Required when one deposit needs signing", () => {
    const signState = getPeginState(ContractStatus.PENDING, {
      pendingIngestion: false,
      transactionsReady: true,
    });
    const results: (DepositPollingResult | undefined)[] = [
      pollingResultWithAction("id1", signState),
    ];
    expect(getSectionActionRequiredLabel(results)).toBe("Signing Required");
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
    expect(getSectionActionRequiredLabel(results)).toBe("Signing Required");
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
    expect(getSectionActionRequiredLabel(results)).toBe("Signing Required");
  });
});
