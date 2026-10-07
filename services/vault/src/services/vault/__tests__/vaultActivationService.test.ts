import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
  type WalletClient,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activateVaultWithSecret,
  activationAddedCollateral,
  activationRedeemedForDepositor,
  claimExpiredVaultWithSecret,
} from "../vaultActivationService";

// Inline literal because vi.mock factories are hoisted before outer consts.
const REGISTRY_ADDRESS =
  "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb" as Address;

const mockExecuteWrite = vi.fn();
vi.mock("@/clients/eth-contract/transactionFactory", () => ({
  executeWrite: (...args: unknown[]) => mockExecuteWrite(...args),
}));

vi.mock("@/config/network", () => ({
  getETHChain: () => ({ id: 11155111, name: "sepolia" }),
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb",
    AAVE_ADAPTER: "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd",
  },
}));

describe("activateVaultWithSecret (vault adapter)", () => {
  // SHA-256(secret) — must match `hashlock` or the SDK rejects before write.
  // Pair reused from useVaultActions.test.ts: secret = 32-byte 0x...01,
  // hashlock = sha256 of that preimage.
  const secret =
    "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
  const hashlock =
    "0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5" as Hex;
  const vaultId = ("0x" + "aa".repeat(32)) as Hex;
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

    await activateVaultWithSecret({ vaultId, secret, hashlock, walletClient });

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
      activateVaultWithSecret({ vaultId, secret, hashlock, walletClient }),
    ).resolves.toBe(result);
  });

  it("propagates executeWrite errors unchanged", async () => {
    mockExecuteWrite.mockRejectedValueOnce(
      new Error("ActivationDeadlineExpired"),
    );

    await expect(
      activateVaultWithSecret({ vaultId, secret, hashlock, walletClient }),
    ).rejects.toThrow("ActivationDeadlineExpired");
  });

  it("rejects (without calling executeWrite) when hashlock does not match the secret", async () => {
    const wrongHashlock = ("0x" + "11".repeat(32)) as Hex;

    await expect(
      activateVaultWithSecret({
        vaultId,
        secret,
        hashlock: wrongHashlock,
        walletClient,
      }),
    ).rejects.toThrow(/SHA256\(secret\) does not match/);

    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });
});

describe("claimExpiredVaultWithSecret (vault adapter)", () => {
  // Same secret / sha256 pair as the activation tests above.
  const secret =
    "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
  const hashlock =
    "0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5" as Hex;
  const vaultId = ("0x" + "aa".repeat(32)) as Hex;
  const txHash = ("0x" + "cd".repeat(32)) as Hex;
  const walletClient = {} as WalletClient;

  beforeEach(() => {
    mockExecuteWrite.mockReset();
  });

  it("writes claimExpiredVault to the registry with exactly the vault id and secret", async () => {
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: txHash,
      receipt: { status: "success" },
    });

    await claimExpiredVaultWithSecret({
      vaultId,
      secret,
      hashlock,
      walletClient,
    });

    expect(mockExecuteWrite).toHaveBeenCalledOnce();
    const callArgs = mockExecuteWrite.mock.calls[0][0];
    expect(callArgs.functionName).toBe("claimExpiredVault");
    expect(callArgs.args).toEqual([vaultId, secret]);
    expect(callArgs.address).toBe(REGISTRY_ADDRESS);
    expect(callArgs.errorContext).toBe("expired vault redeem");
    expect(callArgs.errorAbis).toBeUndefined();
  });

  it("rejects (without calling executeWrite) when hashlock does not match the secret", async () => {
    await expect(
      claimExpiredVaultWithSecret({
        vaultId,
        secret,
        hashlock: ("0x" + "11".repeat(32)) as Hex,
        walletClient,
      }),
    ).rejects.toThrow(/SHA256\(secret\) does not match/);

    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });
});

describe("activationAddedCollateral", () => {
  const ADAPTER_ADDRESS =
    "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd" as Address;
  const vaultId = ("0x" + "aa".repeat(32)) as Hex;
  const otherVaultId = ("0x" + "bb".repeat(32)) as Hex;
  const positionAccount = "0x1111111111111111111111111111111111111111";

  function collateralAddedLog(address: Address, loggedVaultId: Hex): Log {
    return {
      address,
      topics: encodeEventTopics({
        abi: AaveIntegrationAdapterABI,
        eventName: "CollateralAdded",
        args: { positionAccount, vaultId: loggedVaultId },
      }) as Log["topics"],
      data: "0x",
    } as unknown as Log;
  }

  // Stands in for the registry's PeginActivated and VaultClaimableBy logs:
  // they come from the registry, not the adapter, and are not CollateralAdded.
  const registryLog = {
    address: REGISTRY_ADDRESS,
    topics: [("0x" + "01".repeat(32)) as Hex, vaultId],
    data: "0x",
  } as unknown as Log;

  function resultWithLogs(logs: Log[]) {
    return {
      transactionHash: ("0x" + "cd".repeat(32)) as Hex,
      receipt: { status: "success", logs },
    } as unknown as Parameters<typeof activationAddedCollateral>[0];
  }

  it("is false when the receipt has registry activation logs but no CollateralAdded (auto-redeem)", () => {
    expect(
      activationAddedCollateral(
        resultWithLogs([registryLog, registryLog]),
        vaultId,
      ),
    ).toBe(false);
  });

  it("is true when the adapter logs CollateralAdded for this vault", () => {
    expect(
      activationAddedCollateral(
        resultWithLogs([
          registryLog,
          collateralAddedLog(ADAPTER_ADDRESS, vaultId),
        ]),
        vaultId,
      ),
    ).toBe(true);
  });

  it("is false when CollateralAdded is for a different vault", () => {
    expect(
      activationAddedCollateral(
        resultWithLogs([collateralAddedLog(ADAPTER_ADDRESS, otherVaultId)]),
        vaultId,
      ),
    ).toBe(false);
  });

  it("is false when CollateralAdded comes from a contract other than the adapter", () => {
    expect(
      activationAddedCollateral(
        resultWithLogs([collateralAddedLog(REGISTRY_ADDRESS, vaultId)]),
        vaultId,
      ),
    ).toBe(false);
  });
});

