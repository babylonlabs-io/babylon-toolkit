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

const BASIC_INFO = {
  depositor: "0xDepositor" as `0x${string}`,
  depositorBtcPubKey: "0xBtcPubKey" as `0x${string}`,
  amount: 100000n,
  vaultProvider: "0xVaultProvider" as `0x${string}`,
  status: 0,
  applicationEntryPoint: "0xAppEntryPoint" as `0x${string}`,
  createdAt: 12345n,
};

const PROTOCOL_INFO = {
  depositorSignedPeginTx: "0xdeadbeef" as `0x${string}`,
  universalChallengersVersion: 1,
  appVaultKeepersVersion: 2,
  offchainParamsVersion: 3,
  verifiedAt: 0n,
  depositorWotsPkHash: "0x00" as `0x${string}`,
  hashlock:
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`,
  htlcVout: 0,
  depositorPopSignature: "0x00" as `0x${string}`,
  prePeginTxHash: "0x00" as `0x${string}`,
  vaultProviderCommissionBps: 10,
};

describe("getVaultFromChain", () => {
  it("returns signing-critical fields from the contract", async () => {
    mockReadContract
      .mockResolvedValueOnce(BASIC_INFO)
      .mockResolvedValueOnce(PROTOCOL_INFO);

    const result = await getVaultFromChain(VAULT_ID);

    expect(result).toEqual({
      depositorSignedPeginTx: PROTOCOL_INFO.depositorSignedPeginTx,
      applicationEntryPoint: BASIC_INFO.applicationEntryPoint,
      vaultProvider: BASIC_INFO.vaultProvider,
      universalChallengersVersion: PROTOCOL_INFO.universalChallengersVersion,
      appVaultKeepersVersion: PROTOCOL_INFO.appVaultKeepersVersion,
      offchainParamsVersion: PROTOCOL_INFO.offchainParamsVersion,
      hashlock: PROTOCOL_INFO.hashlock,
      htlcVout: PROTOCOL_INFO.htlcVout,
      amount: BASIC_INFO.amount,
      prePeginTxHash: PROTOCOL_INFO.prePeginTxHash,
    });
  });

  it("calls readContract with the correct functions and vaultId arg", async () => {
    mockReadContract
      .mockResolvedValueOnce(BASIC_INFO)
      .mockResolvedValueOnce(PROTOCOL_INFO);

    await getVaultFromChain(VAULT_ID);

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xBTCVaultRegistry",
        functionName: "getBtcVaultBasicInfo",
        args: [VAULT_ID],
      }),
    );
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xBTCVaultRegistry",
        functionName: "getBtcVaultProtocolInfo",
        args: [VAULT_ID],
      }),
    );
  });

  it("throws when depositorSignedPeginTx is empty", async () => {
    mockReadContract.mockResolvedValueOnce(BASIC_INFO).mockResolvedValueOnce({
      ...PROTOCOL_INFO,
      depositorSignedPeginTx: "",
    });

    await expect(getVaultFromChain(VAULT_ID)).rejects.toThrow(
      `Vault ${VAULT_ID} not found on-chain or has no pegin transaction`,
    );
  });

  it("throws when depositorSignedPeginTx is 0x", async () => {
    mockReadContract.mockResolvedValueOnce(BASIC_INFO).mockResolvedValueOnce({
      ...PROTOCOL_INFO,
      depositorSignedPeginTx: "0x",
    });

    await expect(getVaultFromChain(VAULT_ID)).rejects.toThrow(
      `Vault ${VAULT_ID} not found on-chain or has no pegin transaction`,
    );
  });
});
