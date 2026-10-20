/**
 * Why the registry redeemed a vault during its activation, read from the mined
 * transaction and its receipt. Pure: no network, no logging.
 */

import {
  BTCVaultRegistryABI,
  VAULT_ERROR_ABI,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  getAbiItem,
  hexToBytes,
  isAddressEqual,
  parseEventLogs,
  slice,
  toEventSelector,
  toFunctionSelector,
  type Address,
  type Hex,
  type Log,
} from "viem";

import { CONTRACTS } from "@/config/contracts";
import { COPY } from "@/copy";

import { logsAddCollateral } from "./activationGasLimit";

export type ActivationFunction =
  | "activateVaultWithSecret"
  | "activateVaultWithSecretAndRedeem"
  | "unknown";

export type ActivationRedeemReason =
  | { kind: "app_rejected"; errorName: string | null }
  // ActivationFailed with empty data; most likely out of gas, not provable.
  | { kind: "app_failed_without_reason" }
  // CapPolicy checks usage + this vault's amount against the app total and the per-address limit.
  | { kind: "cap_exceeded" }
  | { kind: "depositor_redeemed" }
  | { kind: "unknown" };

// ERC-7579 single-call execution calldata is target (20 bytes) ++ value (32 bytes) ++ callData
// (erc7579-implementation@16138d1a src/lib/ExecutionLib.sol:64-72); a function selector is 4 bytes.
const EXECUTION_TARGET_BYTES = 20;
const EXECUTION_VALUE_BYTES = 32;
const SELECTOR_BYTES = 4;

// ERC-7579 mode: byte 0 is the call type, byte 1 the exec type (erc7579-implementation@16138d1a src/lib/ModeLib.sol).
const MODE_CALLTYPE_BYTE = 0;
const MODE_EXECTYPE_BYTE = 1;
// CALLTYPE_SINGLE (ModeLib.sol:66) and EXECTYPE_DEFAULT (ModeLib.sol:77); try mode can swallow the inner failure.
const CALLTYPE_SINGLE = 0x00;
const EXECTYPE_DEFAULT = 0x00;

// MetaMask/delegation-framework@v1.3.0 src/interfaces/IDelegationManager.sol:77-82 (ModeCode is bytes32).
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

const REDEEM_DELEGATIONS_SELECTOR = toFunctionSelector(
  getAbiItem({ abi: REDEEM_DELEGATIONS_ABI, name: "redeemDelegations" }),
);

// viem appends Solidity's Error(string) and Panic(uint256) to every error decode
// (viem 2.38.2 utils/abi/decodeErrorResult.ts:73); neither names an application error.
const SOLIDITY_BUILTIN_ERROR_NAMES = new Set(["Error", "Panic"]);

function sameVaultId(a: Hex, b: Hex): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The activation function a registry call makes for `vaultId`; `unknown` for anything else. */
function registryActivationFor(
  callData: Hex,
  vaultId: Hex,
): ActivationFunction {
  try {
    const call = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: callData,
    });
    if (
      (call.functionName === "activateVaultWithSecret" ||
        call.functionName === "activateVaultWithSecretAndRedeem") &&
      sameVaultId(call.args[0], vaultId)
    ) {
      return call.functionName;
    }
    return "unknown";
  } catch {
    // Calldata that does not decode against the registry ABI names neither function.
    return "unknown";
  }
}

