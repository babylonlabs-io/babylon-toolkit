import type { Address, Hex, WalletClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { activateVaultWithSecret } from "../vaultActivationService";

// Inline literal because vi.mock factories are hoisted before outer consts.
const REGISTRY_ADDRESS =
  "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb" as Address;

const mockExecuteWrite = vi.fn();
vi.mock("@/clients/eth-contract/transactionFactory", () => ({
  executeWrite: (...args: unknown[]) => mockExecuteWrite(...args),
}));

vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: () => ({ id: 11155111, name: "sepolia" }),
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb",
  },
}));

describe("activateVaultWithSecret (vault adapter)", () => {
  const vaultId = ("0x" + "aa".repeat(32)) as Hex;
  const secret = ("0x" + "bb".repeat(32)) as Hex;
  const txHash = ("0x" + "cd".repeat(32)) as Hex;
  const walletClient = {} as WalletClient;

  beforeEach(() => {
    mockExecuteWrite.mockReset();
  });

  it("invokes executeWrite with the chain, wallet, address, and activation args", async () => {
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: txHash,
      receipt: { status: "success" },
    });

    await activateVaultWithSecret({ vaultId, secret, walletClient });

    expect(mockExecuteWrite).toHaveBeenCalledOnce();
    const callArgs = mockExecuteWrite.mock.calls[0][0];
    expect(callArgs.functionName).toBe("activateVaultWithSecret");
    expect(callArgs.args).toEqual([vaultId, secret, "0x"]);
    expect(callArgs.address).toBe(REGISTRY_ADDRESS);
    expect(callArgs.errorContext).toBe("vault activation");
    expect(callArgs.walletClient).toBe(walletClient);
    expect(callArgs.chain).toEqual({ id: 11155111, name: "sepolia" });
  });

  it("returns the full TransactionResult (hash + receipt) from executeWrite", async () => {
    const result = {
      transactionHash: txHash,
      receipt: { status: "success", blockNumber: 42n },
    };
    mockExecuteWrite.mockResolvedValueOnce(result);

    await expect(
      activateVaultWithSecret({ vaultId, secret, walletClient }),
    ).resolves.toBe(result);
  });

  it("propagates executeWrite errors unchanged", async () => {
    mockExecuteWrite.mockRejectedValueOnce(
      new Error("ActivationDeadlineExpired"),
    );

    await expect(
      activateVaultWithSecret({ vaultId, secret, walletClient }),
    ).rejects.toThrow("ActivationDeadlineExpired");
  });
});
