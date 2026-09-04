import {
  encodeFunctionData,
  isAddressEqual,
  zeroAddress,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
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
// Match the prior vault-service timeout. A dropped transaction must not wait forever.
const RECEIPT_TIMEOUT_MS = 120_000;

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
  constructor(private readonly config: ViemPeginRegistrationClientConfig) {}

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
    const peginFee = await this.readPeginFee(request.vaultProvider);
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
      peginFee,
      false,
      depositor,
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

    const peginFee = await this.readPeginFee(batch.vaultProvider);
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
      peginFee * BigInt(batch.requests.length),
      true,
      depositor,
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

  private async assertVaultDoesNotExist(
    vaultId: Hex,
    peginTxHash: Hex,
  ): Promise<void> {
    const result = (await this.config.publicClient.readContract({
      address: this.config.btcVaultRegistry,
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultBasicInfo",
      args: [vaultId],
    })) as { depositor: Address };
    if (result.depositor !== zeroAddress) {
      throw new Error(
        `Vault already exists (ID: ${vaultId}, peginTxHash: ${peginTxHash}). ` +
          `Vault IDs are derived from the pegin transaction hash and depositor address. ` +
          `To create a new vault, use different UTXOs or a different amount to generate a unique transaction.`,
      );
    }
  }

  private async readPeginFee(vaultProvider: Address): Promise<bigint> {
    try {
      return (await this.config.publicClient.readContract({
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
  ): Promise<Hex> {
    let account = this.assertEthAccount(depositor);
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

    account = this.assertEthAccount(depositor);
    let submittedHash: Hex;
    try {
      submittedHash = await this.config.ethWallet.sendTransaction({
        to: this.config.btcVaultRegistry,
        data,
        value,
        gas,
        account,
        chain: this.config.ethChain,
      });
    } catch (error) {
      handleContractError(error);
    }
    const receipt = await waitForTransactionReceiptSmartAware({
      publicClient: this.config.publicClient,
      walletAddress: depositor,
      hash: submittedHash,
      timeout: this.config.receiptTimeoutMs ?? RECEIPT_TIMEOUT_MS,
    });
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
}
