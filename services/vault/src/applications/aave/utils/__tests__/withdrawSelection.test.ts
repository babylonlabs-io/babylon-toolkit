import { describe, expect, it } from "vitest";

import { getEffectiveVaultSelection } from "../withdrawSelection";

const vaults = [
  { vaultId: "a", inUse: true, amountBtc: 0.5 },
  { vaultId: "b", inUse: true, amountBtc: 0.3 },
  { vaultId: "c", inUse: false, amountBtc: 0.2 },
];

describe("getEffectiveVaultSelection", () => {
  it("drops IDs that no longer exist on the position", () => {
    const { selectedVaultIds, selectedVaults } = getEffectiveVaultSelection(
      vaults,
      ["a", "ghost"],
    );
    expect(selectedVaultIds).toEqual(["a"]);
    expect(selectedVaults).toEqual([vaults[0]]);
  });

  it("drops IDs pointing at vaults that are no longer in use", () => {
    const { selectedVaultIds, selectedVaults } = getEffectiveVaultSelection(
      vaults,
      ["b", "c"],
    );
    expect(selectedVaultIds).toEqual(["b"]);
    expect(selectedVaults).toEqual([vaults[1]]);
  });

  it("returns empty when nothing is selected", () => {
    const { selectedVaultIds, selectedVaults } = getEffectiveVaultSelection(
      vaults,
      [],
    );
    expect(selectedVaultIds).toEqual([]);
    expect(selectedVaults).toEqual([]);
  });

  it("returns empty when no vault matches", () => {
    const { selectedVaultIds, selectedVaults } = getEffectiveVaultSelection(
      vaults,
      ["ghost"],
    );
    expect(selectedVaultIds).toEqual([]);
    expect(selectedVaults).toEqual([]);
  });
});
