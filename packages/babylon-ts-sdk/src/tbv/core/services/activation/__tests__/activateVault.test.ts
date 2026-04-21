import type { Address, Hash, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BTCVaultRegistryABI } from "../../../contracts/abis/BTCVaultRegistry.abi";
import {
  activateVault,
  type EthContractWriter,
} from "../activateVault";

// Known SHA-256 vector: sha256(0x00...00) = 0x66687aadf862...
const ZERO_SECRET =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const ZERO_HASHLOCK =
  "0x66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925" as Hex;

const VAULT_ID = ("0x" + "aa".repeat(32)) as Hex;
const REGISTRY = ("0x" + "Ab".repeat(20)) as Address;
const TX_HASH = ("0x" + "cd".repeat(32)) as Hash;

describe("activateVault", () => {
  let writeContract: EthContractWriter & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeContract = vi
      .fn()
      .mockResolvedValue({ transactionHash: TX_HASH }) as EthContractWriter &
      ReturnType<typeof vi.fn>;
  });

  it("forwards a fully-populated write call to the injected writer", async () => {
    await activateVault({
      btcVaultRegistryAddress: REGISTRY,
      vaultId: VAULT_ID,
      secret: ZERO_SECRET,
      activationMetadata: "0x",
      writeContract,
    });

    expect(writeContract).toHaveBeenCalledOnce();
    const call = writeContract.mock.calls[0][0];
    expect(call.address).toBe(REGISTRY);
    expect(call.abi).toBe(BTCVaultRegistryABI);
    expect(call.functionName).toBe("activateVaultWithSecret");
    expect(call.args).toEqual([VAULT_ID, ZERO_SECRET, "0x"]);
  });

  it("passes through a custom activationMetadata", async () => {
    await activateVault({
      btcVaultRegistryAddress: REGISTRY,
      vaultId: VAULT_ID,
      secret: ZERO_SECRET,
      activationMetadata: "0xdeadbeef",
      writeContract,
    });

    expect(writeContract.mock.calls[0][0].args[2]).toBe("0xdeadbeef");
  });

  it("normalises a secret without the 0x prefix", async () => {
    const noPrefix = "00".repeat(32);

    await activateVault({
      btcVaultRegistryAddress: REGISTRY,
      vaultId: VAULT_ID,
      secret: noPrefix,
      activationMetadata: "0x",
      writeContract,
    });

    expect(writeContract.mock.calls[0][0].args[1]).toBe(ZERO_SECRET);
  });

  it("normalises a secret with an uppercase 0X prefix", async () => {
    const upperPrefix = "0X" + "00".repeat(32);

    await activateVault({
      btcVaultRegistryAddress: REGISTRY,
      vaultId: VAULT_ID,
      secret: upperPrefix,
      activationMetadata: "0x",
      writeContract,
    });

    expect(writeContract.mock.calls[0][0].args[1]).toBe(ZERO_SECRET);
  });

  it("returns whatever the writer returns (generic pass-through)", async () => {
    interface RichResult {
      transactionHash: Hash;
      receipt: { status: "success"; blockNumber: bigint };
    }
    const richResult: RichResult = {
      transactionHash: TX_HASH,
      receipt: { status: "success", blockNumber: 42n },
    };
    const richWriter = vi
      .fn<EthContractWriter<RichResult>>()
      .mockResolvedValue(richResult);

    const result = await activateVault<RichResult>({
      btcVaultRegistryAddress: REGISTRY,
      vaultId: VAULT_ID,
      secret: ZERO_SECRET,
      activationMetadata: "0x",
      writeContract: richWriter,
    });

    expect(result).toBe(richResult);
  });

  describe("validation", () => {
    it("rejects a vaultId that is the wrong length", async () => {
      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: "0xaa" as Hex,
          secret: ZERO_SECRET,
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow(/vaultId must be 32 bytes/);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("rejects a vaultId with non-hex characters", async () => {
      const nonHex = ("0x" + "zz".repeat(32)) as Hex;

      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: nonHex,
          secret: ZERO_SECRET,
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow(/vaultId must contain only hex characters/);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("rejects a secret that is the wrong length", async () => {
      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: "0xaa",
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow(/secret must be 32 bytes/);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("rejects a secret with non-hex characters", async () => {
      const nonHex = "0x" + "zz".repeat(32);

      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: nonHex,
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow(/secret must contain only hex characters/);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("rejects a btcVaultRegistryAddress that is not 20 bytes", async () => {
      await expect(
        activateVault({
          btcVaultRegistryAddress: "0xabcd" as Address,
          vaultId: VAULT_ID,
          secret: ZERO_SECRET,
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow(/btcVaultRegistryAddress must be a 20-byte/);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("rejects a malformed activationMetadata (non-hex)", async () => {
      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: ZERO_SECRET,
          activationMetadata: "0xzz" as Hex,
          writeContract,
        }),
      ).rejects.toThrow(/activationMetadata must be a 0x-prefixed hex/);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("rejects a malformed activationMetadata (odd hex length)", async () => {
      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: ZERO_SECRET,
          activationMetadata: "0xabc" as Hex,
          writeContract,
        }),
      ).rejects.toThrow(/activationMetadata must be a 0x-prefixed hex/);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("rejects a malformed hashlock (wrong length)", async () => {
      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: ZERO_SECRET,
          hashlock: "0xaa" as Hex,
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow(/hashlock must be 32 bytes/);
      expect(writeContract).not.toHaveBeenCalled();
    });
  });

  describe("hashlock pre-validation", () => {
    it("calls the writer when a provided hashlock matches the secret", async () => {
      await activateVault({
        btcVaultRegistryAddress: REGISTRY,
        vaultId: VAULT_ID,
        secret: ZERO_SECRET,
        hashlock: ZERO_HASHLOCK,
        activationMetadata: "0x",
        writeContract,
      });

      expect(writeContract).toHaveBeenCalledOnce();
    });

    it("rejects and skips the writer when hashlock does not match secret", async () => {
      const wrongHashlock = ("0x" + "11".repeat(32)) as Hex;

      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: ZERO_SECRET,
          hashlock: wrongHashlock,
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow(/SHA256\(secret\) does not match/);
      expect(writeContract).not.toHaveBeenCalled();
    });
  });

  describe("transport", () => {
    it("propagates errors thrown by the injected writer unchanged", async () => {
      writeContract.mockRejectedValueOnce(
        new Error("ActivationDeadlineExpired"),
      );

      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: ZERO_SECRET,
          activationMetadata: "0x",
          writeContract,
        }),
      ).rejects.toThrow("ActivationDeadlineExpired");
    });

    it("aborts before any work when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort(new Error("cancelled"));

      await expect(
        activateVault({
          btcVaultRegistryAddress: REGISTRY,
          vaultId: VAULT_ID,
          secret: ZERO_SECRET,
          activationMetadata: "0x",
          writeContract,
          signal: controller.signal,
        }),
      ).rejects.toThrow("cancelled");
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("returns the transaction hash from the writer", async () => {
      writeContract.mockResolvedValueOnce({ transactionHash: TX_HASH });

      const result = await activateVault({
        btcVaultRegistryAddress: REGISTRY,
        vaultId: VAULT_ID,
        secret: ZERO_SECRET,
        activationMetadata: "0x",
        writeContract,
      });

      expect(result).toEqual({ transactionHash: TX_HASH });
    });
  });
});
