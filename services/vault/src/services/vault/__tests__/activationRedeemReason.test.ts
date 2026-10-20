import {
  BTCVaultRegistryABI,
  VAULT_ERROR_ABI,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionData,
  encodePacked,
  getAbiItem,
  slice,
  toFunctionSelector,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  activationFunctionFromTransaction,
  activationRedeemReasonText,
  classifyActivationRedeem,
  isCapInferenceAllowed,
  type ActivationFunction,
} from "../activationRedeemReason";

import fixture from "./fixtures/metamaskWrappedActivation.json";

// Inline literals because vi.mock factories are hoisted; the registry is the golden vector's.
vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xE976a4f2B90E64A9A9374453bC526e67625cC750",
    AAVE_ADAPTER: "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd",
  },
}));

const REGISTRY = fixture.registry as Address;
const AAVE_ADAPTER = "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd";
const OTHER_CONTRACT = "0x1111111111111111111111111111111111111111" as Address;
const DEPOSITOR = "0x8c5283a3F2995ecF78319bb1ca3BD9a179b3E740" as Address;
const VAULT_A = fixture.vaultId as Hex;
const VAULT_B = `0x${"bb".repeat(32)}` as Hex;
const SECRET = `0x${"11".repeat(32)}` as Hex;
const PEGIN_TX_HASH = `0x${"22".repeat(32)}` as Hex;
const VP_KEY = `0x${"33".repeat(32)}` as Hex;
const DEPOSITOR_KEY = `0x${"44".repeat(32)}` as Hex;

