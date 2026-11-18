import {
  encodeFunctionData,
  InsufficientFundsError,
  isAddress,
  isAddressEqual,
  WaitForTransactionReceiptTimeoutError,
  zeroAddress,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

import { BTCVaultRegistryABI } from "../../contracts/abis/BTCVaultRegistry.abi";
import { handleContractError } from "../../contracts/errors";
import {
  capMaxAcceptableCommissionBps,
  COMMISSION_BPS_HEADROOM,
} from "../../deposit-terms/commissionCeiling";
import { waitForTransactionReceiptSmartAware } from "../../utils/eth";
import { assertOnChainBtcPubkey } from "./onChainBtcPubkey";
import { assertPayoutScriptMatchesPopKey } from "./payout-script";
import { calculateBtcTxHash, derivePeginVaultId } from "./pegin-transaction";
import { ViemVaultRegistryReader } from "./vault-registry-reader";

/** Referral code sent with peg-in registration. Zero means no referral. */
export const NO_REFERRAL_CODE = 0;
const UINT8_MAX = 255;
/**
 * How long a registration is waited for before its outcome is reported
 * unknown. A dropped transaction must not wait forever, but a registration
 * that confirms late is not a failed one: a hardware wallet over WalletConnect
 * can take minutes from fee preparation to broadcast.
 */
const REGISTRATION_CONFIRMATION_TIMEOUT_MS = 30 * 60_000;
/**
 * One receipt wait. Between rounds the registry is read for the vaults, which
 * also confirms a registration the wallet re-sent under another hash.
 */
const REGISTRATION_RECEIPT_ROUND_MS = 60_000;
/**
 * Pause after a receipt wait that failed rather than timed out: about one
 * Ethereum block, so an RPC that keeps failing is not polled in a tight loop.
 */
const REGISTRATION_RETRY_DELAY_MS = 12_000;
/**
 * The EIP-1559 fee cap covers this multiple of the latest base fee. A full
 * block raises the base fee by 12.5%, so 2x stays includable through about six
 * full blocks in a row (1.125^6 ≈ 2.03). The depositor pays only the base fee
 * and tip actually charged, so unused headroom costs nothing. viem's default
 * of 1.2x lasted under two blocks for a registration approved on a hardware
 * wallet, which then could not be mined for five minutes.
 */
const REGISTRATION_BASE_FEE_MULTIPLIER = 2n;
/**
 * Lowest priority fee the registration offers: 0.1 gwei. A node's tip
 * suggestion can be close to zero (50,971 wei on mainnet), which puts the
 * registration behind nearly every other transaction in a block.
 */
const MIN_REGISTRATION_PRIORITY_FEE_WEI = 100_000_000n;
const EIP_7702_DELEGATION_CODE = /^0xef0100[0-9a-f]{40}$/i;

function ensureHex(value: string, label: string): Hex {
  const prefixed = value.startsWith("0x")
    ? value
    : value.startsWith("0X")
      ? `0x${value.slice(2)}`
      : `0x${value}`;
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(prefixed)) {
    throw new Error(`${label} must be non-empty, even-length hex`);
  }
  return prefixed as Hex;
}

/**
 * A failed wait round, for the console: the error's name and viem's
 * `shortMessage`. The full message is left out because viem puts the RPC URL,
 * which can carry an API key, and the request body in it.
 */
function describeRoundError(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const { shortMessage } = error as { shortMessage?: unknown };
  return typeof shortMessage === "string"
    ? `${error.name}: ${shortMessage}`
    : error.name;
}

