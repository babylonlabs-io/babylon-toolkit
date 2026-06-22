import { describe, expect, it } from "vitest";

import { ContractStatus } from "@/models/peginStateMachine";
import type { Vault } from "@/types/vault";

import { countCollateralizableVaults } from "../useVaultCountCap";

const AAVE_ADAPTER = "0xAaveAdapter0000000000000000000000000000AA";
const OTHER_ADAPTER = "0xOtherAdapter000000000000000000000000000BB";

function makeVault(
  status: ContractStatus,
  applicationEntryPoint: string = AAVE_ADAPTER,
): Vault {
  return {
    id: "0x01",
    peginTxHash: "0x01",
    depositor: "0xDepositor",
    depositorBtcPubkey: "0x01",
    depositorSignedPeginTx: "0x01",
    unsignedPrePeginTx: "0x01",
    amount: 100_000n,
    vaultProvider: "0xVP",
    htlcVout: 0,
    status,
    applicationEntryPoint: applicationEntryPoint as `0x${string}`,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    offchainParamsVersion: 1,
    createdAt: 0,
    referralCode: 0,
    depositorPayoutBtcAddress: "0x01",
    depositorWotsPkHash: "0x01",
    isInUse: status === ContractStatus.ACTIVE,
  } as Vault;
}

describe("countCollateralizableVaults", () => {
  it("counts ACTIVE vaults for the matching adapter", () => {
    const vaults = [makeVault(ContractStatus.ACTIVE)];
    expect(countCollateralizableVaults(vaults, AAVE_ADAPTER)).toBe(1);
  });

  it("counts PENDING vaults for the matching adapter", () => {
    const vaults = [makeVault(ContractStatus.PENDING)];
    expect(countCollateralizableVaults(vaults, AAVE_ADAPTER)).toBe(1);
  });

  it("counts VERIFIED vaults for the matching adapter", () => {
    const vaults = [makeVault(ContractStatus.VERIFIED)];
    expect(countCollateralizableVaults(vaults, AAVE_ADAPTER)).toBe(1);
  });

  it("excludes REDEEMED, LIQUIDATED, INVALID, DEPOSITOR_WITHDRAWN, EXPIRED", () => {
    const vaults = [
      makeVault(ContractStatus.REDEEMED),
      makeVault(ContractStatus.LIQUIDATED),
      makeVault(ContractStatus.INVALID),
      makeVault(ContractStatus.DEPOSITOR_WITHDRAWN),
      makeVault(ContractStatus.EXPIRED),
    ];
    expect(countCollateralizableVaults(vaults, AAVE_ADAPTER)).toBe(0);
  });

  it("excludes vaults with a different applicationEntryPoint", () => {
    const vaults = [
      makeVault(ContractStatus.ACTIVE, OTHER_ADAPTER),
      makeVault(ContractStatus.PENDING, OTHER_ADAPTER),
      makeVault(ContractStatus.VERIFIED, OTHER_ADAPTER),
    ];
    expect(countCollateralizableVaults(vaults, AAVE_ADAPTER)).toBe(0);
  });

  it("matches applicationEntryPoint case-insensitively", () => {
    const vaults = [
      makeVault(ContractStatus.ACTIVE, AAVE_ADAPTER.toLowerCase()),
      makeVault(ContractStatus.PENDING, AAVE_ADAPTER.toUpperCase()),
    ];
    expect(countCollateralizableVaults(vaults, AAVE_ADAPTER)).toBe(2);
  });

  it("returns 0 for an empty vault list", () => {
    expect(countCollateralizableVaults([], AAVE_ADAPTER)).toBe(0);
  });

  it("counts only matching adapter vaults in a mixed list", () => {
    const vaults = [
      makeVault(ContractStatus.ACTIVE, AAVE_ADAPTER),
      makeVault(ContractStatus.ACTIVE, OTHER_ADAPTER),
      makeVault(ContractStatus.PENDING, AAVE_ADAPTER),
      makeVault(ContractStatus.REDEEMED, AAVE_ADAPTER),
      makeVault(ContractStatus.VERIFIED, OTHER_ADAPTER),
    ];
    expect(countCollateralizableVaults(vaults, AAVE_ADAPTER)).toBe(2);
  });
});
