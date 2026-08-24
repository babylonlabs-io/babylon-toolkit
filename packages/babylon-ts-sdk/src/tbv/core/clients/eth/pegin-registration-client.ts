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
import { MAX_PAYOUT_SCRIPT_LEN } from "../../primitives/psbt/constants";
import { waitForTransactionReceiptSmartAware } from "../../utils/eth";
import { assertOnChainBtcPubkey } from "./onChainBtcPubkey";
import { calculateBtcTxHash, derivePeginVaultId } from "./pegin-transaction";
import { ViemVaultRegistryReader } from "./vault-registry-reader";

const NO_REFERRAL_CODE = 0;
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

function assertHtlcVout(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`htlcVout must be a uint8, got ${value}`);
  }
}

declare const verifiedPayoutScriptPubKeyBrand: unique symbol;

/**
 * Bitcoin output script bytes that a Bitcoin-aware boundary has already bound
 * to the depositor's proof-of-possession key. Minted only by
 * {@link markPayoutScriptVerifiedAgainstPopKey}.
 */
export type VerifiedPayoutScriptPubKey = Hex & {
  readonly [verifiedPayoutScriptPubKeyBrand]: true;
};

/**
 * Mint a {@link VerifiedPayoutScriptPubKey} from raw output script bytes,
 * after checking the encoding and the length bound the registry accepts.
 *
 * Call this only from a Bitcoin-aware boundary that has already checked the
 * script pays the proof-of-possession key. What it mints is an irreversible
 * on-chain payout destination, and this wallet-free ETH client cannot
 * re-derive the script to check it again.
 */
export function markPayoutScriptVerifiedAgainstPopKey(
  scriptPubKey: string,
): VerifiedPayoutScriptPubKey {
  const payoutScript = ensureHex(scriptPubKey, "depositorPayoutScriptPubKey");
  if ((payoutScript.length - 2) / 2 > MAX_PAYOUT_SCRIPT_LEN) {
    throw new Error(
      `depositorPayoutScriptPubKey exceeds ${MAX_PAYOUT_SCRIPT_LEN} bytes`,
    );
  }
  return payoutScript as VerifiedPayoutScriptPubKey;
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
  htlcVout: number;
  /**
   * Bitcoin output script bytes, not an address. Mint it with
   * {@link markPayoutScriptVerifiedAgainstPopKey} at the BTC preparation
   * boundary, which is the only place able to bind the script to the PoP key.
   */
  depositorPayoutScriptPubKey: VerifiedPayoutScriptPubKey;
  quotedCommissionBps?: number;
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
   * Bitcoin output script bytes, not an address. Mint it with
   * {@link markPayoutScriptVerifiedAgainstPopKey} at the BTC preparation
   * boundary, which is the only place able to bind the script to the PoP key.
   */
  depositorPayoutScriptPubKey: VerifiedPayoutScriptPubKey;
  depositorWotsPkHash: Hex;
}

export interface RegisterPeginBatchOnChainParams {
  vaultProvider: Address;
  unsignedPrePeginTx: string;
  requests: BatchPeginRegistrationItem[];
  popSignature: PopSignature;
  quotedCommissionBps?: number;
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
    this.assertQuotedCommissionPresentWhenRequired(params.quotedCommissionBps);
    const depositor = this.assertPopMatchesEthAccount(params.popSignature);
    const depositorBtcPubkey = this.normalizeBtcPubkey(params.popSignature);
    const btcPopSignature = ensureHex(
      params.popSignature.btcPopSignature,
      "btcPopSignature",
    );
    const normalized = this.normalizeRequest(params, depositor);

    await this.assertVaultDoesNotExist(
      normalized.vaultId,
      normalized.peginTxHash,
    );
    const peginFee = await this.readPeginFee(params.vaultProvider);
    const maxCommission = await this.resolveMaxAcceptableCommissionBps(
      params.vaultProvider,
      params.quotedCommissionBps,
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
        params.vaultProvider,
        maxCommission,
        params.hashlock,
        params.htlcVout,
        normalized.payoutScript,
        params.depositorWotsPkHash,
      ],
    });

    const ethTxHash = await this.sendAndWait(callData, peginFee, false);
    return {
      ethTxHash,
      vaultId: normalized.vaultId,
      peginTxHash: normalized.peginTxHash,
    };
  }

  async registerPeginBatchOnChain(
    params: RegisterPeginBatchOnChainParams,
  ): Promise<PeginBatchRegistrationResult> {
    if (params.requests.length === 0) {
      throw new Error("Batch pegin requires at least one request");
    }
    this.assertQuotedCommissionPresentWhenRequired(params.quotedCommissionBps);
    const depositor = this.assertPopMatchesEthAccount(params.popSignature);
    const unsignedPrePeginTx = ensureHex(
      params.unsignedPrePeginTx,
      "unsignedPrePeginTx",
    );
    const depositorBtcPubkey = this.normalizeBtcPubkey(params.popSignature);
    const btcPopSignature = ensureHex(
      params.popSignature.btcPopSignature,
      "btcPopSignature",
    );

    const vaults: BatchPeginRegistrationResultItem[] = [];
    const requests = [];
    const seenVaultIds = new Set<string>();
    for (const request of params.requests) {
      const normalized = this.normalizeRequest(
        {
          ...request,
          unsignedPrePeginTx: params.unsignedPrePeginTx,
          vaultProvider: params.vaultProvider,
        },
        depositor,
      );
      if (seenVaultIds.has(normalized.vaultId)) {
        throw new Error(`Duplicate vault in batch: ${normalized.vaultId}`);
      }
      seenVaultIds.add(normalized.vaultId);
      await this.assertVaultDoesNotExist(
        normalized.vaultId,
        normalized.peginTxHash,
      );
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

    const peginFee = await this.readPeginFee(params.vaultProvider);
    const maxCommission = await this.resolveMaxAcceptableCommissionBps(
      params.vaultProvider,
      params.quotedCommissionBps,
    );
    const callData = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "submitPeginRequestBatch",
      args: [depositor, params.vaultProvider, maxCommission, requests],
    });
    const ethTxHash = await this.sendAndWait(
      callData,
      peginFee * BigInt(params.requests.length),
      true,
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
    const account = this.config.ethWallet.account;
    if (!account) throw new Error("Ethereum wallet account not found");
    if (!isAddressEqual(pop.depositorEthAddress, account.address)) {
      throw new Error(
        `Proof of possession was signed for ${pop.depositorEthAddress} ` +
          `but the Ethereum wallet is currently connected to ${account.address}. ` +
          `Reconnect the original account or sign a new proof of possession.`,
      );
    }
    return account.address;
  }

  private normalizeBtcPubkey(pop: PopSignature): Hex {
    return `0x${assertOnChainBtcPubkey(
      (pop.depositorBtcPubkey.startsWith("0x")
        ? pop.depositorBtcPubkey
        : `0x${pop.depositorBtcPubkey}`) as Hex,
      "Proof of possession BTC pubkey",
    )}`;
  }

  private normalizeRequest(
    params: Omit<RegisterPeginOnChainParams, "popSignature">,
    depositor: Address,
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
      payoutScript: params.depositorPayoutScriptPubKey,
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
  ): Promise<Hex> {
    const account = this.config.ethWallet.account;
    if (!account) throw new Error("Ethereum wallet account not found");
    let gas: bigint;
    try {
      gas = await this.config.publicClient.estimateGas({
        to: this.config.btcVaultRegistry,
        data,
        value,
        account: account.address,
      });
    } catch (error) {
      handleContractError(error);
    }

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
      walletAddress: account.address,
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
