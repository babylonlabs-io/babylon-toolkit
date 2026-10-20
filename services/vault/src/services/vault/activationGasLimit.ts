// Gas limit for `activateVaultWithSecret`, searched with `eth_simulateV1`: the estimate can land on the registry's
// redeem-on-failure path (vault-contracts-aave-v4@102e78c5:src/protocol/BTCVaultRegistry.sol:718-765).

import {
  BTCVaultRegistryABI,
  canonicalizeBtcPubkey,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { EthContractWriteCall } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  BaseError,
  isAddressEqual,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  parseEventLogs,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";

import { CONTRACTS } from "@/config/contracts";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import {
  ACTIVATION_CHECK_UNSUPPORTED_REASON,
  ActivationWouldRedeemError,
  ContractError,
  ErrorCode,
  mapViemErrorToContractError,
  tagSimulationPhase,
} from "@/utils/errors";

/**
 * EIP-7825's transaction gas cap (go-ethereum@9e800218:params/protocol_params.go:31),
 * the most a transaction may be given on Osaka chains. Amsterdam (EIP-8037;
 * Sepolia since 2026-10-06) applies it to execution gas only, and an
 * activation needs about 3M, so the search starts here on either chain.
 */
export const GAS_SEARCH_CEILING = 16_777_216n;

/**
 * The search stops once the lowest activating limit is within this share
 * above the highest failing one, as go-ethereum's estimator does
 * (go-ethereum@9e800218:internal/ethapi/api.go:54, `estimateGasErrorRatio = 0.015`).
 */
const SEARCH_ERROR_RATIO_PERMILLE = 15n;
const PERMILLE = 1000n;

/**
 * Headroom over the lowest activating limit: the buffer MetaMask adds to a
 * node estimate (MetaMask/core@a7be4d8f:packages/transaction-controller/src/utils/gas.ts:60,
 * `DEFAULT_GAS_MULTIPLIER = 1.5`). A limit the app sets bypasses that buffer
 * (gas.ts:513-516), so it is applied here.
 */
const GAS_LIMIT_HEADROOM_NUMERATOR = 3n;
const GAS_LIMIT_HEADROOM_DENOMINATOR = 2n;

/** The Aave adapter event that records a vault as collateral. */
const COLLATERAL_ADDED_EVENT_ABI = [
  {
    type: "event",
    name: "CollateralAdded",
    inputs: [
      { indexed: true, name: "positionAccount", type: "address" },
      { indexed: true, name: "vaultId", type: "bytes32" },
    ],
  },
] as const;

/** True when `logs` carry the registry's `PeginActivated` for this vault. */
function logsCarryPeginActivated(logs: Log[], vaultId: Hex): boolean {
  return parseEventLogs({
    abi: BTCVaultRegistryABI,
    logs,
    eventName: "PeginActivated",
  }).some(
    (log) =>
      isAddressEqual(log.address, CONTRACTS.BTC_VAULT_REGISTRY) &&
      log.args.vaultId.toLowerCase() === vaultId.toLowerCase(),
  );
}

/**
 * True when `logs` carry the Aave adapter's `CollateralAdded` for this vault.
 * The registry can confirm an activation and still add no collateral (for
 * example, it redeems the vault when a cap is exceeded), so the registry's
 * own logs do not prove it.
 */
export function logsAddCollateral(logs: Log[], vaultId: Hex): boolean {
  return parseEventLogs({
    abi: COLLATERAL_ADDED_EVENT_ABI,
    logs,
    eventName: "CollateralAdded",
  }).some(
    (log) =>
      isAddressEqual(log.address, CONTRACTS.AAVE_ADAPTER) &&
      log.args.vaultId.toLowerCase() === vaultId.toLowerCase(),
  );
}

/**
 * True when `logs` carry the registry's `VaultClaimableBy` making this vault
 * claimable by the depositor's own key: the registry redeemed it for the
 * depositor instead of handing it to its application. Positive evidence, so
 * it holds for any application; the contract trail is documented on
 * `activationRedeemedForDepositor`.
 */
export function logsRedeemForDepositor(
  logs: Log[],
  vaultId: Hex,
  depositorBtcPubKey: string,
): boolean {
  const expectedClaimer = canonicalizeBtcPubkey(depositorBtcPubKey);
  return parseEventLogs({
    abi: BTCVaultRegistryABI,
    logs,
    eventName: "VaultClaimableBy",
  }).some(
    (log) =>
      isAddressEqual(log.address, CONTRACTS.BTC_VAULT_REGISTRY) &&
      log.args.vaultId.toLowerCase() === vaultId.toLowerCase() &&
      canonicalizeBtcPubkey(log.args.claimerPK) === expectedClaimer,
  );
}

export interface ActivationSimulationParams {
  publicClient: PublicClient;
  /** The depositor, who sends the activation. */
  account: Address;
  /** The registry call the SDK assembled. */
  call: EthContractWriteCall;
  vaultId: Hex;
  /** The vault's depositor BTC key as the registry records it (x-only, `0x` optional). */
  depositorBtcPubKey: string;
  /** The registry reverts any limit at or below this (BTCVaultRegistry.sol:728 @102e78c5);
   * `null` when the deployment predates the gate. */
  minActivationGas: bigint | null;
  /** Checked before and after every simulation. */
  signal?: AbortSignal;
}

/**
 * The RPC answered `eth_simulateV1` with JSON-RPC -32601 or -32004
 * (viem 2.38.2 errors/rpc.js:64-77,181-194): it does not serve the method.
 */
function isUnsupportedMethodError(error: unknown): boolean {
  return (
    error instanceof BaseError &&
    error.walk(
      (e) =>
        e instanceof MethodNotFoundRpcError ||
        e instanceof MethodNotSupportedRpcError,
    ) !== null
  );
}

/** The RPC cannot run the check; the same endpoint answers every retry. */
function activationCheckUnsupported(cause: unknown): ContractError {
  return tagSimulationPhase(
    new ContractError(
      COPY.deposit.errors.activationCheckUnsupported,
      ErrorCode.NETWORK_ERROR,
      undefined,
      ACTIVATION_CHECK_UNSUPPORTED_REASON,
      { cause },
    ),
  );
}

/**
 * One simulated activation: the registry call's outcome and, on success, its
 * logs, which carry the registry's `PeginActivated` for the vault.
 */
type ActivationSimulation =
  | { status: "success"; gasUsed: bigint; logs: Log[] }
  | { status: "failure"; gasUsed: bigint; error: unknown };

/** One `eth_simulateV1` run of the activation at `gas` (viem `simulateBlocks`). */
async function simulateActivation(
  params: ActivationSimulationParams,
  gas: bigint,
): Promise<ActivationSimulation> {
  const { publicClient, account, call, signal } = params;
  signal?.throwIfAborted();
  const [block] = await publicClient
    .simulateBlocks({
      blocks: [
        {
          calls: [
            {
              account,
              to: call.address,
              abi: call.abi,
              functionName: call.functionName,
              args: call.args,
              gas,
            },
          ],
        },
      ],
    })
    .catch((error: unknown) => {
      if (isUnsupportedMethodError(error)) {
        throw activationCheckUnsupported(error);
      }
      throw tagSimulationPhase(
        mapViemErrorToContractError(error, "vault activation", [call.abi]),
      );
    });
  // A result that arrived after a cancellation must not reach the wallet.
  signal?.throwIfAborted();
  const result = block.calls[0];
  if (result.status === "failure") {
    return { status: "failure", gasUsed: result.gasUsed, error: result.error };
  }
  // The logs are the evidence, so a success that omits them cannot be judged
  // and must not read as an activation. viem passes an absent field through
  // (viem 2.38.2 actions/public/simulateBlocks.js:106, `call.logs?.map`;
  // typed `logs?: Log[]` in simulateBlocks.d.ts:64).
  if (result.logs === undefined) {
    throw activationCheckUnsupported(
      new Error("eth_simulateV1 returned a successful call without logs"),
    );
  }
  // Every successful run emits the registry's PeginActivated before the
  // application call, so a success without it is incomplete evidence.
  if (!logsCarryPeginActivated(result.logs, params.vaultId)) {
    throw activationCheckUnsupported(
      new Error(
        "eth_simulateV1 returned a successful call without the registry's PeginActivated log",
      ),
    );
  }
  return { status: "success", gasUsed: result.gasUsed, logs: result.logs };
}

/** True when the registry handed the vault to its application. */
function activates(
  result: ActivationSimulation,
  params: ActivationSimulationParams,
): boolean {
  return (
    result.status === "success" &&
    !logsRedeemForDepositor(
      result.logs,
      params.vaultId,
      params.depositorBtcPubKey,
    )
  );
}

/**
 * Throw unless the simulated activation handed the vault to its application:
 * a registry revert decoded, like the `eth_call` pre-flight's, and a redeem
 * for the depositor as {@link ActivationWouldRedeemError}.
 */
function assertActivates(
  result: ActivationSimulation,
  params: ActivationSimulationParams,
): void {
  if (result.status === "failure") {
    throw tagSimulationPhase(
      mapViemErrorToContractError(result.error, "vault activation", [
        params.call.abi,
      ]),
    );
  }
  if (!activates(result, params)) {
    throw new ActivationWouldRedeemError(
      COPY.deposit.errors.activationWouldRedeem,
    );
  }
}

/**
 * Pre-flight for a send: at `gas` the registry must still hand the vault to
 * its application, which an `eth_call` success cannot show. Nothing is signed
 * or sent on a throw.
 */
export async function assertActivationNotRedeemed(
  params: ActivationSimulationParams & { gas: bigint },
): Promise<void> {
  assertActivates(await simulateActivation(params, params.gas), params);
}

/**
 * Choose the gas limit for an activation, or refuse it.
 *
 * Simulates at {@link GAS_SEARCH_CEILING} first and refuses an activation the
 * registry redeems there, since no limit up to it would change that. Then
 * binary-searches the lowest limit at which the vault still reaches its
 * application, as the estimator does for the lowest non-reverting one, and
 * returns it with the headroom, capped at the ceiling. Every error but the
 * refusal and an abort is a simulation-phase `ContractError`: nothing was
 * signed or sent.
 */
export async function planActivationGasLimit(
  params: ActivationSimulationParams,
): Promise<bigint> {
  const unconstrained = await simulateActivation(params, GAS_SEARCH_CEILING);
  assertActivates(unconstrained, params);
  let probes = 1;

  // The gas an unconstrained run uses lower-bounds the limit it needs
  // (gasestimator.go:146-150). It is positive, at least the base transaction
  // cost, so the doubling below always moves.
  let lo = unconstrained.gasUsed - 1n;
  // `gasleft()` at the gate is below the limit, so a limit at the gate reverts.
  if (params.minActivationGas !== null && params.minActivationGas > lo) {
    lo = params.minActivationGas;
  }
  let hi = GAS_SEARCH_CEILING;
  while (
    lo + 1n < hi &&
    (hi - lo) * PERMILLE >= hi * SEARCH_ERROR_RATIO_PERMILLE
  ) {
    // Skewed low like the estimator (gasestimator.go:181-186): the limit is
    // usually near the gas used, not near the ceiling.
    let mid = lo + (hi - lo) / 2n;
    if (mid > lo * 2n) mid = lo * 2n;
    probes += 1;
    if (activates(await simulateActivation(params, mid), params)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const withHeadroom =
    (hi * GAS_LIMIT_HEADROOM_NUMERATOR) / GAS_LIMIT_HEADROOM_DENOMINATOR;
  const gasLimit =
    withHeadroom > GAS_SEARCH_CEILING ? GAS_SEARCH_CEILING : withHeadroom;

  logger.info("Activation gas limit taken from the activation path", {
    category: "activation",
    gasUsed: unconstrained.gasUsed.toString(),
    minActivationGas: String(params.minActivationGas),
    lowestActivatingLimit: hi.toString(),
    gasLimit: gasLimit.toString(),
    probes,
  });

  return gasLimit;
}
