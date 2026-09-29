import { describe, expect, it } from "vitest";

import { ContractStatus } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import {
  getBatchSiblings,
  groupActivitiesByBatch,
  isActivationBlockedByEarlierSibling,
} from "../batchedPegin";

/** Minimal VaultActivity carrying only the fields batch-grouping reads. */
function activity(
  id: string,
  unsignedPrePeginTx: string,
  constructionIndex?: number,
): VaultActivity {
  return {
    id: id as VaultActivity["id"],
    collateral: { amount: "0.01", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    displayLabel: "Pending" as VaultActivity["displayLabel"],
    unsignedPrePeginTx,
    constructionIndex,
    depositorWotsPkHash: "0xwots",
  };
}

describe("groupActivitiesByBatch", () => {
  it("groups vaults sharing one Pre-PegIn transaction into a single batch", () => {
    const a = activity("0xa", "0xdeadbeef");
    const b = activity("0xb", "0xdeadbeef");
    const groups = groupActivitiesByBatch([a, b]);
    expect(groups).toEqual([[a, b]]);
  });

  it("keeps vaults with distinct Pre-PegIn transactions in separate groups", () => {
    const a = activity("0xa", "0xaaaa");
    const b = activity("0xb", "0xbbbb");
    const groups = groupActivitiesByBatch([a, b]);
    expect(groups).toEqual([[a], [b]]);
  });

  it("matches the Pre-PegIn hex regardless of 0x prefix or case", () => {
    const a = activity("0xa", "0xDEADBEEF");
    const b = activity("0xb", "deadbeef");
    const groups = groupActivitiesByBatch([a, b]);
    expect(groups).toEqual([[a, b]]);
  });

  it("does not group activities whose Pre-PegIn hex is the empty cross-device marker", () => {
    // An empty unsignedPrePeginTx is the "no local tx" marker — two such
    // activities are unrelated deposits, not a batch.
    const a = activity("0xa", "");
    const b = activity("0xb", "");
    const groups = groupActivitiesByBatch([a, b]);
    expect(groups).toEqual([[a], [b]]);
  });

  it("preserves first-occurrence order of batches", () => {
    const a1 = activity("0xa1", "0xaaaa");
    const b1 = activity("0xb1", "0xbbbb");
    const a2 = activity("0xa2", "0xaaaa");
    const groups = groupActivitiesByBatch([a1, b1, a2]);
    expect(groups).toEqual([[a1, a2], [b1]]);
  });

  it("orders siblings by construction index instead of indexer row order", () => {
    const protectedVault = activity("0xprotected", "0xaaaa", 1);
    const sacrificialVault = activity("0xsacrificial", "0xaaaa", 0);

    expect(groupActivitiesByBatch([protectedVault, sacrificialVault])).toEqual([
      [sacrificialVault, protectedVault],
    ]);
  });
});

describe("getBatchSiblings", () => {
  it("returns every vault sharing the Pre-PegIn transaction, including itself", () => {
    const a = activity("0xa", "0xdeadbeef");
    const b = activity("0xb", "0xdeadbeef");
    const c = activity("0xc", "0xother");
    expect(getBatchSiblings([a, b, c], a)).toEqual([a, b]);
  });

  it("returns only the activity itself when its Pre-PegIn transaction is unique", () => {
    const a = activity("0xa", "0xaaaa");
    const b = activity("0xb", "0xbbbb");
    expect(getBatchSiblings([a, b], a)).toEqual([a]);
  });

  it("returns only the activity itself when its Pre-PegIn hex is empty", () => {
    const a = activity("0xa", "");
    const b = activity("0xb", "");
    expect(getBatchSiblings([a, b], a)).toEqual([a]);
  });

  it("returns split siblings in construction order", () => {
    const protectedVault = activity("0xprotected", "0xaaaa", 1);
    const sacrificialVault = activity("0xsacrificial", "0xaaaa", 0);

    expect(
      getBatchSiblings([protectedVault, sacrificialVault], protectedVault),
    ).toEqual([sacrificialVault, protectedVault]);
  });
});

describe("isActivationBlockedByEarlierSibling", () => {
  function withStatus(
    base: VaultActivity,
    contractStatus: ContractStatus,
  ): VaultActivity {
    return { ...base, contractStatus };
  }

  it("blocks index 1 while index 0 is still verified", () => {
    const sacrificial = withStatus(
      activity("0xsacrificial", "0xaaaa", 0),
      ContractStatus.VERIFIED,
    );
    const protectedVault = withStatus(
      activity("0xprotected", "0xaaaa", 1),
      ContractStatus.VERIFIED,
    );

    expect(
      isActivationBlockedByEarlierSibling(
        [sacrificial, protectedVault],
        protectedVault,
      ),
    ).toBe(true);
  });

  it("releases index 1 once index 0 is active", () => {
    const sacrificial = withStatus(
      activity("0xsacrificial", "0xaaaa", 0),
      ContractStatus.ACTIVE,
    );
    const protectedVault = withStatus(
      activity("0xprotected", "0xaaaa", 1),
      ContractStatus.VERIFIED,
    );

    expect(
      isActivationBlockedByEarlierSibling(
        [sacrificial, protectedVault],
        protectedVault,
      ),
    ).toBe(false);
  });

  it("releases index 1 when index 0 expired and can never be queued", () => {
    const sacrificial = withStatus(
      activity("0xsacrificial", "0xaaaa", 0),
      ContractStatus.EXPIRED,
    );
    const protectedVault = withStatus(
      activity("0xprotected", "0xaaaa", 1),
      ContractStatus.VERIFIED,
    );

    expect(
      isActivationBlockedByEarlierSibling(
        [sacrificial, protectedVault],
        protectedVault,
      ),
    ).toBe(false);
  });

  it("never blocks index 0", () => {
    const sacrificial = withStatus(
      activity("0xsacrificial", "0xaaaa", 0),
      ContractStatus.VERIFIED,
    );
    const protectedVault = withStatus(
      activity("0xprotected", "0xaaaa", 1),
      ContractStatus.VERIFIED,
    );

    expect(
      isActivationBlockedByEarlierSibling(
        [sacrificial, protectedVault],
        sacrificial,
      ),
    ).toBe(false);
  });
});
