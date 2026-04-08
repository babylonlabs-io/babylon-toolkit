import type { Hex, WalletClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import { activateVaultWithSecret } from "../vaultActivationService";

const mockExecuteWrite = vi.fn();
vi.mock("@/clients/eth-contract/transactionFactory", () => ({
  executeWrite: (...args: unknown[]) => mockExecuteWrite(...args),
}));

vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: () => ({ id: 11155111, name: "sepolia" }),
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xregistry",
  },
}));

describe("activateVaultWithSecret", () => {
  const vaultId = ("0x" + "aa".repeat(32)) as Hex;
  const secret = ("0x" + "bb".repeat(32)) as Hex;
  const walletClient = {} as WalletClient;

  it("passes vaultId, secret, and empty activationMetadata to contract", async () => {
    mockExecuteWrite.mockResolvedValueOnce({ hash: "0xtxhash" });

    await activateVaultWithSecret({ vaultId, secret, walletClient });

    expect(mockExecuteWrite).toHaveBeenCalledOnce();
    const callArgs = mockExecuteWrite.mock.calls[0][0];
    expect(callArgs.functionName).toBe("activateVaultWithSecret");
    expect(callArgs.args).toEqual([vaultId, secret, "0x"]);
    expect(callArgs.address).toBe("0xregistry");
  });

  it("propagates contract errors", async () => {
    mockExecuteWrite.mockRejectedValueOnce(
      new Error("ActivationDeadlineExpired"),
    );

    await expect(
      activateVaultWithSecret({ vaultId, secret, walletClient }),
    ).rejects.toThrow("ActivationDeadlineExpired");
  });
});
