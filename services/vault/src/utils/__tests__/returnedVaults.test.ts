import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { DepositOverride } from "@/overrides/deposits";
import type { VaultActivity } from "@/types/activity";
import { selectReturnedRedeemedActivities } from "@/utils/returnedVaults";

function activity(id: string, contractStatus: ContractStatus): VaultActivity {
  return {
    id: id as Hex,
    collateral: { amount: "0.1", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    contractStatus,
    displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
    depositorWotsPkHash: "0xwotshash",
    unsignedPrePeginTx: "0xdeadbeef",
  };
}

const RETURNED = activity("0xAbC1", ContractStatus.REDEEMED);
const WITHDRAWING = activity("0xAbC2", ContractStatus.REDEEMED);
const ACTIVE = activity("0xAbC3", ContractStatus.ACTIVE);
const WITHDRAWN = activity("0xAbC4", ContractStatus.DEPOSITOR_WITHDRAWN);
const ALL = [RETURNED, WITHDRAWING, ACTIVE, WITHDRAWN];

/** The withdrawing vault keeps its collateral row; the returned one has none. */
const COLLATERAL_IDS = new Set([WITHDRAWING.id.toLowerCase()]);

describe("selectReturnedRedeemedActivities", () => {
  it("selects a redeemed vault that has no collateral row", () => {
    expect(selectReturnedRedeemedActivities(ALL, COLLATERAL_IDS, null)).toEqual(
      [RETURNED],
    );
  });

  it("leaves a redeemed vault to Active Vaults when its collateral row is shown, whatever the id's case", () => {
    // The indexer's vault id and the collateral row's can differ in case; the
    // set is lowercased by the page and the activity id is lowercased here.
    const upperCased = {
      ...WITHDRAWING,
      id: WITHDRAWING.id.toUpperCase().replace("0X", "0x") as Hex,
    };
    expect(
      selectReturnedRedeemedActivities([upperCased], COLLATERAL_IDS, null),
    ).toEqual([]);
  });

  it("selects nothing before the first position read lands", () => {
    expect(selectReturnedRedeemedActivities(ALL, null, null)).toEqual([]);
  });

  it("selects every redeemed vault when the position has no rows at all", () => {
    expect(selectReturnedRedeemedActivities(ALL, new Set(), null)).toEqual([
      RETURNED,
      WITHDRAWING,
    ]);
  });

  it("honours the demo override's hideReal and nothing else of it", () => {
    const demo = { hideReal: true } as DepositOverride;
    expect(selectReturnedRedeemedActivities(ALL, COLLATERAL_IDS, demo)).toEqual(
      [],
    );
    expect(
      selectReturnedRedeemedActivities(ALL, COLLATERAL_IDS, {
        ...demo,
        hideReal: false,
      }),
    ).toEqual([RETURNED]);
  });
});
