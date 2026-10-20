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

import { ActivationWouldRedeemError } from "@/utils/errors";

import {
  activateVaultWithSecret,
  activateVaultWithSecretAndRedeem,
  activationAddedCollateral,
  activationRedeemedForDepositor,
  claimExpiredVaultWithSecret,
} from "../vaultActivationService";

// Inline literal because vi.mock factories are hoisted before outer consts.
const REGISTRY_ADDRESS =
  "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb" as Address;
const DEPOSITOR = "0x8c5283a3F2995ecF78319bb1ca3BD9a179b3E740" as Address;
const PLANNED_GAS = 4_500_000n;

const {
  mockExecuteWrite,
  mockPlanActivationGasLimit,
  mockAssertActivationAddsCollateral,
  mockPublicClient,
} = vi.hoisted(() => ({
  mockExecuteWrite: vi.fn(),
  mockPlanActivationGasLimit: vi.fn(),
  mockAssertActivationAddsCollateral: vi.fn(),
  mockPublicClient: { simulateBlocks: vi.fn() },
}));

vi.mock(
  "@/clients/eth-contract/transactionFactory",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/clients/eth-contract/transactionFactory")
    >()),
    executeWrite: (...args: unknown[]) => mockExecuteWrite(...args),
  }),
);

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => mockPublicClient },
}));

vi.mock("../activationGasLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../activationGasLimit")>()),
  planActivationGasLimit: (...args: unknown[]) =>
    mockPlanActivationGasLimit(...args),
  assertActivationNotRedeemed: (...args: unknown[]) =>
    mockAssertActivationAddsCollateral(...args),
}));

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: async () => ({
    getTBVProtocolParams: async () => ({ minActivationGas: 5_000_000n }),
  }),
}));

vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), event: vi.fn() },
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
  const depositorBtcPubKey = ("0x" + "ee".repeat(32)) as Hex;
  const walletClient = {
    account: { address: DEPOSITOR },
  } as unknown as WalletClient;

  beforeEach(() => {
    mockExecuteWrite.mockReset();
    mockPlanActivationGasLimit.mockReset();
    mockPlanActivationGasLimit.mockResolvedValue(PLANNED_GAS);
    mockAssertActivationAddsCollateral.mockReset();
  });

  it("invokes executeWrite with the chain, wallet, address, and activation args", async () => {
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: txHash,
      receipt: { status: "success" },
    });

    await activateVaultWithSecret({
      vaultId,
      secret,
      hashlock,
      depositorBtcPubKey,
      walletClient,
    });

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
      activateVaultWithSecret({
        vaultId,
        secret,
        hashlock,
        depositorBtcPubKey,
        walletClient,
      }),
    ).resolves.toEqual({ ...result, minActivationGas: 5_000_000n });
  });

  it("returns the gate it read alongside the transaction result", async () => {
    const receipt = { status: "success", blockNumber: 42n };
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: txHash,
      receipt,
    });

    const result = await activateVaultWithSecret({
      vaultId,
      secret,
      hashlock,
      depositorBtcPubKey,
      walletClient,
    });

    expect(result.minActivationGas).toBe(5_000_000n);
    expect(result.transactionHash).toBe(txHash);
    expect(result.receipt).toBe(receipt);
  });

  it("propagates executeWrite errors unchanged", async () => {
    mockExecuteWrite.mockRejectedValueOnce(
      new Error("ActivationDeadlineExpired"),
    );

    await expect(
      activateVaultWithSecret({
        vaultId,
        secret,
        hashlock,
        depositorBtcPubKey,
        walletClient,
      }),
    ).rejects.toThrow("ActivationDeadlineExpired");
  });

  it("rejects (without calling executeWrite) when hashlock does not match the secret", async () => {
    const wrongHashlock = ("0x" + "11".repeat(32)) as Hex;

    await expect(
      activateVaultWithSecret({
        vaultId,
        secret,
        hashlock: wrongHashlock,
        depositorBtcPubKey,
        walletClient,
      }),
    ).rejects.toThrow(/SHA256\(secret\) does not match/);

    // The gas plan is where the secret first leaves the browser.
    expect(mockPlanActivationGasLimit).not.toHaveBeenCalled();
    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });

  it("sets the write's gas limit from the activation gas plan for the assembled call", async () => {
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: txHash,
      receipt: { status: "success" },
    });

    await activateVaultWithSecret({
      vaultId,
      secret,
      hashlock,
      depositorBtcPubKey,
      walletClient,
    });

    expect(mockPlanActivationGasLimit).toHaveBeenCalledOnce();
    expect(mockPlanActivationGasLimit.mock.calls[0][0]).toMatchObject({
      publicClient: mockPublicClient,
      account: DEPOSITOR,
      vaultId,
      depositorBtcPubKey,
      minActivationGas: 5_000_000n,
      call: {
        address: REGISTRY_ADDRESS,
        functionName: "activateVaultWithSecret",
        args: [vaultId, secret, "0x"],
      },
    });
    expect(mockExecuteWrite.mock.calls[0][0].gas).toBe(PLANNED_GAS);
  });

  it("hands the registry's minimum activation gas to the gas plan", async () => {
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: txHash,
      receipt: { status: "success" },
    });

    await activateVaultWithSecret({
      vaultId,
      secret,
      hashlock,
      depositorBtcPubKey,
      walletClient,
    });

    expect(mockPlanActivationGasLimit.mock.calls[0][0]).toMatchObject({
      minActivationGas: 5_000_000n,
    });
  });

  it("re-checks the activation at the planned limit as the send's pre-flight", async () => {
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: txHash,
      receipt: { status: "success" },
    });
    mockAssertActivationAddsCollateral.mockResolvedValueOnce(undefined);

    await activateVaultWithSecret({
      vaultId,
      secret,
      hashlock,
      depositorBtcPubKey,
      walletClient,
    });

    const { preflight } = mockExecuteWrite.mock.calls[0][0];
    expect(mockAssertActivationAddsCollateral).not.toHaveBeenCalled();
    await preflight();
    expect(mockAssertActivationAddsCollateral).toHaveBeenCalledWith(
      expect.objectContaining({
        publicClient: mockPublicClient,
        account: DEPOSITOR,
        vaultId,
        depositorBtcPubKey,
        gas: PLANNED_GAS,
        call: expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: "activateVaultWithSecret",
        }),
      }),
    );
  });

  it("does not write when the gas plan refuses the activation", async () => {
    const refusal = new ActivationWouldRedeemError("would redeem");
    mockPlanActivationGasLimit.mockRejectedValueOnce(refusal);

    await expect(
      activateVaultWithSecret({
        vaultId,
        secret,
        hashlock,
        depositorBtcPubKey,
        walletClient,
      }),
    ).rejects.toBe(refusal);

    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });

  it("rejects before planning gas when the wallet has no account", async () => {
    await expect(
      activateVaultWithSecret({
        vaultId,
        secret,
        hashlock,
        depositorBtcPubKey,
        walletClient: {} as WalletClient,
      }),
    ).rejects.toThrow("Wallet account not available");

    expect(mockPlanActivationGasLimit).not.toHaveBeenCalled();
    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });
});

describe("activateVaultWithSecretAndRedeem (vault adapter)", () => {
  // Same secret / sha256 pair as the activation tests above.
  const secret =
    "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
  const hashlock =
    "0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5" as Hex;
  const vaultId = ("0x" + "aa".repeat(32)) as Hex;
  const walletClient = {
    account: { address: DEPOSITOR },
  } as unknown as WalletClient;

  beforeEach(() => {
    mockExecuteWrite.mockReset();
    mockPlanActivationGasLimit.mockReset();
  });

  it("leaves the gas limit to the wallet, since the registry calls no application", async () => {
    mockExecuteWrite.mockResolvedValueOnce({
      transactionHash: ("0x" + "cd".repeat(32)) as Hex,
      receipt: { status: "success" },
    });

    await activateVaultWithSecretAndRedeem({
      vaultId,
      secret,
      hashlock,
      walletClient,
    });

    expect(mockPlanActivationGasLimit).not.toHaveBeenCalled();
    const callArgs = mockExecuteWrite.mock.calls[0][0];
    expect(callArgs.functionName).toBe("activateVaultWithSecretAndRedeem");
    expect(callArgs.gas).toBeUndefined();
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
    mockPlanActivationGasLimit.mockReset();
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
    // The registry calls no application here, so the wallet's estimate holds.
    expect(callArgs.gas).toBeUndefined();
    expect(mockPlanActivationGasLimit).not.toHaveBeenCalled();
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