describe("activationRedeemedForDepositor", () => {
  const ADAPTER_ADDRESS =
    "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd" as Address;
  const vaultId = ("0x" + "aa".repeat(32)) as Hex;
  const otherVaultId = ("0x" + "bb".repeat(32)) as Hex;
  const peginTxHash = ("0x" + "cc".repeat(32)) as Hex;
  const vaultProviderKey = ("0x" + "dd".repeat(32)) as Hex;
  const depositorKey = ("0x" + "ee".repeat(32)) as Hex;
  const vaultKeeperKey = ("0x" + "ff".repeat(32)) as Hex;

  function vaultClaimableByLog(
    address: Address,
    loggedVaultId: Hex,
    claimerPK: Hex,
  ): Log {
    return {
      address,
      topics: encodeEventTopics({
        abi: BTCVaultRegistryABI,
        eventName: "VaultClaimableBy",
        args: { vaultId: loggedVaultId, peginTxHash, claimerPK },
      }) as Log["topics"],
      // vaultCoreVersion, proverCircuitVersion, offchainParamsVersion,
      // universalChallengersVersion, appVaultKeepersVersion.
      data: encodeAbiParameters(
        [
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint16" },
        ],
        [1, 1, 1, 1, 1],
      ),
    } as unknown as Log;
  }

  function collateralAddedLog(): Log {
    return {
      address: ADAPTER_ADDRESS,
      topics: encodeEventTopics({
        abi: AaveIntegrationAdapterABI,
        eventName: "CollateralAdded",
        args: {
          positionAccount: "0x1111111111111111111111111111111111111111",
          vaultId,
        },
      }) as Log["topics"],
      data: "0x",
    } as unknown as Log;
  }

  function resultWithLogs(logs: Log[]) {
    return {
      transactionHash: ("0x" + "cd".repeat(32)) as Hex,
      receipt: { status: "success", logs },
    } as unknown as Parameters<typeof activationRedeemedForDepositor>[0];
  }

  it("is true when the registry makes this vault claimable by the vault provider and the depositor", () => {
    expect(
      activationRedeemedForDepositor(
        resultWithLogs([
          vaultClaimableByLog(REGISTRY_ADDRESS, vaultId, vaultProviderKey),
          vaultClaimableByLog(REGISTRY_ADDRESS, vaultId, depositorKey),
        ]),
        vaultId,
        depositorKey,
      ),
    ).toBe(true);
  });

  it("is false when the only claim for this vault is a vault keeper's, as from an application redeeming it to its keeper", () => {
    expect(
      activationRedeemedForDepositor(
        resultWithLogs([
          vaultClaimableByLog(REGISTRY_ADDRESS, vaultId, vaultKeeperKey),
        ]),
        vaultId,
        depositorKey,
      ),
    ).toBe(false);
  });

  it("matches the depositor key whatever its case or 0x prefix", () => {
    expect(
      activationRedeemedForDepositor(
        resultWithLogs([
          vaultClaimableByLog(REGISTRY_ADDRESS, vaultId, depositorKey),
        ]),
        vaultId,
        "EE".repeat(32),
      ),
    ).toBe(true);
  });

  it("is false for an activation the application accepted", () => {
    expect(
      activationRedeemedForDepositor(
        resultWithLogs([collateralAddedLog()]),
        vaultId,
        depositorKey,
      ),
    ).toBe(false);
  });

  it("is false for an activation that carries neither log, as into another application", () => {
    expect(
      activationRedeemedForDepositor(resultWithLogs([]), vaultId, depositorKey),
    ).toBe(false);
  });

  it("is false when the depositor's VaultClaimableBy is for a different vault", () => {
    expect(
      activationRedeemedForDepositor(
        resultWithLogs([
          vaultClaimableByLog(REGISTRY_ADDRESS, otherVaultId, depositorKey),
        ]),
        vaultId,
        depositorKey,
      ),
    ).toBe(false);
  });

  it("is false when the depositor's VaultClaimableBy comes from a contract other than the registry", () => {
    expect(
      activationRedeemedForDepositor(
        resultWithLogs([
          vaultClaimableByLog(ADAPTER_ADDRESS, vaultId, depositorKey),
        ]),
        vaultId,
        depositorKey,
      ),
    ).toBe(false);
  });
});