/** The one single-mode, revert-on-failure registry activation of `vaultId` in a `redeemDelegations` call. */
function wrappedActivationFor(input: Hex, vaultId: Hex): ActivationFunction {
  const {
    args: [, modes, executionCallDatas],
  } = decodeFunctionData({ abi: REDEEM_DELEGATIONS_ABI, data: input });
  const matches = modes.flatMap((mode, index) => {
    const modeBytes = hexToBytes(mode);
    if (
      modeBytes[MODE_CALLTYPE_BYTE] !== CALLTYPE_SINGLE ||
      modeBytes[MODE_EXECTYPE_BYTE] !== EXECTYPE_DEFAULT
    ) {
      return [];
    }
    const execution = executionCallDatas[index];
    const target = slice(execution, 0, EXECUTION_TARGET_BYTES);
    if (!isAddressEqual(target, CONTRACTS.BTC_VAULT_REGISTRY)) return [];
    const callData = slice(
      execution,
      EXECUTION_TARGET_BYTES + EXECUTION_VALUE_BYTES,
    );
    const activation = registryActivationFor(callData, vaultId);
    return activation === "unknown" ? [] : [activation];
  });
  return matches.length === 1 ? matches[0] : "unknown";
}

/** The registry function this mined tx called for `vaultId`, through a MetaMask delegation wrapper if needed. */
export function activationFunctionFromTransaction(
  tx: { to: Address | null; input: Hex },
  vaultId: Hex,
): ActivationFunction {
  if (tx.to === null) return "unknown";
  if (isAddressEqual(tx.to, CONTRACTS.BTC_VAULT_REGISTRY)) {
    return registryActivationFor(tx.input, vaultId);
  }
  try {
    const selector = slice(tx.input, 0, SELECTOR_BYTES);
    if (selector.toLowerCase() !== REDEEM_DELEGATIONS_SELECTOR)
      return "unknown";
    return wrappedActivationFor(tx.input, vaultId);
  } catch {
    // Truncated or malformed wrapper calldata is not evidence of either function.
    return "unknown";
  }
}

/** The application error named by `ActivationFailed` data, or null when it names none. */
function applicationErrorName(revertData: Hex): string | null {
  try {
    const { errorName } = decodeErrorResult({
      abi: VAULT_ERROR_ABI,
      data: revertData,
    });
    return SOLIDITY_BUILTIN_ERROR_NAMES.has(errorName) ? null : errorName;
  } catch {
    // An unknown selector or truncated data names no application error.
    return null;
  }
}

const ACTIVATION_FAILED_TOPIC = toEventSelector(
  getAbiItem({ abi: BTCVaultRegistryABI, name: "ActivationFailed" }),
);

type IndexedLog = Log & { logIndex: number };

/** Two logs carry the same topics and data. */
function sameLogContent(a: Log, b: Log): boolean {
  return (
    a.data.toLowerCase() === b.data.toLowerCase() &&
    a.topics.length === b.topics.length &&
    a.topics.every(
      (topic, i) => topic.toLowerCase() === b.topics[i]?.toLowerCase(),
    )
  );
}

/** The registry's logs in emission order, one per `logIndex`; `ambiguous` when one index holds two different logs. */
function registryLogsInOrder(logs: Log[]): IndexedLog[] | "ambiguous" {
  const byIndex = new Map<number, IndexedLog>();
  for (const log of logs) {
    // parseEventLogs does not filter by address; a mined receipt's logs always carry a logIndex.
    if (
      log.logIndex === null ||
      !isAddressEqual(log.address, CONTRACTS.BTC_VAULT_REGISTRY)
    ) {
      continue;
    }
    const seen = byIndex.get(log.logIndex);
    if (seen === undefined) {
      byIndex.set(log.logIndex, { ...log, logIndex: log.logIndex });
    } else if (!sameLogContent(seen, log)) {
      // A valid receipt never has two logs at one index; conflicting input must not reach a sentence.
      return "ambiguous";
    }
  }
  return [...byIndex.values()].sort((a, b) => a.logIndex - b.logIndex);
}

