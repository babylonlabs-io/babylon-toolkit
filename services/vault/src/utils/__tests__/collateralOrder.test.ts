import { describe, expect, it } from "vitest";

import type { CollateralVaultEntry } from "@/types/collateral";

import {
  isReorderOverrideReconciled,
  sortByReorderedOverride,
} from "../collateralOrder";

const VAULT_A = ("0x" + "a".repeat(64)) as `0x${string}`;
const VAULT_B = ("0x" + "b".repeat(64)) as `0x${string}`;
const VAULT_C = ("0x" + "c".repeat(64)) as `0x${string}`;

function entry(
  vaultId: string,
  liquidationIndex: number,
): CollateralVaultEntry {
  return {
    id: `0xdep-${vaultId}`,
    vaultId,
    amountBtc: 1,
    addedAt: 0,
    inUse: true,
    providerAddress: "",
    providerName: "",
    liquidationIndex,
  };
}

const ids = (entries: CollateralVaultEntry[]) => entries.map((e) => e.vaultId);

describe("sortByReorderedOverride", () => {
  it("orders by the override sequence when it is a valid permutation", () => {
    const out = sortByReorderedOverride(
      [entry(VAULT_A, 0), entry(VAULT_B, 1), entry(VAULT_C, 2)],
      [VAULT_C, VAULT_A, VAULT_B],
    );
    expect(ids(out)).toEqual([VAULT_C, VAULT_A, VAULT_B]);
  });

  it("rewrites each entry's liquidationIndex to its override rank", () => {
    // So the per-row "Liquidation Order" ordinal matches the displayed position
    // instead of the stale indexer index.
    const out = sortByReorderedOverride(
      [entry(VAULT_A, 0), entry(VAULT_B, 1), entry(VAULT_C, 2)],
      [VAULT_C, VAULT_A, VAULT_B],
    );
    const indexByVault = new Map(
      out.map((e) => [e.vaultId, e.liquidationIndex]),
    );
    expect(indexByVault.get(VAULT_C)).toBe(0);
    expect(indexByVault.get(VAULT_A)).toBe(1);
    expect(indexByVault.get(VAULT_B)).toBe(2);
  });

  it("matches override IDs case-insensitively", () => {
    const upperB = VAULT_B.toUpperCase().replace("0X", "0x") as `0x${string}`;
    const out = sortByReorderedOverride(
      [entry(VAULT_A.toLowerCase(), 0), entry(VAULT_B.toLowerCase(), 1)],
      [upperB, VAULT_A],
    );
    expect(ids(out)).toEqual([VAULT_B.toLowerCase(), VAULT_A.toLowerCase()]);
  });

  it("falls back to liquidationIndex order when override is null", () => {
    const out = sortByReorderedOverride(
      [entry(VAULT_B, 1), entry(VAULT_A, 0)],
      null,
    );
    expect(ids(out)).toEqual([VAULT_A, VAULT_B]);
  });

  it("falls back to liquidationIndex order when override is not the same vault set", () => {
    const out = sortByReorderedOverride(
      [entry(VAULT_A, 0), entry(VAULT_B, 1)],
      [VAULT_B, VAULT_A, VAULT_C],
    );
    expect(ids(out)).toEqual([VAULT_A, VAULT_B]);
  });
});

describe("isReorderOverrideReconciled", () => {
  const entries = [entry(VAULT_A, 0), entry(VAULT_B, 1), entry(VAULT_C, 2)];

  it("is reconciled when there is no override", () => {
    expect(isReorderOverrideReconciled(entries, null)).toBe(true);
  });

  it("is reconciled when the indexer order already equals the override", () => {
    expect(
      isReorderOverrideReconciled(entries, [VAULT_A, VAULT_B, VAULT_C]),
    ).toBe(true);
  });

  it("is NOT reconciled while the indexer order still differs", () => {
    expect(
      isReorderOverrideReconciled(entries, [VAULT_C, VAULT_A, VAULT_B]),
    ).toBe(false);
  });

  it("is reconciled (give up) when the override no longer matches the vault set", () => {
    expect(
      isReorderOverrideReconciled(
        [entry(VAULT_A, 0), entry(VAULT_B, 1)],
        [VAULT_B, VAULT_A, VAULT_C],
      ),
    ).toBe(true);
  });
});