function assertBytes32(value: Hex, label: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex value`);
  }
}

/** All-zero `bytes32` — the shape an unresolved fingerprint takes. */
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * The single validation point for `expectedFingerprint`, on both the singular
 * and batch paths.
 *
 * Zero is rejected separately from the shape check because it is a *well-formed*
 * `bytes32` that the registry can never accept — the live fingerprint is a
 * keccak256 over a domain-separated preimage — so it can only ever mean the
 * caller had no value and filled the slot. Catching it here turns a defaulted
 * field into a named error instead of an opaque on-chain revert with two
 * hashes and no hint.
 */
function assertFingerprint(value: Hex): void {
  assertBytes32(value, "expectedFingerprint");
  if (value.toLowerCase() === ZERO_BYTES32) {
    throw new Error(
      "expectedFingerprint must not be zero: the registry cannot resolve a " +
        "zero fingerprint, so this submission would always revert",
    );
  }
}

function assertHtlcVout(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT8_MAX) {
    throw new Error(`htlcVout must be a uint8, got ${value}`);
  }
}

/** A PoP prepared by a Bitcoin wallet, reusable by the ETH submit client. */
export interface PopSignature {
  btcPopSignature: Hex;
  depositorEthAddress: Address;
  /** x-only secp256k1 public key, 64 hex chars without `0x`. */
  depositorBtcPubkey: string;
}

export interface ViemPeginRegistrationClientConfig {
  ethWallet: WalletClient;
  ethChain: Chain;
  publicClient: PublicClient;
  btcVaultRegistry: Address;
  /**
   * How long to wait for the registration to confirm before rejecting with
   * viem's `WaitForTransactionReceiptTimeoutError`, which leaves the outcome
   * unknown: the registration can still confirm afterwards. A positive,
   * finite number of milliseconds; default 30 minutes. A Safe proposal waits
   * for its co-signers on its own budget.
   */
  receiptTimeoutMs?: number;
  /**
   * Refuse to register without a `quotedCommissionBps`. Set it to `true` when
   * the depositor approved deposit terms on a device: approval froze the
   * commission ceiling from the quote, so the chain-current fallback could
   * admit a commission the device would later refuse to pay out.
   *
   * Required, with no default: an omitted flag would silently pick the unsafe
   * direction for the integrator least able to probe the wallet capability.
   */
  requireQuotedCommissionBps: boolean;
}

export interface RegisterPeginOnChainParams {
  unsignedPrePeginTx: string;
  depositorSignedPeginTx: string;
  vaultProvider: Address;
  hashlock: Hex;
  depositorWotsPkHash: Hex;
  popSignature: PopSignature;
  /** Raw x-only, compressed, or uncompressed BTC pubkey from the PoP wallet. */
  depositorBtcPubkeyRaw: string;
  htlcVout: number;
  /**
   * Bitcoin output script bytes, not an address. The client verifies that the
   * script pays the proof-of-possession key before it submits the transaction.
   */
  depositorPayoutScriptPubKey: string;
  quotedCommissionBps?: number;
  /**
   * Total ETH fee (wei) shown to the depositor; registration throws if the chain now requires more.
   * Optional; when omitted the chain-current fee is sent unchecked.
   */
  quotedPeginFeeWei?: bigint;
  /**
   * `keccak256(abi.encode(...))` over the protocol state the Pre-PegIn was
   * built against — see the SDK's `pegin-fingerprint` module.
   *
   * The registry recomputes it live at inclusion and reverts with
   * `PeginFingerprintChanged` on any difference, so it must be computed from
   * the same block-pinned snapshot that shaped the Bitcoin scripts. Required,
   * with no default: a fingerprint the caller did not resolve is not a
   * fingerprint, and the registry has no way to tell the two apart.
   */
  expectedFingerprint: Hex;
}

export interface PeginRegistrationResult {
  /**
   * Hash of the registration transaction. When a receipt confirmed it, this
   * is that receipt's hash, which can differ from the hash the wallet
   * returned: a Safe's execution transaction, or a speed-up of the same call
   * that the receipt wait followed. When the registry shows every vault but no
   * receipt arrived, it is the hash the wallet returned.
   */
  ethTxHash: Hex;
  vaultId: Hex;
  peginTxHash: Hex;
}

export interface BatchPeginRegistrationItem {
  depositorSignedPeginTx: string;
  hashlock: Hex;
  htlcVout: number;
  /**
   * Bitcoin output script bytes, not an address. The client verifies that the
   * script pays the proof-of-possession key before it submits the transaction.
   */
  depositorPayoutScriptPubKey: string;
  depositorWotsPkHash: Hex;
}

export interface RegisterPeginBatchOnChainParams {
  vaultProvider: Address;
  unsignedPrePeginTx: string;
  requests: BatchPeginRegistrationItem[];
  popSignature: PopSignature;
  /** Raw x-only, compressed, or uncompressed BTC pubkey from the PoP wallet. */
  depositorBtcPubkeyRaw: string;
  quotedCommissionBps?: number;
  /** See {@link RegisterPeginOnChainParams.quotedPeginFeeWei}: the total for every request in the batch. */
  quotedPeginFeeWei?: bigint;
  /**
   * See {@link RegisterPeginOnChainParams.expectedFingerprint}. One value for
   * the whole batch: the fingerprint takes no per-request input and a batch
   * fixes one vault provider, so every entry would resolve the same value.
   */
  expectedFingerprint: Hex;
}

export interface BatchPeginRegistrationResultItem {
  vaultId: Hex;
  peginTxHash: Hex;
}

export interface PeginBatchRegistrationResult {
  /** See {@link PeginRegistrationResult.ethTxHash}. */
  ethTxHash: Hex;
  vaults: BatchPeginRegistrationResultItem[];
}

/**
 * Ethereum-only client for the on-chain half of peg-in registration.
 *
 * It consumes Bitcoin artifacts that were prepared earlier, but owns no BTC
 * wallet and imports neither Bitcoin libraries nor the Rust/WASM package.
 */
export class ViemPeginRegistrationClient {
  constructor(private readonly config: ViemPeginRegistrationClientConfig) {
    const { receiptTimeoutMs } = config;
    // Zero or less would end the wait before any receipt check, and NaN or
    // Infinity would leave it with no bound.
    if (
      receiptTimeoutMs !== undefined &&
      !(Number.isFinite(receiptTimeoutMs) && receiptTimeoutMs > 0)
    ) {
      throw new Error(
        `receiptTimeoutMs must be a positive, finite number of milliseconds; received ${receiptTimeoutMs}.`,
      );
    }
  }

  async registerPeginOnChain(
    params: RegisterPeginOnChainParams,
  ): Promise<PeginRegistrationResult> {
    const request = {
      ...params,
      popSignature: { ...params.popSignature },
    };
    this.assertQuotedCommissionPresentWhenRequired(request.quotedCommissionBps);
    // Second, matching the batch path, so the two public entry points validate
    // in the same order and neither can drift behind a chain call.
    assertFingerprint(request.expectedFingerprint);
    const depositor = this.assertPopMatchesEthAccount(request.popSignature);
    const depositorBtcPubkey = this.normalizeBtcPubkey(request.popSignature);
    const btcPopSignature = ensureHex(
      request.popSignature.btcPopSignature,
      "btcPopSignature",
    );
    const normalized = this.normalizeRequest(
      request,
      depositor,
      depositorBtcPubkey,
    );

    await this.assertVaultDoesNotExist(
      normalized.vaultId,
      normalized.peginTxHash,
    );
    const peginFeeTotal = await this.readPeginFee(
      request.vaultProvider,
      1,
      request.quotedPeginFeeWei,
    );
    const maxCommission = await this.resolveMaxAcceptableCommissionBps(
      request.vaultProvider,
      request.quotedCommissionBps,
    );
    const callData = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "submitPeginRequest",
      args: [
        depositor,
        depositorBtcPubkey,
        btcPopSignature,
        normalized.unsignedPrePeginTx,
        normalized.depositorSignedPeginTx,
        request.vaultProvider,
        maxCommission,
        request.hashlock,
        request.htlcVout,
        normalized.payoutScript,
        request.depositorWotsPkHash,
        // Appended last on the singular overload; the batch takes it at
        // position 4 instead. Order is the selector, so do not "tidy" either.
        request.expectedFingerprint,
      ],
    });

    const ethTxHash = await this.sendAndWait(
      callData,
      peginFeeTotal,
      false,
      depositor,
      [normalized.vaultId],
    );
    return {
      ethTxHash,
      vaultId: normalized.vaultId,
      peginTxHash: normalized.peginTxHash,
    };
  }

  async registerPeginBatchOnChain(
    params: RegisterPeginBatchOnChainParams,
  ): Promise<PeginBatchRegistrationResult> {
    const batch = {
      ...params,
      popSignature: { ...params.popSignature },
      requests: params.requests.map((request) => ({ ...request })),
    };
    if (batch.requests.length === 0) {
      throw new Error("Batch pegin requires at least one request");
    }
    this.assertQuotedCommissionPresentWhenRequired(batch.quotedCommissionBps);
    assertFingerprint(batch.expectedFingerprint);
    const depositor = this.assertPopMatchesEthAccount(batch.popSignature);
    const unsignedPrePeginTx = ensureHex(
      batch.unsignedPrePeginTx,
      "unsignedPrePeginTx",
    );
    const depositorBtcPubkey = this.normalizeBtcPubkey(batch.popSignature);
    const btcPopSignature = ensureHex(
      batch.popSignature.btcPopSignature,
      "btcPopSignature",
    );

    const vaults: BatchPeginRegistrationResultItem[] = [];
    const requests = [];
    const seenVaultIds = new Set<string>();
    for (const request of batch.requests) {
      const normalized = this.normalizeRequest(
        {
          ...request,
          unsignedPrePeginTx: batch.unsignedPrePeginTx,
          vaultProvider: batch.vaultProvider,
          depositorBtcPubkeyRaw: batch.depositorBtcPubkeyRaw,
        },
        depositor,
        depositorBtcPubkey,
      );
      if (seenVaultIds.has(normalized.vaultId)) {
        throw new Error(`Duplicate vault in batch: ${normalized.vaultId}`);
      }
      seenVaultIds.add(normalized.vaultId);
      vaults.push({
        vaultId: normalized.vaultId,
        peginTxHash: normalized.peginTxHash,
      });
      requests.push({
        depositorBtcPubKey: depositorBtcPubkey,
        btcPopSignature,
        unsignedPrePeginTx,
        depositorSignedPeginTx: normalized.depositorSignedPeginTx,
        hashlock: request.hashlock,
        htlcVout: request.htlcVout,
        referralCode: NO_REFERRAL_CODE,
        depositorPayoutBtcAddress: normalized.payoutScript,
        depositorWotsPkHash: request.depositorWotsPkHash,
      });
    }
    for (const vault of vaults) {
      await this.assertVaultDoesNotExist(vault.vaultId, vault.peginTxHash);
    }

    const peginFeeTotal = await this.readPeginFee(
      batch.vaultProvider,
      batch.requests.length,
      batch.quotedPeginFeeWei,
    );
    const maxCommission = await this.resolveMaxAcceptableCommissionBps(
      batch.vaultProvider,
      batch.quotedCommissionBps,
    );
    const callData = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "submitPeginRequestBatch",
      // `expectedFingerprint` sits BEFORE `requests`, not appended. Reordering
      // these five changes the selector and the call stops existing.
      args: [
        depositor,
        batch.vaultProvider,
        maxCommission,
        batch.expectedFingerprint,
        requests,
      ],
    });
    const ethTxHash = await this.sendAndWait(
      callData,
      peginFeeTotal,
      true,
      depositor,
      vaults.map((vault) => vault.vaultId),
    );
    return { ethTxHash, vaults };
  }

  private assertQuotedCommissionPresentWhenRequired(
    quotedCommissionBps?: number,
  ): void {
    if (
      quotedCommissionBps === undefined &&
      this.config.requireQuotedCommissionBps
    ) {
      throw new Error(
        "quotedCommissionBps is required when the wallet approved deposit " +
          "terms: the registration ceiling must anchor to the approved quote.",
      );
    }
  }

  private assertPopMatchesEthAccount(pop: PopSignature): Address {
    return this.assertEthAccount(pop.depositorEthAddress);
  }

  private assertEthAccount(expectedDepositor: Address): Address {
    const account = this.config.ethWallet.account;
    if (!account) throw new Error("Ethereum wallet account not found");
    if (!isAddressEqual(expectedDepositor, account.address)) {
      throw new Error(
        `Proof of possession was signed for ${expectedDepositor} ` +
          `but the Ethereum wallet is currently connected to ${account.address}. ` +
          `Reconnect the original account or sign a new proof of possession.`,
      );
    }
    return account.address;
  }

  private normalizeBtcPubkey(pop: PopSignature): Hex {
    return `0x${assertOnChainBtcPubkey(
      ensureHex(pop.depositorBtcPubkey, "Proof of possession BTC pubkey"),
      "Proof of possession BTC pubkey",
    )}`;
  }

  // `expectedFingerprint` is omitted rather than accepted and ignored: nothing
  // here normalizes it, and requiring it would force the batch loop to thread a
  // value through a per-request helper that has no use for it. It is validated
  // once per call, at the top of each public method.
  private normalizeRequest(
    params: Omit<
      RegisterPeginOnChainParams,
      "popSignature" | "expectedFingerprint"
    >,
    depositor: Address,
    depositorBtcPubkey: Hex,
  ) {
    assertBytes32(params.hashlock, "hashlock");
    assertBytes32(params.depositorWotsPkHash, "depositorWotsPkHash");
    assertHtlcVout(params.htlcVout);
    const unsignedPrePeginTx = ensureHex(
      params.unsignedPrePeginTx,
      "unsignedPrePeginTx",
    );
    const depositorSignedPeginTx = ensureHex(
      params.depositorSignedPeginTx,
      "depositorSignedPeginTx",
    );
    const peginTxHash = calculateBtcTxHash(depositorSignedPeginTx);
    return {
      unsignedPrePeginTx,
      depositorSignedPeginTx,
      payoutScript: assertPayoutScriptMatchesPopKey(
        params.depositorPayoutScriptPubKey,
        depositorBtcPubkey,
        params.depositorBtcPubkeyRaw,
      ),
      peginTxHash,
      vaultId: ensureHex(derivePeginVaultId(peginTxHash, depositor), "vaultId"),
    };
  }

  private async isVaultRegistered(vaultId: Hex): Promise<boolean> {
    const result = (await this.config.publicClient.readContract({
      address: this.config.btcVaultRegistry,
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultBasicInfo",
      args: [vaultId],
    })) as { depositor: Address };
    return result.depositor !== zeroAddress;
  }

  private async assertVaultDoesNotExist(
    vaultId: Hex,
    peginTxHash: Hex,
  ): Promise<void> {
    if (await this.isVaultRegistered(vaultId)) {
      throw new Error(
        `Vault already exists (ID: ${vaultId}, peginTxHash: ${peginTxHash}). ` +
          `Vault IDs are derived from the pegin transaction hash and depositor address. ` +
          `To create a new vault, use different UTXOs or a different amount to generate a unique transaction.`,
      );
    }
  }

  private async readPeginFee(
    vaultProvider: Address,
    requestCount: number,
    quotedPeginFeeWei?: bigint,
  ): Promise<bigint> {
    if (
      quotedPeginFeeWei !== undefined &&
      (typeof quotedPeginFeeWei !== "bigint" || quotedPeginFeeWei < 0n)
    ) {
      throw new Error(
        `quotedPeginFeeWei must be a non-negative bigint in wei; received ${String(quotedPeginFeeWei)}.`,
      );
    }
    let peginFee: bigint;
    try {
      peginFee = (await this.config.publicClient.readContract({
        address: this.config.btcVaultRegistry,
        abi: BTCVaultRegistryABI,
        functionName: "getPegInFee",
        args: [vaultProvider],
      })) as bigint;
    } catch (error) {
      throw new Error(
        "Failed to query pegin fee from the contract. " +
          "Please check your network connection and contract address.",
        { cause: error },
      );
    }
    const totalFee = peginFee * BigInt(requestCount);
    if (quotedPeginFeeWei !== undefined && totalFee > quotedPeginFeeWei) {
      throw new Error(
        `Pegin fee changed since quote: quoted ${quotedPeginFeeWei} wei, ` +
          `chain currently requires ${totalFee} wei. Please refresh and try again.`,
      );
    }
    return totalFee;
  }

  private async resolveMaxAcceptableCommissionBps(
    vaultProvider: Address,
    quotedCommissionBps?: number,
  ): Promise<number> {
    let currentBps: number;
    try {
      currentBps = await new ViemVaultRegistryReader(
        this.config.publicClient,
        this.config.btcVaultRegistry,
      ).getVaultProviderCommission(vaultProvider);
    } catch (error) {
      throw new Error(
        "Failed to query vault provider commission from the contract. " +
          "Please check your network connection and contract address.",
        { cause: error },
      );
    }
    if (quotedCommissionBps !== undefined) {
      if (currentBps > quotedCommissionBps + COMMISSION_BPS_HEADROOM) {
        throw new Error(
          `Vault provider commission changed since quote: quoted ${quotedCommissionBps} bps, ` +
            `chain currently reports ${currentBps} bps (allowed drift ${COMMISSION_BPS_HEADROOM} bps). ` +
            `Please refresh and try again.`,
        );
      }
      return capMaxAcceptableCommissionBps(quotedCommissionBps);
    }
    return capMaxAcceptableCommissionBps(currentBps);
  }

  private async sendAndWait(
    data: Hex,
    value: bigint,
    batch: boolean,
    depositor: Address,
    vaultIds: readonly Hex[],
  ): Promise<Hex> {
    let account = this.assertEthAccount(depositor);
    const code = await this.config.publicClient.getCode({ address: account });
    const isSmartAccount =
      code !== undefined &&
      code !== "0x" &&
      !EIP_7702_DELEGATION_CODE.test(code);
    const balance = await this.config.publicClient.getBalance({
      address: this.assertEthAccount(depositor),
    });
    if (typeof balance !== "bigint" || balance < 0n) {
      throw new Error("Failed to read the Ethereum balance. Try again.");
    }
    // Typed before any node call: a node reports a value shortfall in its own words.
    if (balance < value) {
      throw Object.assign(new InsufficientFundsError(), {
        required: value,
        balance,
      });
    }
    // No fee fields: with a fee cap, geth/reth cap the estimate at the balance
    // ("gas required exceeds allowance", go-ethereum eth/gasestimator).
    let gas: bigint;
    try {
      gas = await this.config.publicClient.estimateGas({
        to: this.config.btcVaultRegistry,
        data,
        value,
        account,
      });
    } catch (error) {
      handleContractError(error);
    }
    if (typeof gas !== "bigint" || gas <= 0n) {
      throw new Error("Failed to estimate registration gas. Try again.");
    }
    let gasAndFees;
    // A Safe's executor pays gas; the estimate above is just its revert check.
    if (!isSmartAccount) {
      let request;
      try {
        request = await this.config.publicClient.prepareTransactionRequest({
          to: this.config.btcVaultRegistry,
          data,
          value,
          account,
          chain: this.config.ethChain,
          gas,
          parameters: ["fees", "type"],
        });
      } catch (error) {
        handleContractError(error);
      }

      const { type, gasPrice, maxFeePerGas, maxPriorityFeePerGas } = request;
      const fees =
        type === "eip1559" &&
        typeof maxFeePerGas === "bigint" &&
        typeof maxPriorityFeePerGas === "bigint" &&
        maxPriorityFeePerGas >= 0n &&
        maxFeePerGas >= maxPriorityFeePerGas
          ? { type, maxFeePerGas, maxPriorityFeePerGas }
          : type === "legacy" && typeof gasPrice === "bigint" && gasPrice >= 0n
            ? { type, gasPrice }
            : undefined;
      if (!fees) {
        throw new Error("Failed to prepare registration fees. Try again.");
      }
      // Legacy transactions pay the whole gas price, so headroom there is spent.
      const sentFees =
        fees.type === "eip1559"
          ? await this.eip1559RegistrationFees(fees.maxPriorityFeePerGas)
          : fees;
      gasAndFees = { gas, ...sentFees };
      const feeCap =
        sentFees.type === "eip1559" ? sentFees.maxFeePerGas : sentFees.gasPrice;
      if (balance < value + gas * feeCap) {
        throw Object.assign(new InsufficientFundsError(), {
          required: value + gas * feeCap,
          balance,
        });
      }
    }
    // The node reads above used the snapshot; re-gate before the liveness check.
    this.assertEthAccount(depositor);
    const addresses = await this.config.ethWallet.getAddresses();
    if (
      !Array.isArray(addresses) ||
      !addresses.every(
        (address) => typeof address === "string" && isAddress(address),
      ) ||
      !addresses.some((address) => isAddressEqual(address, depositor))
    ) {
      throw new Error(
        "The Ethereum wallet account is no longer available. Reconnect it and try again.",
      );
    }
    account = this.assertEthAccount(depositor);
    let submittedHash: Hex;
    try {
      submittedHash = await this.config.ethWallet.sendTransaction({
        to: this.config.btcVaultRegistry,
        data,
        value,
        ...gasAndFees,
        account,
        chain: this.config.ethChain,
      });
    } catch (error) {
      handleContractError(error);
    }
    const receipt = isSmartAccount
      ? await waitForTransactionReceiptSmartAware({
          publicClient: this.config.publicClient,
          walletAddress: depositor,
          hash: submittedHash,
          timeout:
            this.config.receiptTimeoutMs ??
            REGISTRATION_CONFIRMATION_TIMEOUT_MS,
        })
      : await this.waitForEoaRegistration(submittedHash, vaultIds);
    if (receipt === null) return submittedHash;
    if (receipt.status === "reverted") {
      handleContractError(
        new Error(
          `${batch ? "Batch transaction" : "Transaction"} reverted. ` +
            `Hash: ${receipt.transactionHash}. Check a block explorer for details.`,
        ),
      );
    }
    return receipt.transactionHash;
  }

  /**
   * EIP-1559 fees the registration is sent with: a cap of
   * {@link REGISTRATION_BASE_FEE_MULTIPLIER} times the latest base fee plus the
   * tip, and a tip of at least {@link MIN_REGISTRATION_PRIORITY_FEE_WEI}. The
   * fees are fixed here, before the wallet prompt, and the base fee can rise
   * while the depositor reviews and approves the transaction.
   */
  private async eip1559RegistrationFees(suggestedPriorityFeePerGas: bigint) {
    const { baseFeePerGas } = await this.config.publicClient.getBlock({
      blockTag: "latest",
    });
    if (typeof baseFeePerGas !== "bigint" || baseFeePerGas <= 0n) {
      throw new Error("Failed to read the Ethereum base fee. Try again.");
    }
    const maxPriorityFeePerGas =
      suggestedPriorityFeePerGas > MIN_REGISTRATION_PRIORITY_FEE_WEI
        ? suggestedPriorityFeePerGas
        : MIN_REGISTRATION_PRIORITY_FEE_WEI;
    return {
      type: "eip1559" as const,
      maxFeePerGas:
        baseFeePerGas * REGISTRATION_BASE_FEE_MULTIPLIER + maxPriorityFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  /**
   * Waits for an EOA's registration in rounds, so a registration that confirms
   * late is not reported as failed. After each round without a receipt, the
   * registry is read for the vaults. That also confirms a registration the
   * wallet re-sent under another hash when the receipt wait did not follow
   * the replacement, and one the RPC did not show while it was pending.
   *
   * When the receipt wait follows a replacement of this transaction, its
   * receipt counts only if the replacement repeats the same call (viem's
   * `repriced`, a speed-up). A cancel, or a different transaction on the same
   * nonce, means nothing was registered, so the wait ends with an error.
   *
   * A failed round is inconclusive, not an answer: a reverted registration
   * comes back as a receipt, so neither the receipt wait nor the registry read
   * reports a revert by throwing. One RPC error therefore ends a round, never
   * the wait. It is logged; after a failed receipt wait the next round starts
   * after {@link REGISTRATION_RETRY_DELAY_MS}, and after a failed registry
   * read it starts at once.
   *
   * @returns the receipt, or `null` when the registry holds every vault but no
   *   receipt for this hash arrived.
   * @throws {WaitForTransactionReceiptTimeoutError} once the confirmation
   *   timeout passes.
   * @throws if the wallet cancelled or replaced the registration.
   */
  private async waitForEoaRegistration(
    hash: Hex,
    vaultIds: readonly Hex[],
  ): Promise<TransactionReceipt | null> {
    const deadline =
      Date.now() +
      (this.config.receiptTimeoutMs ?? REGISTRATION_CONFIRMATION_TIMEOUT_MS);
    for (;;) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new WaitForTransactionReceiptTimeoutError({ hash });
      }
      let replacementReason: string | undefined;
      let receipt: TransactionReceipt | undefined;
      try {
        receipt = await this.config.publicClient.waitForTransactionReceipt({
          hash,
          timeout: Math.min(REGISTRATION_RECEIPT_ROUND_MS, remainingMs),
          // viem reports the reason here and then resolves with the
          // replacement's receipt, whatever the reason.
          onReplaced: ({ reason }) => {
            replacementReason = reason;
          },
        });
      } catch (error) {
        // By name: the public client may come from another copy of viem.
        const timedOut =
          error instanceof Error &&
          error.name === "WaitForTransactionReceiptTimeoutError";
        if (!timedOut) {
          console.warn(
            `Registration receipt wait failed; retrying until the confirmation timeout: ${describeRoundError(error)}`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, REGISTRATION_RETRY_DELAY_MS),
          );
        }
      }
      if (receipt) {
        if (replacementReason !== undefined && replacementReason !== "repriced") {
          throw new Error(
            `The registration transaction was ${
              replacementReason === "cancelled"
                ? "cancelled"
                : "replaced by a different transaction"
            } in the wallet, so nothing was registered. Start the registration again.`,
          );
        }
        return receipt;
      }
      try {
        if (await this.areVaultsRegistered(vaultIds)) return null;
      } catch (error) {
        console.warn(
          `Registry read for the registration failed; retrying until the confirmation timeout: ${describeRoundError(error)}`,
        );
      }
    }
  }

  private async areVaultsRegistered(vaultIds: readonly Hex[]): Promise<boolean> {
    for (const vaultId of vaultIds) {
      if (!(await this.isVaultRegistered(vaultId))) return false;
    }
    return true;
  }
}
