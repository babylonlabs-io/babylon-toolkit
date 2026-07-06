import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import type { Vault } from "@/types/vault";

import { countCollateralizableVaults } from "../useVaultCountCap";

const ADAPTER = "0x00000000000000000000000000000000000000a1" as Address;
const OTHER_ADAPTER = "0x00000000000000000000000000000000000000b2" as Address;

function v(status: ContractStatus, entryPoint: Address = ADAPTER): Vault {
  return { status, applicationEntryPoint: entryPoint } as unknown as Vault;
}

describe("countCollateralizableVaults", () => {
  it("counts ACTIVE + PENDING + VERIFIED scoped to the adapter (the in-flight margin)", () => {
    const vaults = [
      v(ContractStatus.ACTIVE),
      v(ContractStatus.PENDING),
      v(ContractStatus.VERIFIED),
    ];
    expect(countCollateralizableVaults(vaults, ADAPTER)).toBe(3);
  });

  it("excludes REDEEMED / LIQUIDATED / withdrawn vaults (they free their slot)", () => {
    const vaults = [
      v(ContractStatus.ACTIVE),
      v(ContractStatus.REDEEMED),
      v(ContractStatus.LIQUIDATED),
      v(ContractStatus.DEPOSITOR_WITHDRAWN),
    ];
    expect(countCollateralizableVaults(vaults, ADAPTER)).toBe(1);
  });

  it("excludes vaults bound to a different adapter", () => {
    const vaults = [
      v(ContractStatus.ACTIVE),
      v(ContractStatus.ACTIVE, OTHER_ADAPTER),
    ];
    expect(countCollateralizableVaults(vaults, ADAPTER)).toBe(1);
  });

  it("matches the adapter case-insensitively", () => {
    const vaults = [v(ContractStatus.ACTIVE, ADAPTER.toUpperCase() as Address)];
    expect(countCollateralizableVaults(vaults, ADAPTER.toLowerCase())).toBe(1);
  });
});
