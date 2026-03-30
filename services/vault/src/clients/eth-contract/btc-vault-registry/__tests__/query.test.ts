import { describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: mockReadContract,
    }),
  },
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xBTCVaultRegistry",
  },
}));

import { getVaultFromChain } from "../query";

const VAULT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

const FULL_VAULT = {
  depositorSignedPeginTx: "0xdeadbeef",
  applicationEntryPoint: "0xAppEntryPoint" as `0x${string}`,
  vaultProvider: "0xVaultProvider" as `0x${string}`,
  universalChallengersVersion: 1,
  appVaultKeepersVersion: 2,
  offchainParamsVersion: 3,
};

describe("getVaultFromChain", () => {
  it("returns signing-critical fields from the contract", async () => {
    mockReadContract.mockResolvedValue(FULL_VAULT);

    const result = await getVaultFromChain(VAULT_ID);

    expect(result).toEqual({
      depositorSignedPeginTx: FULL_VAULT.depositorSignedPeginTx,
      applicationEntryPoint: FULL_VAULT.applicationEntryPoint,
      vaultProvider: FULL_VAULT.vaultProvider,
      universalChallengersVersion: FULL_VAULT.universalChallengersVersion,
      appVaultKeepersVersion: FULL_VAULT.appVaultKeepersVersion,
      offchainParamsVersion: FULL_VAULT.offchainParamsVersion,
    });
  });

  it("calls readContract with the correct address, function, and vaultId arg", async () => {
    mockReadContract.mockResolvedValue(FULL_VAULT);

    await getVaultFromChain(VAULT_ID);

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xBTCVaultRegistry",
        functionName: "getBTCVault",
        args: [VAULT_ID],
      }),
    );
  });

  it("throws when depositorSignedPeginTx is empty", async () => {
    mockReadContract.mockResolvedValue({
      ...FULL_VAULT,
      depositorSignedPeginTx: "",
    });

    await expect(getVaultFromChain(VAULT_ID)).rejects.toThrow(
      `Vault ${VAULT_ID} not found on-chain or has no pegin transaction`,
    );
  });

  it("throws when depositorSignedPeginTx is 0x", async () => {
    mockReadContract.mockResolvedValue({
      ...FULL_VAULT,
      depositorSignedPeginTx: "0x",
    });

    await expect(getVaultFromChain(VAULT_ID)).rejects.toThrow(
      `Vault ${VAULT_ID} not found on-chain or has no pegin transaction`,
    );
  });
});
