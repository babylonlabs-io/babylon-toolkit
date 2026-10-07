/**
 * Vault activation service — calls activateVaultWithSecret on the contract.
 *
 * After the depositor broadcasts the Pre-PegIn tx and the vault reaches
 * Verified status, the depositor reveals the HTLC secret on Ethereum to
 * move the vault from Verified -> Active. The VP then uses the revealed
 * secret to claim the HTLC on Bitcoin.
 *
 * Protocol logic lives in the SDK (`activateVault`); this adapter wires
 * the vault's contract-write transport (`executeWrite`) into the SDK's
 * injected-writer interface so viem error decoding, simulation, and
 * receipt handling stay in the app tier.
 */

import {
  BTCVaultRegistryABI,
  canonicalizeBtcPubkey,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  activateVault,
  activateVaultAndRedeem,
  claimExpiredVault,
  type EthContractWriter,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  isAddressEqual,
  parseEventLogs,
  type Hex,
  type WalletClient,
} from "viem";

import {
  executeWrite,
  type TransactionResult,
} from "@/clients/eth-contract/transactionFactory";
import { CONTRACTS } from "@/config/contracts";
import { getETHChain } from "@/config/network";

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

export interface ActivateVaultParams {
  /** Vault ID (bytes32, 0x-prefixed) */
  vaultId: Hex;
  /** HTLC secret preimage (bytes32, 0x-prefixed) */
  secret: Hex;
  /**
   * Expected hashlock (bytes32, 0x-prefixed). The SDK re-checks
   * `sha256(secret) === hashlock` immediately before assembling calldata —
   * last defense before the secret would enter `simulateContract`.
   */
  hashlock: Hex;
  /** Ethereum wallet client for signing the transaction */
  walletClient: WalletClient;
  /** Abort signal — checked before issuing the contract write */
  signal?: AbortSignal;
}

export async function activateVaultWithSecret(
  params: ActivateVaultParams,
): Promise<TransactionResult> {
  const { vaultId, secret, hashlock, walletClient, signal } = params;

  signal?.throwIfAborted();

  const writer: EthContractWriter<TransactionResult> = (call) =>
    executeWrite({
      walletClient,
      chain: getETHChain(),
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      errorContext: "vault activation",
    });

  return activateVault<TransactionResult>({
    btcVaultRegistryAddress: CONTRACTS.BTC_VAULT_REGISTRY,
    vaultId,
    secret,
    hashlock,
    // Vault's activation flow has no metadata payload today; pass the
    // contract's "empty bytes" sentinel explicitly rather than relying on
    // an SDK-side default, per the no-fallback rule on tx-creation paths.
    activationMetadata: "0x",
    writeContract: writer,
  });
}

/**
 * Depositor escape hatch — calls activateVaultWithSecretAndRedeem on the
 * contract: reveals the HTLC secret and immediately redeems the vault for
 * the depositor without any application activation. The registry never
 * delegates into the application adapter on this path, so it stays usable
 * while the adapter is paused or its activation reverts; the vault provider
 * then pays the BTC out to the depositor's committed payout address.
 *
 * The gate pre-reads the protocol pause (`isActivateAndRedeemBlocked`). The
 * registry preconditions it cannot pre-read — the activation deadline, the
 * Verified status — are checked by `executeWrite`'s mandatory
 * pre-broadcast simulation: on a simulated revert nothing is signed or
 * sent, so a precondition already failing at submission time never
 * publishes the secret. The residual is the simulate-to-mine window: a
 * precondition that flips after a passing simulation (or a lagging RPC
 * replica) still mines a reverting transaction with the secret in public
 * calldata. That window is inherent — any pre-check is point-in-time in
 * exactly the same way.
 */
export async function activateVaultWithSecretAndRedeem(
  params: ActivateVaultParams,
): Promise<TransactionResult> {
  const { vaultId, secret, hashlock, walletClient, signal } = params;

  signal?.throwIfAborted();

  const writer: EthContractWriter<TransactionResult> = (call) =>
    executeWrite({
      walletClient,
      chain: getETHChain(),
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      errorContext: "vault activate-and-redeem",
    });

  return activateVaultAndRedeem<TransactionResult>({
    btcVaultRegistryAddress: CONTRACTS.BTC_VAULT_REGISTRY,
    vaultId,
    secret,
    hashlock,
    writeContract: writer,
  });
}

/**
 * Expired-vault exit — calls claimExpiredVault on the contract: reveals the
 * HTLC secret for a vault that expired after verification, moving it to
 * Redeemed so the vault provider claims the BTC the PegIn swept and pays it
 * to the depositor's committed payout address.
 *
 * The caller must have proven, immediately before, that the PegIn spent the
 * HTLC: revealing the secret while the HTLC is unspent lets anyone broadcast
 * the PegIn ahead of the depositor's own refund. The hashlock is required —
 * the SDK re-checks `sha256(secret) === hashlock` before calldata exists.
 *
 * The registry checks the Expired status, `verifiedAt`, the grace window and
 * the secret; `executeWrite`'s mandatory pre-broadcast simulation refuses to
 * sign when any of them already fails at submission time.
 */