/** The reason an `ActivationFailed` log gives; unknown when its event data does not decode. */
function activationFailedReason(log: IndexedLog): ActivationRedeemReason {
  let revertData: Hex;
  try {
    revertData = decodeEventLog({
      abi: BTCVaultRegistryABI,
      eventName: "ActivationFailed",
      topics: log.topics,
      data: log.data,
    }).args.data;
  } catch {
    // The event is there but unreadable, so it is neither absent nor a known failure.
    return { kind: "unknown" };
  }
  if (revertData === "0x") return { kind: "app_failed_without_reason" };
  return { kind: "app_rejected", errorName: applicationErrorName(revertData) };
}

/** Why the registry redeemed `vaultId` in this receipt, or null when the receipt shows no activation-and-redeem of it. */
export function classifyActivationRedeem(input: {
  logs: Log[];
  vaultId: Hex;
  calledFunction: ActivationFunction;
  /** The registry had the activation gas gate (would emit `ActivationFailed`) at this receipt's block; false when unknown. */
  gatePresentAtReceipt: boolean;
  /** True only when the vault's application is the Aave adapter, whose `activateVault` never redeems. */
  capInferenceAllowed: boolean;
}): ActivationRedeemReason | null {
  const { vaultId } = input;
  // The adapter took the vault as collateral, so a later redeem in this tx was a withdraw, not activation.
  if (logsAddCollateral(input.logs, vaultId)) return null;
  const registryLogs = registryLogsInOrder(input.logs);
  if (registryLogs === "ambiguous") return { kind: "unknown" };

  // Every activation path emits PeginActivated (BTCVaultRegistry.sol:1200 @102e78c5).
  const activated = parseEventLogs({
    abi: BTCVaultRegistryABI,
    logs: registryLogs,
    eventName: "PeginActivated",
  }).some((log) => sameVaultId(log.args.vaultId, vaultId));
  if (!activated) return null;

  // The depositor redeem emits the VP key, then the depositor key (RedeemLogic.sol:82-83 @102e78c5).
  const claimable = parseEventLogs({
    abi: BTCVaultRegistryABI,
    logs: registryLogs,
    eventName: "VaultClaimableBy",
  }).filter((log) => sameVaultId(log.args.vaultId, vaultId));
  if (claimable.length < 2) return null;

  // ActivationFailed is emitted right after the redeem helper (BTCVaultRegistry.sol:759-763 @102e78c5).
  const nextLog = registryLogs.find(
    (log) => log.logIndex === claimable[1].logIndex + 1,
  );
  if (nextLog?.topics[0]?.toLowerCase() === ACTIVATION_FAILED_TOPIC) {
    return activationFailedReason(nextLog);
  }

  if (input.calledFunction === "activateVaultWithSecretAndRedeem") {
    return { kind: "depositor_redeemed" };
  }
  if (input.calledFunction === "unknown") return { kind: "unknown" };

  // An app could redeem in its callback (BTCVaultRegistry.sol:1116); Aave's activateVault never does (AaveAdapter.sol:127-166).
  return input.capInferenceAllowed && input.gatePresentAtReceipt
    ? { kind: "cap_exceeded" }
    : { kind: "unknown" };
}

/** True when `applicationEntryPoint` is this dApp's Aave adapter (`CONTRACTS.AAVE_ADAPTER`); false for undefined or anything else. */
export function isCapInferenceAllowed(
  applicationEntryPoint: string | undefined,
): boolean {
  return (
    applicationEntryPoint !== undefined &&
    applicationEntryPoint.toLowerCase() === CONTRACTS.AAVE_ADAPTER.toLowerCase()
  );
}

/** The sentence the UI appends for a reason; null for `unknown`. */
export function activationRedeemReasonText(
  reason: ActivationRedeemReason,
): string | null {
  const copy = COPY.vaults.redeemReason;
  switch (reason.kind) {
    case "app_rejected":
      return copy.appRejected(reason.errorName);
    case "app_failed_without_reason":
      return copy.appFailedWithoutReason;
    case "cap_exceeded":
      return copy.capExceeded;
    case "depositor_redeemed":
      return copy.depositorRedeemed;
    case "unknown":
      return null;
  }
}
