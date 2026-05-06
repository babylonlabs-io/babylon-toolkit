import { describe, expect, it } from "vitest";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";

import { groupVaultsByProvider } from "../usePegoutPolling";

const VAULT_A: RedeemedVaultInfo = {
  id: "0xaaaa",
  peginTxHash: "0x" + "1".repeat(64),
  amount: 100n,
  vaultProviderAddress: "0xINDEXER_PROVIDER_ATTACKER",
} as RedeemedVaultInfo;

const VAULT_B: RedeemedVaultInfo = {
  id: "0xbbbb",
  peginTxHash: "0x" + "2".repeat(64),
  amount: 200n,
  vaultProviderAddress: "0xCANONICAL_PROVIDER",
} as RedeemedVaultInfo;

describe("groupVaultsByProvider — on-chain rebind (audit #281)", () => {
  it("uses the on-chain provider, ignoring a poisoned indexer value", () => {
    const onChain = new Map([["0xaaaa", "0xCANONICAL_PROVIDER" as const]]);
    const grouped = groupVaultsByProvider([VAULT_A], onChain);
    expect(grouped.size).toBe(1);
    expect(grouped.has("0xCANONICAL_PROVIDER")).toBe(true);
    expect(grouped.has("0xINDEXER_PROVIDER_ATTACKER")).toBe(false);
  });

  it("groups two vaults with the same on-chain provider together", () => {
    const onChain = new Map([
      ["0xaaaa", "0xVP1" as const],
      ["0xbbbb", "0xVP1" as const],
    ]);
    const grouped = groupVaultsByProvider([VAULT_A, VAULT_B], onChain);
    expect(grouped.size).toBe(1);
    expect(grouped.get("0xVP1")?.vaults).toHaveLength(2);
  });

  it("skips vaults missing from the on-chain map (no indexer fallback)", () => {
    const grouped = groupVaultsByProvider([VAULT_B], new Map());
    expect(grouped.size).toBe(0);
  });
});