export async function claimExpiredVaultWithSecret(
  params: ActivateVaultParams,
): Promise<TransactionResult> {
  const { vaultId, secret, hashlock, walletClient, signal } = params;

  signal?.throwIfAborted();

  const writer: EthContractWriter<TransactionResult> = (call) =>
    executeWrite({
      walletClient,
      chain: getETHChain(),
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      errorContext: "expired vault redeem",
    });

  return claimExpiredVault<TransactionResult>({
    btcVaultRegistryAddress: CONTRACTS.BTC_VAULT_REGISTRY,
    vaultId,
    secret,
    hashlock,
    writeContract: writer,
  });
}

/**
 * True when the activation receipt carries the Aave adapter's
 * `CollateralAdded` log for this vault. The registry can confirm an
 * activation and still add no collateral (for example, it redeems the vault
 * when a cap is exceeded), so a confirmed receipt alone does not prove it.
 * A vault activated into another application never carries this log either,
 * so its absence does not prove a redemption: see
 * {@link activationRedeemedForDepositor}.
 */
export function activationAddedCollateral(
  { receipt }: TransactionResult,
  vaultId: Hex,
): boolean {
  return parseEventLogs({
    abi: COLLATERAL_ADDED_EVENT_ABI,
    logs: receipt.logs,
    eventName: "CollateralAdded",
  }).some(
    (log) =>
      isAddressEqual(log.address, CONTRACTS.AAVE_ADAPTER) &&
      log.args.vaultId.toLowerCase() === vaultId.toLowerCase(),
  );
}

/**
 * True when the activation receipt carries the registry's `VaultClaimableBy`
 * log making this vault claimable by the depositor's own BTC key: the
 * activation landed, but the registry redeemed the vault for the depositor
 * instead of handing it to the application.
 *
 * Positive evidence, not an inference from a missing log. Both depositor
 * redeem paths emit one log for the vault provider's key and one for
 * `vBasic.depositorBtcPubKey`:
 * `RedeemLogic.redeemFreshlyActivatedForDepositor`
 * (vault-contracts-aave-v4@06f46477:src/protocol/lib/RedeemLogic.sol:82-83),
 * which an activation reaches when the application cap is exceeded or the
 * application's `activateVault` reverts
 * (vault-contracts-aave-v4@06f46477:src/protocol/BTCVaultRegistry.sol:742-743,
 * vault-contracts-aave-v4@06f46477:src/protocol/BTCVaultRegistry.sol:754-759)
 * and the escape hatch always reaches
 * (vault-contracts-aave-v4@06f46477:src/protocol/BTCVaultRegistry.sol:771-773);
 * and `RedeemLogic.redeemForDepositor`
 * (vault-contracts-aave-v4@06f46477:src/protocol/lib/RedeemLogic.sol:42-43).
 *
 * The claimer key is what makes it the depositor's, not the vault id alone.
 * `redeemVaultForAVK` is not `nonReentrant`
 * (vault-contracts-aave-v4@06f46477:src/protocol/BTCVaultRegistry.sol:1140),
 * so an application whose `activateVault` calls back into it emits a
 * `VaultClaimableBy` for this vault inside the activation transaction, but
 * only for the keeper's key
 * (vault-contracts-aave-v4@06f46477:src/protocol/lib/RedeemLogic.sol:63): the
 * BTC goes to the keeper, not back to the depositor.
 *
 * RedeemLogic is a linked library run by DELEGATECALL, so the log's address is
 * the registry. Event signature:
 * vault-contracts-aave-v4@06f46477:src/protocol/lib/types/Events.sol:41-50,
 * matched by the SDK registry ABI.
 *
 * @param depositorBtcPubKey - The vault's depositor BTC key as the registry
 *   records it (x-only, `0x` optional). Compared in canonical form, since the
 *   log's indexed `claimerPK` is the same bytes32 the registry stores.
 */
export function activationRedeemedForDepositor(
  { receipt }: TransactionResult,
  vaultId: Hex,
  depositorBtcPubKey: string,
): boolean {
  const expectedClaimer = canonicalizeBtcPubkey(depositorBtcPubKey);
  return parseEventLogs({
    abi: BTCVaultRegistryABI,
    logs: receipt.logs,
    eventName: "VaultClaimableBy",
  }).some(
    (log) =>
      isAddressEqual(log.address, CONTRACTS.BTC_VAULT_REGISTRY) &&
      log.args.vaultId.toLowerCase() === vaultId.toLowerCase() &&
      canonicalizeBtcPubkey(log.args.claimerPK) === expectedClaimer,
  );
}
