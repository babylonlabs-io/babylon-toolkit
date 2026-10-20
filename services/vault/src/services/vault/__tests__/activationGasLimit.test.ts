import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { EthContractWriteCall } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getContractError,
  MethodNotFoundRpcError,
  RawContractError,
  toFunctionSelector,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import {
  ActivationWouldRedeemError,
  ContractError,
  isSimulationPhaseError,
  isTerminalActivationError,
} from "@/utils/errors";

import {
  assertActivationNotRedeemed,
  GAS_SEARCH_CEILING,
  planActivationGasLimit,
} from "../activationGasLimit";

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb",
    AAVE_ADAPTER: "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd",
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), event: vi.fn() },
}));

const REGISTRY = "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb" as Address;
const ADAPTER = "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd" as Address;
const DEPOSITOR = "0x8c5283a3F2995ecF78319bb1ca3BD9a179b3E740" as Address;
const vaultId = ("0x" + "aa".repeat(32)) as Hex;
const peginTxHash = ("0x" + "cc".repeat(32)) as Hex;
const vaultProviderKey = ("0x" + "dd".repeat(32)) as Hex;
const depositorBtcPubKey = ("0x" + "ee".repeat(32)) as Hex;

const ACTIVATE_ABI = [
  {
    type: "function",
    name: "activateVaultWithSecret",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "activationMetadata", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const call: EthContractWriteCall = {
  address: REGISTRY,
  abi: ACTIVATE_ABI,
  functionName: "activateVaultWithSecret",
  args: [vaultId, ("0x" + "01".repeat(32)) as Hex, "0x"],
};

/** Everything the planner needs but the client. */
const activation = {
  account: DEPOSITOR,
  call,
  vaultId,
  depositorBtcPubKey,
  minActivationGas: null,
};

const collateralAddedLog = {
  address: ADAPTER,
  topics: encodeEventTopics({
    abi: [
      {
        type: "event",
        name: "CollateralAdded",
        inputs: [
          { indexed: true, name: "positionAccount", type: "address" },
          { indexed: true, name: "vaultId", type: "bytes32" },
        ],
      },
    ],
    eventName: "CollateralAdded",
    args: { positionAccount: DEPOSITOR, vaultId },
  }) as Log["topics"],
  data: "0x",
} as unknown as Log;

// The registry's PeginActivated, which every successful run carries.
const peginActivatedLog = {
  address: REGISTRY,
  topics: encodeEventTopics({
    abi: BTCVaultRegistryABI,
    eventName: "PeginActivated",
    args: { vaultId, depositor: DEPOSITOR },
  }) as Log["topics"],
  data: encodeAbiParameters([{ type: "bytes32" }], [call.args[1] as Hex]),
} as unknown as Log;

/** The registry's redeem log for one claimer key. */
function vaultClaimableByLog(claimerPK: Hex): Log {
  return {
    address: REGISTRY,
    topics: encodeEventTopics({
      abi: BTCVaultRegistryABI,
      eventName: "VaultClaimableBy",
      args: { vaultId, peginTxHash, claimerPK },
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

// What the registry logs when it redeems the vault for the depositor.
const redeemLogs = [
  peginActivatedLog,
  vaultClaimableByLog(vaultProviderKey),
  vaultClaimableByLog(depositorBtcPubKey),
];
// What it logs when the Aave adapter takes the vault.
const activationLogs = [peginActivatedLog, collateralAddedLog];

// Devnet numbers from #2724: a first activation used 2,936,279 gas when it
// succeeded, 999,407 when the registry redeemed it, and activates from a
// limit between 3.1M and 3.3M.
const ACTIVATION_GAS_USED = 2_936_279n;
const REDEEM_GAS_USED = 999_407n;
const ACTIVATES_FROM = 3_200_000n;

type SimulateBlocksArgs = {
  blocks: readonly { calls: readonly { gas?: bigint }[] }[];
};

/**
 * A client whose activation reaches the adapter only from `activatesFrom`
 * gas. Below it the registry redeems, or, with `below: "reverts"`, the whole
 * transaction runs out of gas.
 */
function clientActivatingFrom(
  activatesFrom: bigint,
  below: "redeems" | "reverts" = "redeems",
) {
  const simulateBlocks = vi.fn(async ({ blocks }: SimulateBlocksArgs) => {
    const gas = blocks[0].calls[0].gas;
    if (gas === undefined) throw new Error("test: the probe sets no gas");
    const result =
      gas >= activatesFrom
        ? {
            status: "success",
            gasUsed: ACTIVATION_GAS_USED,
            logs: activationLogs,
          }
        : below === "redeems"
          ? { status: "success", gasUsed: REDEEM_GAS_USED, logs: redeemLogs }
          : {
              status: "failure",
              error: new Error("out of gas"),
              gasUsed: gas,
              logs: [],
            };
    return [{ calls: [result] }];
  });
  return {
    simulateBlocks,
    publicClient: { simulateBlocks } as unknown as PublicClient,
  };
}

function probedGas(simulateBlocks: ReturnType<typeof vi.fn>): bigint[] {
  return simulateBlocks.mock.calls.map(
    (callArgs) =>
      (callArgs[0] as SimulateBlocksArgs).blocks[0].calls[0].gas as bigint,
  );
}

describe("planActivationGasLimit", () => {
  it("simulates the registry call from the depositor at the gas search ceiling first", async () => {
    const { simulateBlocks, publicClient } =
      clientActivatingFrom(ACTIVATES_FROM);

    await planActivationGasLimit({ publicClient, ...activation });

    expect(simulateBlocks.mock.calls[0][0]).toMatchObject({
      blocks: [
        {
          calls: [
            {
              account: DEPOSITOR,
              to: REGISTRY,
              abi: ACTIVATE_ABI,
              functionName: "activateVaultWithSecret",
              args: call.args,
              gas: GAS_SEARCH_CEILING,
            },
          ],
        },
      ],
    });
  });

  it("returns the lowest limit it saw activate, within 1.5% above the threshold, with 50% headroom", async () => {
    const { simulateBlocks, publicClient } =
      clientActivatingFrom(ACTIVATES_FROM);

    const gasLimit = await planActivationGasLimit({
      publicClient,
      ...activation,
    });

    const probes = probedGas(simulateBlocks);
    const lowestActivating = probes
      .filter((gas) => gas >= ACTIVATES_FROM)
      .reduce((min, gas) => (gas < min ? gas : min));
    expect(gasLimit).toBe((lowestActivating * 3n) / 2n);
    expect(lowestActivating).toBeLessThanOrEqual(
      ACTIVATES_FROM + (ACTIVATES_FROM * 16n) / 1000n,
    );
    // The search bracketed the threshold rather than stopping at the ceiling.
    expect(probes.some((gas) => gas < ACTIVATES_FROM)).toBe(true);
    // A node estimate would have landed on the redeem path below it.
    expect(gasLimit).toBeGreaterThan(ACTIVATES_FROM);
  });

  it("never probes at or below the registry's minimum activation gas", async () => {
    // A gated registry: below the gate the transaction reverts.
    const { simulateBlocks, publicClient } = clientActivatingFrom(
      5_400_000n,
      "reverts",
    );

    const limit = await planActivationGasLimit({
      publicClient,
      ...activation,
      minActivationGas: 5_000_000n,
    });

    expect(
      probedGas(simulateBlocks)
        .slice(1)
        .every((g) => g > 5_000_000n),
    ).toBe(true);
    expect(limit).toBeGreaterThanOrEqual(5_400_000n);
  });

  it("searches from the gas used when the deployment has no minimum", async () => {
    const { simulateBlocks, publicClient } =
      clientActivatingFrom(ACTIVATES_FROM);

    await planActivationGasLimit({
      publicClient,
      ...activation,
      minActivationGas: null,
    });

    // The probes of the ungated search, starting just below ACTIVATION_GAS_USED.
    expect(probedGas(simulateBlocks)).toEqual([
      16_777_216n,
      5_872_556n,
      4_404_417n,
      3_670_347n,
      3_303_312n,
      3_119_795n,
      3_211_553n,
      3_165_674n,
    ]);
  });

  it("searches from the gas used when the minimum is zero", async () => {
    const { simulateBlocks, publicClient } =
      clientActivatingFrom(ACTIVATES_FROM);

    await planActivationGasLimit({
      publicClient,
      ...activation,
      minActivationGas: 0n,
    });

    expect(probedGas(simulateBlocks)).toEqual([
      16_777_216n,
      5_872_556n,
      4_404_417n,
      3_670_347n,
      3_303_312n,
      3_119_795n,
      3_211_553n,
      3_165_674n,
    ]);
  });

  it("finds the limit in at most ten simulations", async () => {
    const { simulateBlocks, publicClient } =
      clientActivatingFrom(ACTIVATES_FROM);

    await planActivationGasLimit({ publicClient, ...activation });

    expect(simulateBlocks.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("caps the limit at the gas search ceiling", async () => {
    const { publicClient } = clientActivatingFrom(12_000_000n);

    await expect(
      planActivationGasLimit({ publicClient, ...activation }),
    ).resolves.toBe(GAS_SEARCH_CEILING);
  });

  it("refuses, after one simulation, an activation the registry redeems for the depositor at the ceiling", async () => {
    const { simulateBlocks, publicClient } = clientActivatingFrom(
      GAS_SEARCH_CEILING + 1n,
    );

    const thrown = await planActivationGasLimit({
      publicClient,
      ...activation,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ActivationWouldRedeemError);
    expect((thrown as Error).message).toBe(
      COPY.deposit.errors.activationWouldRedeem,
    );
    expect(simulateBlocks).toHaveBeenCalledOnce();
  });

  it("accepts an activation into another application, which logs no CollateralAdded", async () => {
    // The registry hands the vault to its application and redeems nothing.
    const simulateBlocks = vi.fn(async () => [
      {
        calls: [
          {
            status: "success",
            gasUsed: ACTIVATION_GAS_USED,
            logs: [peginActivatedLog],
          },
        ],
      },
    ]);
    const publicClient = { simulateBlocks } as unknown as PublicClient;

    const gasLimit = await planActivationGasLimit({
      publicClient,
      ...activation,
    });

    expect(gasLimit).toBeGreaterThan(ACTIVATION_GAS_USED);
    expect(simulateBlocks.mock.calls.length).toBeGreaterThan(1);
  });

  it("throws a registry revert at the ceiling as a simulation-phase contract error", async () => {
    const publicClient = {
      simulateBlocks: vi.fn().mockResolvedValue([
        {
          calls: [
            {
              status: "failure",
              error: new Error("execution reverted"),
              gasUsed: 41_884n,
              logs: [],
            },
          ],
        },
      ]),
    } as unknown as PublicClient;

    const thrown = await planActivationGasLimit({
      publicClient,
      ...activation,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(true);
  });

  it("decodes a registry revert at the ceiling, so a passed activation deadline stays terminal", async () => {
    // Shaped as viem shapes a geth revert with data (RawContractError is code 3).
    const deadlineRevert = getContractError(
      new RawContractError({
        data: toFunctionSelector("ActivationDeadlineExpired()"),
      }),
      {
        abi: BTCVaultRegistryABI,
        address: REGISTRY,
        functionName: "activateVaultWithSecret",
        args: call.args,
      },
    );
    const publicClient = {
      simulateBlocks: vi.fn().mockResolvedValue([
        {
          calls: [
            {
              status: "failure",
              error: deadlineRevert,
              gasUsed: 41_884n,
              logs: [],
            },
          ],
        },
      ]),
    } as unknown as PublicClient;

    const thrown = await planActivationGasLimit({
      publicClient,
      ...activation,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as ContractError).reason).toBe("ActivationDeadlineExpired");
    expect(isTerminalActivationError(thrown)).toBe(true);
  });

  it("fails closed when a successful simulation carries no logs", async () => {
    const publicClient = {
      simulateBlocks: vi
        .fn()
        .mockResolvedValue([
          { calls: [{ status: "success", gasUsed: ACTIVATION_GAS_USED }] },
        ]),
    } as unknown as PublicClient;

    const thrown = await planActivationGasLimit({
      publicClient,
      ...activation,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as ContractError).message).toBe(
      COPY.deposit.errors.activationCheckUnsupported,
    );
    expect(isSimulationPhaseError(thrown)).toBe(true);
    expect(isTerminalActivationError(thrown)).toBe(true);
  });

  it("fails closed when a successful simulation carries no registry activation log", async () => {
    const publicClient = {
      simulateBlocks: vi.fn().mockResolvedValue([
        {
          calls: [
            { status: "success", gasUsed: ACTIVATION_GAS_USED, logs: [] },
          ],
        },
      ]),
    } as unknown as PublicClient;

    const thrown = await planActivationGasLimit({
      publicClient,
      ...activation,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as ContractError).message).toBe(
      COPY.deposit.errors.activationCheckUnsupported,
    );
    expect(isSimulationPhaseError(thrown)).toBe(true);
    expect(isTerminalActivationError(thrown)).toBe(true);
  });

  it("throws a failed simulation request as a simulation-phase contract error", async () => {
    const publicClient = {
      simulateBlocks: vi
        .fn()
        .mockRejectedValue(new Error("fetch failed: connection refused")),
    } as unknown as PublicClient;

    const thrown = await planActivationGasLimit({
      publicClient,
      ...activation,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(true);
  });

  it("names the unsupported check when the RPC does not serve eth_simulateV1", async () => {
    const publicClient = {
      simulateBlocks: vi.fn().mockRejectedValue(
        new MethodNotFoundRpcError(new Error("Method not found"), {
          method: "eth_simulateV1",
        }),
      ),
    } as unknown as PublicClient;

    const thrown = await planActivationGasLimit({
      publicClient,
      ...activation,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as Error).message).toBe(
      COPY.deposit.errors.activationCheckUnsupported,
    );
    expect(isSimulationPhaseError(thrown)).toBe(true);
    // Retrying the same endpoint cannot help, so the UI offers Close.
    expect(isTerminalActivationError(thrown)).toBe(true);
  });

  it("does not simulate once aborted", async () => {
    const { simulateBlocks, publicClient } =
      clientActivatingFrom(ACTIVATES_FROM);
    const controller = new AbortController();
    controller.abort();

    await expect(
      planActivationGasLimit({
        publicClient,
        ...activation,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(simulateBlocks).not.toHaveBeenCalled();
  });

  it("treats a transaction that reverts below the threshold as not activating", async () => {
    const { simulateBlocks, publicClient } = clientActivatingFrom(
      ACTIVATES_FROM,
      "reverts",
    );

    const gasLimit = await planActivationGasLimit({
      publicClient,
      ...activation,
    });

    const lowestActivating = probedGas(simulateBlocks)
      .filter((gas) => gas >= ACTIVATES_FROM)
      .reduce((min, gas) => (gas < min ? gas : min));
    expect(gasLimit).toBe((lowestActivating * 3n) / 2n);
  });
});

describe("assertActivationNotRedeemed", () => {
  it("passes when the registry hands the vault to its application at the given limit", async () => {
    const { simulateBlocks, publicClient } =
      clientActivatingFrom(ACTIVATES_FROM);

    await expect(
      assertActivationNotRedeemed({
        publicClient,
        ...activation,
        gas: 4_800_000n,
      }),
    ).resolves.toBeUndefined();
    expect(probedGas(simulateBlocks)).toEqual([4_800_000n]);
  });

  it("refuses when the registry redeems the vault for the depositor at the given limit", async () => {
    const { publicClient } = clientActivatingFrom(ACTIVATES_FROM);

    await expect(
      assertActivationNotRedeemed({
        publicClient,
        ...activation,
        gas: 2_958_673n,
      }),
    ).rejects.toBeInstanceOf(ActivationWouldRedeemError);
  });

  it("throws a registry revert at the given limit as a simulation-phase contract error", async () => {
    const { publicClient } = clientActivatingFrom(ACTIVATES_FROM, "reverts");

    const thrown = await assertActivationNotRedeemed({
      publicClient,
      ...activation,
      gas: 2_958_673n,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(true);
  });

  it("does not accept a simulation that finished after a cancellation", async () => {
    const controller = new AbortController();
    const publicClient = {
      simulateBlocks: vi.fn(async () => {
        controller.abort();
        return [
          {
            calls: [
              {
                status: "success",
                gasUsed: ACTIVATION_GAS_USED,
                logs: activationLogs,
              },
            ],
          },
        ];
      }),
    } as unknown as PublicClient;

    await expect(
      assertActivationNotRedeemed({
        publicClient,
        ...activation,
        gas: 4_800_000n,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