// IDelegationManager.redeemDelegations, MetaMask/delegation-framework@v1.3.0.
const REDEEM_DELEGATIONS_ABI = [
  {
    type: "function",
    name: "redeemDelegations",
    inputs: [
      { name: "_permissionContexts", type: "bytes[]" },
      { name: "_modes", type: "bytes32[]" },
      { name: "_executionCallDatas", type: "bytes[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ERC-7579 modes: byte 0 is the call type, byte 1 the exec type.
const SINGLE_DEFAULT_MODE = `0x${"00".repeat(32)}` as Hex;
const BATCH_MODE = `0x01${"00".repeat(31)}` as Hex;
const TRY_MODE = `0x0001${"00".repeat(30)}` as Hex;

// Solidity's built-in revert payloads.
const SOLIDITY_BUILTIN_ERRORS_ABI = [
  {
    type: "error",
    name: "Error",
    inputs: [{ name: "message", type: "string" }],
  },
  {
    type: "error",
    name: "Panic",
    inputs: [{ name: "reason", type: "uint256" }],
  },
] as const;
// The Error(string) selector with no body.
const TRUNCATED_ERROR_STRING = toFunctionSelector("Error(string)");

function activateCall(vaultId: Hex): Hex {
  return encodeFunctionData({
    abi: BTCVaultRegistryABI,
    functionName: "activateVaultWithSecret",
    args: [vaultId, SECRET, "0x"],
  });
}

function activateAndRedeemCall(vaultId: Hex): Hex {
  return encodeFunctionData({
    abi: BTCVaultRegistryABI,
    functionName: "activateVaultWithSecretAndRedeem",
    args: [vaultId, SECRET],
  });
}

function wrap(
  executions: { mode: Hex; target: Address; callData: Hex }[],
): Hex {
  return encodeFunctionData({
    abi: REDEEM_DELEGATIONS_ABI,
    functionName: "redeemDelegations",
    args: [
      executions.map((): Hex => "0x"),
      executions.map((execution) => execution.mode),
      executions.map((execution) =>
        encodePacked(
          ["address", "uint256", "bytes"],
          [execution.target, 0n, execution.callData],
        ),
      ),
    ],
  });
}

function makeLog(
  address: Address,
  logIndex: number,
  topics: readonly unknown[],
  data: Hex,
): Log {
  return {
    address,
    logIndex,
    topics,
    data,
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: null,
    removed: false,
  } as unknown as Log;
}

function peginActivatedLog(
  vaultId: Hex,
  logIndex: number,
  address: Address = REGISTRY,
): Log {
  return makeLog(
    address,
    logIndex,
    encodeEventTopics({
      abi: BTCVaultRegistryABI,
      eventName: "PeginActivated",
      args: { vaultId, depositor: DEPOSITOR },
    }),
    encodeAbiParameters([{ type: "bytes32" }], [SECRET]),
  );
}

function vaultClaimableByLog(
  vaultId: Hex,
  claimerPK: Hex,
  logIndex: number,
): Log {
  const event = getAbiItem({
    abi: BTCVaultRegistryABI,
    name: "VaultClaimableBy",
  });
  const dataInputs = event.inputs.filter((input) => !input.indexed);
  return makeLog(
    REGISTRY,
    logIndex,
    encodeEventTopics({
      abi: BTCVaultRegistryABI,
      eventName: "VaultClaimableBy",
      args: { vaultId, peginTxHash: PEGIN_TX_HASH, claimerPK },
    }),
    encodeAbiParameters(
      dataInputs,
      dataInputs.map(() => 1),
    ),
  );
}

/** The depositor redeem: the VP key, then the depositor key. */
function redeemPair(vaultId: Hex, firstLogIndex: number): Log[] {
  return [
    vaultClaimableByLog(vaultId, VP_KEY, firstLogIndex),
    vaultClaimableByLog(vaultId, DEPOSITOR_KEY, firstLogIndex + 1),
  ];
}

function activationFailedLog(revertData: Hex, logIndex: number): Log {
  return makeLog(
    REGISTRY,
    logIndex,
    encodeEventTopics({
      abi: BTCVaultRegistryABI,
      eventName: "ActivationFailed",
    }),
    encodeAbiParameters([{ type: "bytes" }], [revertData]),
  );
}

function classify(
  logs: Log[],
  overrides: {
    vaultId?: Hex;
    calledFunction?: ActivationFunction;
    gatePresentAtReceipt?: boolean;
    capInferenceAllowed?: boolean;
  } = {},
) {
  return classifyActivationRedeem({
    logs,
    vaultId: overrides.vaultId ?? VAULT_A,
    calledFunction: overrides.calledFunction ?? "activateVaultWithSecret",
    gatePresentAtReceipt: overrides.gatePresentAtReceipt ?? true,
    capInferenceAllowed: overrides.capInferenceAllowed ?? true,
  });
}

function failedRedeemLogs(revertData: Hex): Log[] {
  return [
    peginActivatedLog(VAULT_A, 0),
    ...redeemPair(VAULT_A, 1),
    activationFailedLog(revertData, 3),
  ];
}

describe("activationFunctionFromTransaction", () => {
  it("reads activateVaultWithSecret from MetaMask's real redeemDelegations wrapper for the vault it names", () => {
    const tx = { to: fixture.to as Address, input: fixture.input as Hex };
    expect(activationFunctionFromTransaction(tx, VAULT_A)).toBe(
      "activateVaultWithSecret",
    );
  });

  it("is unknown for the real wrapper when asked about a different vault", () => {
    const tx = { to: fixture.to as Address, input: fixture.input as Hex };
    expect(activationFunctionFromTransaction(tx, VAULT_B)).toBe("unknown");
  });

  it("reads a direct registry call whose first argument is the vault", () => {
    const tx = { to: REGISTRY, input: activateCall(VAULT_A) };
    expect(activationFunctionFromTransaction(tx, VAULT_A)).toBe(
      "activateVaultWithSecret",
    );
  });

  it("is unknown for a direct registry call naming another vault", () => {
    const tx = { to: REGISTRY, input: activateCall(VAULT_B) };
    expect(activationFunctionFromTransaction(tx, VAULT_A)).toBe("unknown");
  });

  it("reads the escape hatch", () => {
    const tx = { to: REGISTRY, input: activateAndRedeemCall(VAULT_A) };
    expect(activationFunctionFromTransaction(tx, VAULT_A)).toBe(
      "activateVaultWithSecretAndRedeem",
    );
  });

  it("is unknown for claimExpiredVault", () => {
    const input = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "claimExpiredVault",
      args: [VAULT_A, SECRET],
    });
    expect(
      activationFunctionFromTransaction({ to: REGISTRY, input }, VAULT_A),
    ).toBe("unknown");
  });

  it("is unknown for a batch-mode wrapper", () => {
    const input = wrap([
      { mode: BATCH_MODE, target: REGISTRY, callData: activateCall(VAULT_A) },
    ]);
    expect(
      activationFunctionFromTransaction({ to: OTHER_CONTRACT, input }, VAULT_A),
    ).toBe("unknown");
  });

  it("is unknown for a try-mode wrapper", () => {
    const input = wrap([
      { mode: TRY_MODE, target: REGISTRY, callData: activateCall(VAULT_A) },
    ]);
    expect(
      activationFunctionFromTransaction({ to: OTHER_CONTRACT, input }, VAULT_A),
    ).toBe("unknown");
  });

  it("is unknown for a wrapper whose single call targets another contract", () => {
    const input = wrap([
      {
        mode: SINGLE_DEFAULT_MODE,
        target: OTHER_CONTRACT,
        callData: activateCall(VAULT_A),
      },
    ]);
    expect(
      activationFunctionFromTransaction({ to: OTHER_CONTRACT, input }, VAULT_A),
    ).toBe("unknown");
  });

  it("resolves a wrapper carrying two single-mode registry calls by vault id, in either order", () => {
    const activateA = {
      mode: SINGLE_DEFAULT_MODE,
      target: REGISTRY,
      callData: activateCall(VAULT_A),
    };
    const redeemB = {
      mode: SINGLE_DEFAULT_MODE,
      target: REGISTRY,
      callData: activateAndRedeemCall(VAULT_B),
    };
    for (const input of [
      wrap([activateA, redeemB]),
      wrap([redeemB, activateA]),
    ]) {
      const tx = { to: OTHER_CONTRACT, input };
      expect(activationFunctionFromTransaction(tx, VAULT_A)).toBe(
        "activateVaultWithSecret",
      );
      expect(activationFunctionFromTransaction(tx, VAULT_B)).toBe(
        "activateVaultWithSecretAndRedeem",
      );
    }
  });

  it("is unknown when two single-mode registry calls name the same vault", () => {
    const input = wrap([
      {
        mode: SINGLE_DEFAULT_MODE,
        target: REGISTRY,
        callData: activateCall(VAULT_A),
      },
      {
        mode: SINGLE_DEFAULT_MODE,
        target: REGISTRY,
        callData: activateAndRedeemCall(VAULT_A),
      },
    ]);
    expect(
      activationFunctionFromTransaction({ to: OTHER_CONTRACT, input }, VAULT_A),
    ).toBe("unknown");
  });

  it("is unknown for malformed wrapper calldata", () => {
    const whole = wrap([
      {
        mode: SINGLE_DEFAULT_MODE,
        target: REGISTRY,
        callData: activateCall(VAULT_A),
      },
    ]);
    // Selector plus one word: the selector matches, the body is truncated.
    const input = slice(whole, 0, 36);
    expect(
      activationFunctionFromTransaction({ to: OTHER_CONTRACT, input }, VAULT_A),
    ).toBe("unknown");
  });

  it("is unknown for a transaction with no recipient", () => {
    const tx = { to: null, input: activateCall(VAULT_A) };
    expect(activationFunctionFromTransaction(tx, VAULT_A)).toBe("unknown");
  });
});

describe("classifyActivationRedeem", () => {
  it("is null without the registry's PeginActivated for the vault", () => {
    expect(classify(redeemPair(VAULT_A, 0))).toBeNull();
  });

  it("is null when the receipt shows no redeem for the vault", () => {
    expect(classify([peginActivatedLog(VAULT_A, 0)])).toBeNull();
  });

  it("is null when only one VaultClaimableBy names the vault", () => {
    const logs = [
      peginActivatedLog(VAULT_A, 0),
      vaultClaimableByLog(VAULT_A, VP_KEY, 1),
    ];
    expect(classify(logs)).toBeNull();
  });

  it("is null when the redeem pair is for a different vault in the same receipt", () => {
    const logs = [
      peginActivatedLog(VAULT_A, 0),
      peginActivatedLog(VAULT_B, 1),
      ...redeemPair(VAULT_B, 2),
    ];
    expect(classify(logs)).toBeNull();
  });

  it("is null when the adapter added the vault as collateral in the same receipt", () => {
    const collateralAddedLog = makeLog(
      AAVE_ADAPTER,
      3,
      encodeEventTopics({
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
        args: { positionAccount: DEPOSITOR, vaultId: VAULT_A },
      }),
      "0x",
    );
    const logs = [
      peginActivatedLog(VAULT_A, 0),
      ...redeemPair(VAULT_A, 1),
      collateralAddedLog,
    ];
    expect(classify(logs)).toBeNull();
  });

  it("is cap_exceeded for a redeem with no ActivationFailed when the gate existed at the receipt and the application is the Aave adapter", () => {
    const logs = [peginActivatedLog(VAULT_A, 0), ...redeemPair(VAULT_A, 1)];
    expect(classify(logs)).toEqual({ kind: "cap_exceeded" });
  });

  it("is unknown for the same receipt when the gate did not exist at the receipt", () => {
    const logs = [peginActivatedLog(VAULT_A, 0), ...redeemPair(VAULT_A, 1)];
    expect(classify(logs, { gatePresentAtReceipt: false })).toEqual({
      kind: "unknown",
    });
  });

  it("is unknown for the same receipt when the application is not the Aave adapter", () => {
    const logs = [peginActivatedLog(VAULT_A, 0), ...redeemPair(VAULT_A, 1)];
    expect(classify(logs, { capInferenceAllowed: false })).toEqual({
      kind: "unknown",
    });
  });

  it("is unknown when the called function cannot be read", () => {
    const logs = [peginActivatedLog(VAULT_A, 0), ...redeemPair(VAULT_A, 1)];
    expect(classify(logs, { calledFunction: "unknown" })).toEqual({
      kind: "unknown",
    });
  });

  it("is app_failed_without_reason for ActivationFailed with empty data", () => {
    expect(classify(failedRedeemLogs("0x"))).toEqual({
      kind: "app_failed_without_reason",
    });
  });

  it("is app_rejected naming the application error", () => {
    // AaveAdapter.activateVault's own revert (AaveAdapter.sol:149 @102e78c5).
    const data = encodeErrorResult({
      abi: VAULT_ERROR_ABI,
      errorName: "InvalidPositionSizes",
    });
    expect(classify(failedRedeemLogs(data))).toEqual({
      kind: "app_rejected",
      errorName: "InvalidPositionSizes",
    });
  });

  it("is app_rejected with no name for a Solidity Error(string) payload", () => {
    const data = encodeErrorResult({
      abi: SOLIDITY_BUILTIN_ERRORS_ABI,
      errorName: "Error",
      args: ["application failed"],
    });
    expect(classify(failedRedeemLogs(data))).toEqual({
      kind: "app_rejected",
      errorName: null,
    });
  });

  it("is app_rejected with no name for a Solidity Panic(uint256) payload", () => {
    const data = encodeErrorResult({
      abi: SOLIDITY_BUILTIN_ERRORS_ABI,
      errorName: "Panic",
      args: [0x11n],
    });
    expect(classify(failedRedeemLogs(data))).toEqual({
      kind: "app_rejected",
      errorName: null,
    });
  });

  it("is app_rejected with no name for a selector the manifest does not know", () => {
    expect(classify(failedRedeemLogs("0xdeadbeef"))).toEqual({
      kind: "app_rejected",
      errorName: null,
    });
  });

  it("is app_rejected with no name for truncated data", () => {
    expect(classify(failedRedeemLogs(TRUNCATED_ERROR_STRING))).toEqual({
      kind: "app_rejected",
      errorName: null,
    });
  });

  it("attributes ActivationFailed by log adjacency when two vaults were activated in one receipt", () => {
    const invalidPositionSizes = encodeErrorResult({
      abi: VAULT_ERROR_ABI,
      errorName: "InvalidPositionSizes",
    });
    const aFailedFirst = [
      peginActivatedLog(VAULT_A, 0),
      ...redeemPair(VAULT_A, 1),
      activationFailedLog(invalidPositionSizes, 3),
      peginActivatedLog(VAULT_B, 4),
      ...redeemPair(VAULT_B, 5),
    ];
    expect(classify(aFailedFirst, { vaultId: VAULT_A })).toEqual({
      kind: "app_rejected",
      errorName: "InvalidPositionSizes",
    });
    expect(classify(aFailedFirst, { vaultId: VAULT_B })).toEqual({
      kind: "cap_exceeded",
    });

    const bFailedLast = [
      peginActivatedLog(VAULT_A, 0),
      ...redeemPair(VAULT_A, 1),
      peginActivatedLog(VAULT_B, 3),
      ...redeemPair(VAULT_B, 4),
      activationFailedLog("0x", 6),
    ];
    expect(classify(bFailedLast, { vaultId: VAULT_A })).toEqual({
      kind: "cap_exceeded",
    });
    expect(classify(bFailedLast, { vaultId: VAULT_B })).toEqual({
      kind: "app_failed_without_reason",
    });
  });

  it("is unknown when the adjacent ActivationFailed log cannot be decoded", () => {
    const undecodableFailure = makeLog(
      REGISTRY,
      3,
      encodeEventTopics({
        abi: BTCVaultRegistryABI,
        eventName: "ActivationFailed",
      }),
      "0x",
    );
    const logs = [
      peginActivatedLog(VAULT_A, 0),
      ...redeemPair(VAULT_A, 1),
      undecodableFailure,
    ];
    expect(classify(logs)).toEqual({ kind: "unknown" });
  });

  it("reads the redeem pair by logIndex when the logs arrive reversed", () => {
    const logs = failedRedeemLogs("0x").reverse();
    expect(classify(logs)).toEqual({ kind: "app_failed_without_reason" });
  });

  it("counts a duplicated claimable log once", () => {
    const logs = failedRedeemLogs("0x");
    expect(classify([...logs, logs[1]])).toEqual({
      kind: "app_failed_without_reason",
    });
  });

  it("is unknown when two different registry logs share a log index", () => {
    const activationAndPair = [
      peginActivatedLog(VAULT_A, 0),
      ...redeemPair(VAULT_A, 1),
    ];
    const conflicting = peginActivatedLog(VAULT_B, 3);
    const failure = activationFailedLog("0x", 3);
    expect(classify([...activationAndPair, conflicting, failure])).toEqual({
      kind: "unknown",
    });
    expect(classify([...activationAndPair, failure, conflicting])).toEqual({
      kind: "unknown",
    });
  });

  it("classifies normally when a log is repeated identically", () => {
    const logs = failedRedeemLogs("0x");
    expect(classify([...logs, activationFailedLog("0x", 3)])).toEqual({
      kind: "app_failed_without_reason",
    });
  });

  it("is null when a keeper's single claimable log is duplicated", () => {
    const keeperClaimable = vaultClaimableByLog(VAULT_A, VP_KEY, 1);
    const logs = [
      peginActivatedLog(VAULT_A, 0),
      keeperClaimable,
      keeperClaimable,
    ];
    expect(classify(logs)).toBeNull();
  });

  it("classifies each vault of a shuffled two-vault receipt as in emission order", () => {
    const invalidPositionSizes = encodeErrorResult({
      abi: VAULT_ERROR_ABI,
      errorName: "InvalidPositionSizes",
    });
    const [aActivated, aVp, aDepositor, aFailed, bActivated, bVp, bDepositor] =
      [
        peginActivatedLog(VAULT_A, 0),
        ...redeemPair(VAULT_A, 1),
        activationFailedLog(invalidPositionSizes, 3),
        peginActivatedLog(VAULT_B, 4),
        ...redeemPair(VAULT_B, 5),
      ];
    const shuffled = [
      bDepositor,
      aFailed,
      aVp,
      bActivated,
      aDepositor,
      bVp,
      aActivated,
    ];
    expect(classify(shuffled, { vaultId: VAULT_A })).toEqual({
      kind: "app_rejected",
      errorName: "InvalidPositionSizes",
    });
    expect(classify(shuffled, { vaultId: VAULT_B })).toEqual({
      kind: "cap_exceeded",
    });
  });

  it("is unchanged by another contract's log between the activation and the redeem pair", () => {
    // Stands in for CapPolicy's release-scheduled log (RedeemLogic.sol:79 @102e78c5).
    const capPolicyLog = makeLog(
      OTHER_CONTRACT,
      1,
      [`0x${"55".repeat(32)}`],
      "0x",
    );
    const failure = [
      peginActivatedLog(VAULT_A, 0),
      capPolicyLog,
      ...redeemPair(VAULT_A, 2),
      activationFailedLog("0x", 4),
    ];
    expect(classify(failure)).toEqual({ kind: "app_failed_without_reason" });

    const capShape = [
      peginActivatedLog(VAULT_A, 0),
      capPolicyLog,
      ...redeemPair(VAULT_A, 2),
    ];
    expect(classify(capShape)).toEqual({ kind: "cap_exceeded" });
  });

  it("is depositor_redeemed for the escape hatch", () => {
    const logs = [peginActivatedLog(VAULT_A, 0), ...redeemPair(VAULT_A, 1)];
    expect(
      classify(logs, { calledFunction: "activateVaultWithSecretAndRedeem" }),
    ).toEqual({ kind: "depositor_redeemed" });
  });

  it("has no sentence for unknown and one sentence for every other kind", () => {
    const copy = COPY.vaults.redeemReason;
    expect(activationRedeemReasonText({ kind: "unknown" })).toBeNull();
    expect(activationRedeemReasonText({ kind: "cap_exceeded" })).toBe(
      copy.capExceeded,
    );
    expect(
      activationRedeemReasonText({ kind: "app_failed_without_reason" }),
    ).toBe(copy.appFailedWithoutReason);
    expect(
      activationRedeemReasonText({
        kind: "app_rejected",
        errorName: "InvalidPositionSizes",
      }),
    ).toBe(copy.appRejected("InvalidPositionSizes"));
    expect(
      activationRedeemReasonText({ kind: "app_rejected", errorName: null }),
    ).toBe(copy.appRejected(null));
    expect(activationRedeemReasonText({ kind: "depositor_redeemed" })).toBe(
      copy.depositorRedeemed,
    );
  });
});

describe("isCapInferenceAllowed", () => {
  it("is true for the Aave adapter address in any case", () => {
    expect(isCapInferenceAllowed(AAVE_ADAPTER)).toBe(true);
    expect(isCapInferenceAllowed(AAVE_ADAPTER.toLowerCase())).toBe(true);
    expect(
      isCapInferenceAllowed(`0x${AAVE_ADAPTER.slice(2).toUpperCase()}`),
    ).toBe(true);
  });

  it("is false for another address and for undefined", () => {
    expect(isCapInferenceAllowed(OTHER_CONTRACT)).toBe(false);
    expect(isCapInferenceAllowed(undefined)).toBe(false);
  });
});
