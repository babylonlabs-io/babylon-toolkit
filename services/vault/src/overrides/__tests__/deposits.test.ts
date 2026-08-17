import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { ContractStatus, getPeginState } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";

import type { DepositOverride } from "../deposits";
import { getDemoStepperBatch } from "../deposits";

const PEGIN_STATE = getPeginState(ContractStatus.PENDING, {});

function makeActivity(id: Hex, unsignedPrePeginTx: string): VaultActivity {
  return {
    id,
    collateral: { amount: "0.1", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    displayLabel: PEGIN_STATE.displayLabel,
    unsignedPrePeginTx,
    depositorWotsPkHash: "",
  };
}

function makeResult(
  id: string,
  isOwnedByCurrentWallet: boolean,
): DepositPollingResult {
  return {
    depositId: id,
    loading: false,
    error: null,
    peginState: PEGIN_STATE,
    isOwnedByCurrentWallet,
    depositorBtcPubkey: "a".repeat(64),
    prePeginConfirmations: null,
    requiredPrePeginDepth: 6,
  };
}

const OWNED_ID = `0x${"1".repeat(40)}` as Hex;
const SIBLING_ID = `0x${"2".repeat(40)}` as Hex;
const UNOWNED_ID = `0x${"3".repeat(40)}` as Hex;
const SHARED_PREPEGIN = `0x${"bc".repeat(32)}`;

function makeOverride(): DepositOverride {
  const owned = makeActivity(OWNED_ID, SHARED_PREPEGIN);
  const sibling = makeActivity(SIBLING_ID, SHARED_PREPEGIN);
  const unowned = makeActivity(UNOWNED_ID, "");
  return {
    pendingActivities: [owned, sibling, unowned],
    expiredActivities: [],
    resultsById: new Map([
      [OWNED_ID, makeResult(OWNED_ID, true)],
      [SIBLING_ID, makeResult(SIBLING_ID, true)],
      [UNOWNED_ID, makeResult(UNOWNED_ID, false)],
    ]),
    provider: {
      id: "0xprovider",
      btcPubKey: `0x${"f".repeat(64)}`,
      name: "demo-vault-provider",
      url: "https://demo-vault-provider.invalid",
      metadataStatus: "ok",
    },
    hideReal: false,
  };
}

describe("getDemoStepperBatch", () => {
  it("returns null when there is no override", () => {
    expect(getDemoStepperBatch(null, OWNED_ID)).toBeNull();
  });

  it("returns null when the deposit id is not a pending demo activity", () => {
    expect(getDemoStepperBatch(makeOverride(), "0xmissing")).toBeNull();
  });

  it("returns null for an unowned (different-wallet) demo deposit", () => {
    expect(getDemoStepperBatch(makeOverride(), UNOWNED_ID)).toBeNull();
  });

  it("returns every owned sibling sharing the same Pre-PegIn batch", () => {
    const batch = getDemoStepperBatch(makeOverride(), OWNED_ID);
    expect(batch).not.toBeNull();
    expect(new Set(batch)).toEqual(new Set([OWNED_ID, SIBLING_ID]));
  });
});
