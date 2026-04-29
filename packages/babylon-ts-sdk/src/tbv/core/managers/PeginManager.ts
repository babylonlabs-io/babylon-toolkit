/**
 * Peg-in Manager - Wallet Orchestration for Peg-in Operations
 *
 * This module provides the PeginManager class that orchestrates the complete
 * peg-in flow using SDK primitives, utilities, and wallet interfaces.
 *
 * @remarks
 * PeginManager handles the peg-in flow:
 * 1. **preparePegin()** - Build Pre-PegIn HTLC, fund it, sign PegIn input
 * 2. **signProofOfPossession()** - Sign BIP-322 PoP (one per deposit session)
 * 3. **registerPeginOnChain()** - Submit to Ethereum contract with PoP
 * 4. **signAndBroadcast()** - Sign and broadcast Pre-PegIn tx to Bitcoin network
 * 5. *(Use {@link PayoutManager} for payout authorization signing)*
 *
 * @see {@link PayoutManager} - For Step 5: sign payout transactions
 * @see {@link buildPrePeginPsbt} - Lower-level primitive used internally
 *
 * @module managers/PeginManager
 */

import { sha256 } from "@noble/hashes/sha2.js";
import * as bitcoin from "bitcoinjs-lib";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import {
  assertAuthAnchorOpReturn,
  expandPerVaultSecrets,
  normalizePopSignature,
  normalizeXOnlyPubkey,
  signPsbtsWithFallback,
} from "./pegin";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddressEqual,
  zeroAddress,
  type Address,
  type Chain,
  type Hex,
  type WalletClient,
} from "viem";

import type { BitcoinWallet, Hash, SignPsbtOptions } from "../../../shared/wallets";
import type { WotsBlockPublicKey } from "../clients/vault-provider/types";
import { type UtxoInfo, getUtxoInfo, pushTx } from "../clients/mempool";
import { BTCVaultRegistryABI, handleContractError } from "../contracts";
import {
  buildPrePeginPsbt,
  buildPeginTxFromFundedPrePegin,
  buildPeginInputPsbt,
  extractPeginInputSignature,
  finalizePeginInputPsbt,
  deriveVaultId,
  type PrePeginParams,
  type Network,
} from "../primitives";
import {
  ensureHexPrefix,
  hexToUint8Array,
  isAddressFromPublicKey,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../primitives/utils/bitcoin";
import {
  calculateBtcTxHash,
  fundPeginTransaction,
  getNetwork,
  getPsbtInputFields,
  peginOutputCount,
  selectUtxosForPegin,
  type UTXO,
  MAX_REASONABLE_FEE_SATS,
} from "../utils";
import { createTaprootScriptPathSignOptions } from "../utils/signing";
import {
  deriveVaultRoot,
  expandAuthAnchor,
  type FundingOutpoint,
} from "../vault-secrets";

/** Referral code sent with pegin registration — 0 means no referral. */
const NO_REFERRAL_CODE = 0;

/**
 * 32-byte zero hex used as a placeholder during the sizing pass for any
 * value whose content does not affect output sizes — currently the
 * per-vault hashlocks and the auth-anchor commitment. The commit pass
 * substitutes real values; UTXO selection and fee sizing are invariant
 * under the swap because all four (placeholder hashlock, real
 * SHA256(secret), placeholder anchor, real SHA256(authAnchor)) are
 * 32-byte pushes. Substitution invariance is pinned in `pegin.test.ts`.
 */
const SIZING_PASS_PLACEHOLDER_BYTES32_HEX = "00".repeat(32);

/**
 * Configuration for the PeginManager.
 */
export interface PeginManagerConfig {
  /**
   * Bitcoin network to use for transactions.
   */
  btcNetwork: Network;

  /**
   * Bitcoin wallet for signing peg-in transactions.
   */
  btcWallet: BitcoinWallet;

  /**
   * Ethereum wallet for registering peg-in on-chain.
   * Uses viem's WalletClient directly for proper gas estimation.
   */
  ethWallet: WalletClient;

  /**
   * Ethereum chain configuration.
   * Required for proper gas estimation in contract calls.
   */
  ethChain: Chain;

  /**
   * Vault contract addresses.
   */
  vaultContracts: {
    /**
     * BTCVaultRegistry contract address on Ethereum.
     */
    btcVaultRegistry: Address;
  };

  /**
   * Mempool API URL for fetching UTXO data and broadcasting transactions.
   * Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
   * a custom URL if running your own mempool instance.
   */
  mempoolApiUrl: string;
}

/**
 * Parameters for the pegin flow (pre-pegin + pegin transactions).
 */
export interface PreparePeginParams {
  /**
   * Amounts to peg in per HTLC (in satoshis).
   * Must have the same length as `hashlocks`.
   * For single deposits, pass a single-element array.
   */
  amounts: readonly bigint[];

  /**
   * Vault provider's BTC public key (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix (will be stripped automatically).
   */
  vaultProviderBtcPubkey: string;

  /**
   * Vault keeper BTC public keys (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix (will be stripped automatically).
   */
  vaultKeeperBtcPubkeys: readonly string[];

  /**
   * Universal challenger BTC public keys (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix (will be stripped automatically).
   */
  universalChallengerBtcPubkeys: readonly string[];

  /**
   * CSV timelock in blocks for the PegIn vault output.
   */
  timelockPegin: number;

  /**
   * CSV timelock in blocks for the Pre-PegIn HTLC refund path.
   */
  timelockRefund: number;

  /**
   * Protocol fee rate in sat/vB from the contract offchain params.
   * Used by WASM for computing depositorClaimValue and min pegin fee.
   */
  protocolFeeRate: bigint;

  /**
   * Mempool fee rate in sat/vB for funding the Pre-PegIn transaction.
   * Used for UTXO selection and change calculation.
   */
  mempoolFeeRate: number;

  /**
   * M in M-of-N council multisig (from contract params).
   */
  councilQuorum: number;

  /**
   * N in M-of-N council multisig (from contract params).
   */
  councilSize: number;

  /**
   * Available UTXOs from the depositor's wallet for funding the Pre-PegIn transaction.
   */
  availableUTXOs: readonly UTXO[];

  /**
   * Bitcoin address for receiving change from the Pre-PegIn transaction.
   */
  changeAddress: string;
}

/**
 * Result of preparing a pegin.
 */
/** Per-vault PegIn data derived from a shared Pre-PegIn transaction */
export interface PerVaultPeginData {
  /** Index of the HTLC output in the Pre-PegIn transaction (0, 1, 2, ...) */
  htlcVout: number;
  /** HTLC output value in satoshis */
  htlcValue: bigint;
  /** Depositor-signed PegIn transaction hex (for contract registration) */
  peginTxHex: string;
  /** PegIn transaction ID */
  peginTxid: string;
  /** Depositor's Schnorr signature over PegIn input (HTLC leaf 0) */
  peginInputSignature: string;
  /** Vault output scriptPubKey hex */
  vaultScriptPubKey: string;
}

/**
 * Broadcast-ready transaction output of {@link PeginManager.preparePegin}.
 * Safe to log / persist — contains no sensitive material.
 */
export interface PreparePeginTransaction {
  /**
   * Funded, pre-witness Pre-PegIn tx hex. Pass this for register calls'
   * `unsignedPrePeginTx` — despite the contract-side name, the registry
   * stores the funded form so indexers can rebuild refund PSBTs.
   */
  fundedPrePeginTxHex: string;
  /** Funded Pre-PegIn transaction ID */
  prePeginTxid: string;
  /** Per-vault PegIn data — one entry per amount */
  perVault: PerVaultPeginData[];
  /** UTXOs selected to fund the Pre-PegIn transaction */
  selectedUTXOs: UTXO[];
  /** Transaction fee in satoshis */
  fee: bigint;
  /** Change amount in satoshis (if any) */
  changeAmount: bigint;
}

/**
 * Sensitive material derived from the wallet root. Do not log; do not
 * persist beyond the activation flow. Strings are immutable in JS, so
 * lifetime is GC-only — secrets stay live until the result is dropped.
 */
export interface PreparePeginDerivedSecrets {
  /** Per-vault WOTS block public keys (one array per vault). */
  perVaultWotsKeys: WotsBlockPublicKey[][];
  /** Per-vault keccak256 of WOTS keys, ready as `depositorWotsPkHash`. */
  wotsPkHashes: Hex[];
  /**
   * Per-vault HTLC preimage hex (no 0x prefix). Re-derivable any time
   * via `expandHashlockSecret(root, htlcVout)`; not persisted.
   */
  htlcSecretHexes: string[];
  /**
   * Raw 32-byte auth-anchor preimage as 64-char lowercase hex (no `0x`).
   * Sent to the VP via `auth_createDepositorToken` to obtain a bearer
   * token; the VP validates `SHA256(authAnchorHex) === OP_RETURN_PUSH32`
   * in the broadcast Pre-PegIn. Reveal is intentional: once exposed
   * the anchor is public, but its scope is bound to a single
   * `peginTxid`. Domain-separated from `htlcSecretHexes` and
   * `perVaultWotsKeys` via the HKDF `info` label, so revealing it does
   * not weaken the other derived secrets.
   */
  authAnchorHex: string;
}

export interface PreparePeginResult {
  /** Broadcast-ready Pre-PegIn + per-vault PegIn txs. Safe to log. */
  transaction: PreparePeginTransaction;
  /**
   * x-only depositor pubkey snapshot used end-to-end across sizing,
   * vault-root derivation, and PSBT signing. Safe to persist; not
   * sensitive. Reusing this snapshot downstream guarantees that
   * derived secrets and signed PSBTs reference the same identity.
   */
  depositorBtcPubkey: string;
  /** Sensitive derived material — see {@link PreparePeginDerivedSecrets}. */
  derivedSecrets: PreparePeginDerivedSecrets;
}


/**
 * Parameters for signing and broadcasting a transaction.
 */
export interface SignAndBroadcastParams {
  /**
   * Funded Pre-PegIn transaction hex from preparePegin().
   */
  fundedPrePeginTxHex: string;

  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix.
   * Required for Taproot signing.
   */
  depositorBtcPubkey: string;

  /**
   * Optional pre-fetched prevout data for inputs not yet in the mempool.
   * Key format: "txid:vout" (e.g. "abc123...def:0").
   * When provided, matching inputs skip the mempool API fetch.
   * Useful for split transactions where outputs are unconfirmed.
   */
  localPrevouts?: Record<string, { scriptPubKey: string; value: number }>;
}

/**
 * BIP-322 BTC Proof-of-Possession binding a depositor's BTC key to their
 * Ethereum account. Produced by {@link PeginManager.signProofOfPossession}
 * and reusable across every register call in the same session — the
 * embedded identities are re-checked at register time.
 */
export interface PopSignature {
  /** BIP-322 signature over the PoP message (0x-prefixed hex). */
  btcPopSignature: Hex;
  /** Ethereum address the PoP was signed for. */
  depositorEthAddress: Address;
  /** BTC x-only public key (64-char hex, no 0x prefix). */
  depositorBtcPubkey: string;
}

/**
 * Parameters for registering a peg-in on Ethereum.
 */
export interface RegisterPeginParams {
  /**
   * Funded, pre-witness Pre-PegIn tx hex — pass
   * {@link PreparePeginTransaction.fundedPrePeginTxHex} from
   * {@link PreparePeginResult.transaction}. The contract-side parameter
   * is named `unsignedPrePeginTx` but it stores the funded form.
   */
  unsignedPrePeginTx: string;

  /**
   * Depositor-signed PegIn transaction hex (submitted to contract; vault ID derived from this).
   */
  depositorSignedPeginTx: string;

  /**
   * Vault provider's Ethereum address.
   */
  vaultProvider: Address;

  /**
   * SHA256 hashlock for HTLC activation (bytes32 hex with 0x prefix).
   */
  hashlock: Hex;

  /**
   * Depositor's BTC payout address (e.g. bc1p..., bc1q...).
   * Converted to scriptPubKey internally via bitcoinjs-lib.
   *
   * If omitted, defaults to the connected BTC wallet's address
   * via `btcWallet.getAddress()`.
   */
  depositorPayoutBtcAddress?: string;

  /** Keccak256 hash of the depositor's WOTS public key (bytes32) */
  depositorWotsPkHash: Hex;

  /** Proof of possession from {@link PeginManager.signProofOfPossession}. */
  popSignature: PopSignature;

  /**
   * Zero-based index of the HTLC output in the Pre-PegIn transaction that
   * this PegIn spends. In a batch Pre-PegIn with N HTLC outputs, each vault
   * registration references a different htlcVout (0..N-1).
   */
  htlcVout: number;
}

/**
 * Result of registering a peg-in on Ethereum.
 */
export interface RegisterPeginResult {
  /**
   * Ethereum transaction hash for the peg-in registration.
   */
  ethTxHash: Hash;

  /**
   * Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)).
   * Used for contract reads/writes and indexer queries.
   */
  vaultId: Hex;

  /**
   * Raw Bitcoin pegin transaction hash (double-SHA256 of the signed pegin tx).
   * Used for VP RPC operations which key on the BTC transaction ID.
   */
  peginTxHash: Hex;
}

/**
 * Single request in a batch pegin registration.
 * All requests in a batch share the same vault provider, depositor BTC
 * pubkey, and Pre-PegIn transaction.
 */
export interface BatchPeginRequestItem {
  /** Signed PegIn tx hex for this vault */
  depositorSignedPeginTx: string;
  /** SHA256 hashlock for HTLC activation (bytes32 hex) */
  hashlock: Hex;
  /** Zero-based HTLC output index in the Pre-PegIn tx (unique per request) */
  htlcVout: number;
  /** Depositor's BTC payout address (required — funds are sent here on payout) */
  depositorPayoutBtcAddress: string;
  /** Keccak256 hash of the depositor's WOTS public key (bytes32) */
  depositorWotsPkHash: Hex;
}

/**
 * Parameters for registerPeginBatchOnChain.
 */
export interface RegisterPeginBatchParams {
  /** Vault provider address (shared across all vaults in batch) */
  vaultProvider: Address;
  /**
   * Funded, pre-witness Pre-PegIn tx hex — shared across every request in
   * the batch. See {@link RegisterPeginParams.unsignedPrePeginTx}.
   */
  unsignedPrePeginTx: string;
  /** Individual pegin requests (one per vault) */
  requests: BatchPeginRequestItem[];
  /** Proof of possession from {@link PeginManager.signProofOfPossession}. */
  popSignature: PopSignature;
}

/**
 * Per-vault result from a batch pegin registration.
 */
export interface BatchPeginResultItem {
  /** Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)) */
  vaultId: Hex;
  /** Raw BTC pegin transaction hash */
  peginTxHash: Hex;
}

/**
 * Result of registering a batch of pegins on Ethereum in a single transaction.
 */
export interface RegisterPeginBatchResult {
  /** Ethereum transaction hash */
  ethTxHash: Hex;
  /** Per-vault results (same order as input requests) */
  vaults: BatchPeginResultItem[];
}


/**
 * Resolve prevout data for a transaction input.
 * Checks localPrevouts first; falls back to mempool API.
 */
function resolveUtxoInfo(
  txid: string,
  vout: number,
  localPrevouts: Record<string, { scriptPubKey: string; value: number }> | undefined,
  apiUrl: string,
): Promise<UtxoInfo> {
  const local = localPrevouts?.[`${txid}:${vout}`];
  if (local) {
    return Promise.resolve({
      txid,
      vout,
      value: local.value,
      scriptPubKey: local.scriptPubKey,
    });
  }
  return getUtxoInfo(txid, vout, apiUrl);
}

/**
 * Manager for orchestrating peg-in operations.
 *
 * This manager provides a high-level API for creating peg-in transactions
 * by coordinating between SDK primitives, utilities, and wallet interfaces.
 *
 * @remarks
 * The complete peg-in flow consists of 5 steps:
 *
 * | Step | Method | Description |
 * |------|--------|-------------|
 * | 1 | {@link preparePegin} | Build Pre-PegIn HTLC, fund it, sign PegIn input |
 * | 2 | {@link signProofOfPossession} | Sign BIP-322 PoP (one per deposit session) |
 * | 3 | {@link registerPeginOnChain} | Submit to Ethereum contract |
 * | 4 | {@link signAndBroadcast} | Sign and broadcast Pre-PegIn tx to Bitcoin network |
 * | 5 | {@link PayoutManager} | Sign BOTH payout authorizations |
 *
 * **Important:** Step 5 uses {@link PayoutManager}, not this class. After
 * step 4, the vault provider observes the broadcast Pre-PegIn and prepares
 * 3 transactions per claimer:
 * - `claim_tx` - Claim transaction
 * - `assert_tx` - Assert transaction
 * - `payout_tx` - Payout transaction
 *
 * You must sign the Payout transaction for each claimer:
 * - {@link PayoutManager.signPayoutTransaction} - uses assert_tx as input reference
 *
 * Submit all signatures to the vault provider to drive the contract to
 * `VERIFIED` (and then activate by revealing the HTLC secret, which is a
 * services-layer step outside this manager).
 *
 * @see {@link PayoutManager} - Required for Step 5 (payout authorization)
 * @see {@link buildPrePeginPsbt} - Lower-level primitive for custom implementations
 * @see {@link https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md | Managers Quickstart}
 */
/**
 * Maximum time (ms) to wait for a transaction receipt before timing out.
 * Matches the prior vault-service polling timeout so users see a clear error
 * instead of an indefinite hang when a transaction is dropped from the mempool.
 */
const RECEIPT_TIMEOUT_MS = 120_000;

export class PeginManager {
  private readonly config: PeginManagerConfig;

  /**
   * Creates a new PeginManager instance.
   *
   * @param config - Manager configuration including wallets and contract addresses
   */
  constructor(config: PeginManagerConfig) {
    this.config = config;
  }

  /**
   * Prepare a peg-in: sizing pass → vault-root derivation (one wallet
   * popup) → per-vault WOTS / hashlock derivation → commit pass with
   * batch PSBT signing (one popup). Returns broadcast-ready txs, the
   * pubkey snapshot, and the sensitive derived material.
   *
   * @throws If the wallet rejects, insufficient funds, or an internal
   *         invariant violation.
   */
  async preparePegin(
    params: PreparePeginParams,
  ): Promise<PreparePeginResult> {
    if (params.amounts.length === 0) {
      throw new Error("amounts must contain at least one entry");
    }

    // Raw form for `signInputs[].publicKey` (UniSat/OKX/OneKey reject
    // x-only); x-only form for protocol/HTLC use. One snapshot binds
    // sizing, root derivation, and PSBT signing to one identity.
    const depositorBtcPubkeyRaw =
      await this.config.btcWallet.getPublicKeyHex();
    const depositorBtcPubkey = normalizeXOnlyPubkey(depositorBtcPubkeyRaw);

    // Sizing pass uses a placeholder for the auth-anchor hash because
    // the wallet popup that produces the real anchor hasn't run yet.
    // The OP_RETURN's byte length is invariant under content swap, so
    // UTXO selection and fees match the commit pass.
    const sizing = await this.prepareSizing(depositorBtcPubkey, params);

    const fundingOutpoints: FundingOutpoint[] = sizing.selectedUTXOs.map(
      (u) => ({
        txid: hexToUint8Array(u.txid),
        vout: u.vout,
      }),
    );
    const root = await deriveVaultRoot(this.config.btcWallet, {
      depositorBtcPubkey: hexToUint8Array(depositorBtcPubkey),
      fundingOutpoints,
    });

    // Take ownership of the auth anchor before per-vault expansion (which
    // zeros `root`). Convert to hex immediately, then zero the buffer.
    // `authAnchorHex` is a JS string — immutable, GC-only — and lives
    // until the result is dropped. If anything in this window throws,
    // `expandPerVaultSecrets` won't run to zero `root`, so we wipe it
    // here on the throw path.
    let authAnchorHex: string;
    let authAnchorHash: string;
    try {
      const authAnchorBytes = expandAuthAnchor(root);
      try {
        authAnchorHex = uint8ArrayToHex(authAnchorBytes);
        authAnchorHash = uint8ArrayToHex(sha256(authAnchorBytes));
      } finally {
        authAnchorBytes.fill(0);
      }
    } catch (err) {
      root.fill(0);
      throw err;
    }

    const derived = await expandPerVaultSecrets(root, params.amounts.length);
    const { perVaultWotsKeys, wotsPkHashes, htlcSecretHexes, hashlocks } =
      derived;

    const commit = await this.preparePeginCommit({
      depositorBtcPubkeyRaw,
      depositorBtcPubkey,
      hashlocks,
      authAnchorHash,
      sizing,
      params,
    });

    // Downstream consumers look up per-vault secrets by index; pin the
    // contract so a future WASM output-ordering change fails loud.
    for (let i = 0; i < commit.perVault.length; i++) {
      if (commit.perVault[i].htlcVout !== i) {
        throw new Error(
          `Internal invariant violation: htlcVout/index mismatch at vault ${i} ` +
            `(expected ${i}, got ${commit.perVault[i].htlcVout})`,
        );
      }
    }

    // Structural guarantee that the broadcast tx actually carries the
    // OP_RETURN we'll later reveal a preimage for. Without this assertion
    // a malicious WASM build could emit no OP_RETURN, the VP would still
    // issue a token (if mis-configured) on a tx with no on-chain
    // commitment, and the auth flow would degrade to a pure shared
    // secret. Fail closed.
    assertAuthAnchorOpReturn(
      commit.fundedPrePeginTxHex,
      params.amounts.length,
      authAnchorHash,
    );

    return {
      transaction: {
        ...commit,
        selectedUTXOs: sizing.selectedUTXOs,
        fee: sizing.fee,
        changeAmount: sizing.changeAmount,
      },
      depositorBtcPubkey,
      derivedSecrets: {
        perVaultWotsKeys,
        wotsPkHashes,
        htlcSecretHexes,
        authAnchorHex,
      },
    };
  }

  /**
   * Build unfunded Pre-PegIn + select UTXOs. No PSBT signing.
   *
   * Returns the full selection result (UTXOs, fee, changeAmount) so the
   * commit pass funds the broadcast tx with the exact same set used to
   * build the vault-context funding-outpoints commitment. Re-running
   * `selectUtxosForPegin` in the commit pass would be deterministic given
   * the same inputs, but threading the result through guarantees the
   * domain separator structurally matches the funded tx inputs.
   *
   * Sizing runs before the wallet popup, so neither the real per-vault
   * hashlocks nor the real `authAnchorHash` are known yet. Both slots
   * are filled with a 32-byte placeholder; the commit pass swaps in the
   * real values. Output budget is identical (32-byte push regardless of
   * content), so UTXO selection is invariant under substitution.
   */
  private async prepareSizing(
    depositorBtcPubkey: string,
    params: PreparePeginParams,
  ): Promise<{ selectedUTXOs: UTXO[]; fee: bigint; changeAmount: bigint }> {
    const placeholderHashlocks = params.amounts.map(
      () => SIZING_PASS_PLACEHOLDER_BYTES32_HEX,
    );
    const numLocalChallengers = params.vaultKeeperBtcPubkeys.length;

    const prePegin = await buildPrePeginPsbt({
      depositorPubkey: depositorBtcPubkey,
      vaultProviderPubkey: stripHexPrefix(params.vaultProviderBtcPubkey),
      vaultKeeperPubkeys: params.vaultKeeperBtcPubkeys.map(stripHexPrefix),
      universalChallengerPubkeys:
        params.universalChallengerBtcPubkeys.map(stripHexPrefix),
      hashlocks: placeholderHashlocks,
      timelockRefund: params.timelockRefund,
      pegInAmounts: params.amounts,
      feeRate: params.protocolFeeRate,
      numLocalChallengers,
      councilQuorum: params.councilQuorum,
      councilSize: params.councilSize,
      network: this.config.btcNetwork,
      authAnchorHash: SIZING_PASS_PLACEHOLDER_BYTES32_HEX,
    });

    const selection = selectUtxosForPegin(
      [...params.availableUTXOs],
      prePegin.totalOutputValue,
      params.mempoolFeeRate,
      peginOutputCount(
        prePegin.htlcValues.length,
        SIZING_PASS_PLACEHOLDER_BYTES32_HEX,
      ),
    );

    return {
      selectedUTXOs: selection.selectedUTXOs,
      fee: selection.fee,
      changeAmount: selection.changeAmount,
    };
  }

  /** Build PegIn txs and batch-sign their inputs with real hashlocks. */
  private async preparePeginCommit(args: {
    depositorBtcPubkeyRaw: string;
    depositorBtcPubkey: string;
    hashlocks: readonly string[];
    authAnchorHash: string;
    sizing: { selectedUTXOs: UTXO[]; fee: bigint; changeAmount: bigint };
    params: PreparePeginParams;
  }): Promise<{
    fundedPrePeginTxHex: string;
    prePeginTxid: string;
    perVault: PerVaultPeginData[];
  }> {
    const {
      depositorBtcPubkeyRaw,
      depositorBtcPubkey,
      hashlocks,
      authAnchorHash,
      sizing,
      params,
    } = args;

    // Refuse to build the broadcast tx if the orchestrator forgot to
    // substitute real values for the sizing-pass placeholder. A
    // placeholder-zero hashlock would produce an HTLC that no real
    // preimage can spend; a placeholder-zero auth anchor would let
    // the depositor reveal a known-public preimage to the VP. Fail
    // before signing, not after broadcast.
    const placeholderLower = SIZING_PASS_PLACEHOLDER_BYTES32_HEX.toLowerCase();
    for (let i = 0; i < hashlocks.length; i++) {
      if (hashlocks[i].toLowerCase() === placeholderLower) {
        throw new Error(
          `preparePeginCommit refusing to build with sizing-pass placeholder ` +
            `hashlock at vault ${i} — internal substitution bug`,
        );
      }
    }
    if (authAnchorHash.toLowerCase() === placeholderLower) {
      throw new Error(
        `preparePeginCommit refusing to build with sizing-pass placeholder ` +
          `auth-anchor hash — internal substitution bug`,
      );
    }

    const vaultProviderBtcPubkey = stripHexPrefix(params.vaultProviderBtcPubkey);
    const vaultKeeperBtcPubkeys = params.vaultKeeperBtcPubkeys.map(stripHexPrefix);
    const universalChallengerBtcPubkeys =
      params.universalChallengerBtcPubkeys.map(stripHexPrefix);
    const numLocalChallengers = vaultKeeperBtcPubkeys.length;

    const prePeginParams: PrePeginParams = {
      depositorPubkey: depositorBtcPubkey,
      vaultProviderPubkey: vaultProviderBtcPubkey,
      vaultKeeperPubkeys: vaultKeeperBtcPubkeys,
      universalChallengerPubkeys: universalChallengerBtcPubkeys,
      hashlocks,
      timelockRefund: params.timelockRefund,
      pegInAmounts: params.amounts,
      feeRate: params.protocolFeeRate,
      numLocalChallengers,
      councilQuorum: params.councilQuorum,
      councilSize: params.councilSize,
      network: this.config.btcNetwork,
      authAnchorHash,
    };

    const prePeginResult = await buildPrePeginPsbt(prePeginParams);

    const network = getNetwork(this.config.btcNetwork);
    const fundedPrePeginTxHex = fundPeginTransaction({
      unfundedTxHex: prePeginResult.psbtHex,
      selectedUTXOs: sizing.selectedUTXOs,
      changeAddress: params.changeAddress,
      changeAmount: sizing.changeAmount,
      network,
    });

    const prePeginTxid = stripHexPrefix(calculateBtcTxHash(fundedPrePeginTxHex));

    const peginTxResults: Array<{
      txHex: string;
      txid: string;
      vaultScriptPubKey: string;
    }> = [];
    const psbtsToSign: string[] = [];
    const signOptions: SignPsbtOptions[] = [];

    for (let i = 0; i < hashlocks.length; i++) {
      const peginTxResult = await buildPeginTxFromFundedPrePegin({
        prePeginParams,
        timelockPegin: params.timelockPegin,
        fundedPrePeginTxHex,
        htlcVout: i,
      });

      const peginInputPsbtResult = await buildPeginInputPsbt({
        peginTxHex: peginTxResult.txHex,
        fundedPrePeginTxHex,
        depositorPubkey: depositorBtcPubkey,
        vaultProviderPubkey: vaultProviderBtcPubkey,
        vaultKeeperPubkeys: vaultKeeperBtcPubkeys,
        universalChallengerPubkeys: universalChallengerBtcPubkeys,
        hashlock: hashlocks[i],
        timelockRefund: params.timelockRefund,
        network: this.config.btcNetwork,
      });

      peginTxResults.push(peginTxResult);
      psbtsToSign.push(peginInputPsbtResult.psbtHex);
      signOptions.push(
        createTaprootScriptPathSignOptions(depositorBtcPubkeyRaw, 1),
      );
    }

    const signedPsbts = await signPsbtsWithFallback(
      this.config.btcWallet,
      psbtsToSign,
      signOptions,
    );

    const perVault: PerVaultPeginData[] = [];
    for (let i = 0; i < signedPsbts.length; i++) {
      const peginInputSignature = extractPeginInputSignature(
        signedPsbts[i],
        depositorBtcPubkey,
      );

      const depositorSignedPeginTxHex = finalizePeginInputPsbt(signedPsbts[i]);

      perVault.push({
        htlcVout: i,
        htlcValue: prePeginResult.htlcValues[i],
        peginTxHex: depositorSignedPeginTxHex,
        peginTxid: peginTxResults[i].txid,
        peginInputSignature,
        vaultScriptPubKey: peginTxResults[i].vaultScriptPubKey,
      });
    }

    return {
      fundedPrePeginTxHex,
      prePeginTxid,
      perVault,
    };
  }


  /**
   * Signs and broadcasts a funded peg-in transaction to the Bitcoin network.
   *
   * This method:
   * 1. Parses the funded transaction hex
   * 2. Fetches UTXO data from mempool for each input
   * 3. Creates a PSBT with proper witnessUtxo/tapInternalKey
   * 4. Signs via btcWallet.signPsbt()
   * 5. Finalizes and extracts the transaction
   * 6. Broadcasts via mempool API
   *
   * @param params - Transaction hex and depositor public key
   * @returns The broadcasted Bitcoin transaction ID
   * @throws Error if signing or broadcasting fails
   */
  async signAndBroadcast(params: SignAndBroadcastParams): Promise<string> {
    const { fundedPrePeginTxHex, depositorBtcPubkey } = params;

    // Step 1: Parse the funded transaction
    const cleanHex = fundedPrePeginTxHex.startsWith("0x")
      ? fundedPrePeginTxHex.slice(2)
      : fundedPrePeginTxHex;
    const tx = Transaction.fromHex(cleanHex);

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Step 2: Create PSBT and add inputs with UTXO data from mempool
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    const publicKeyNoCoord = Buffer.from(
      normalizeXOnlyPubkey(depositorBtcPubkey),
      "hex",
    );
    const apiUrl = this.config.mempoolApiUrl;

    // Resolve prevout data for each input (local cache or mempool API)
    const utxoDataPromises = tx.ins.map((input) => {
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      const vout = input.index;
      return resolveUtxoInfo(txid, vout, params.localPrevouts, apiUrl).then(
        (utxoData) => ({ input, utxoData, txid, vout }),
      );
    });

    const inputsWithUtxoData = await Promise.all(utxoDataPromises);

    // Cross-validate: total input value must cover total output value.
    // A mismatch indicates the mempool API returned manipulated UTXO data,
    // which could lead to fee-siphoning or invalid signatures.
    const totalInputValue = inputsWithUtxoData.reduce(
      (sum, i) => sum + BigInt(i.utxoData.value),
      0n,
    );
    const totalOutputValue = tx.outs.reduce(
      (sum, out) => sum + BigInt(out.value),
      0n,
    );
    if (totalInputValue < totalOutputValue) {
      throw new Error(
        `UTXO value mismatch: total input value (${totalInputValue} sat) is less than ` +
          `total output value (${totalOutputValue} sat). ` +
          `This may indicate the mempool API returned manipulated UTXO data.`,
      );
    }

    const impliedFee = totalInputValue - totalOutputValue;
    if (impliedFee > MAX_REASONABLE_FEE_SATS) {
      throw new Error(
        `Implied transaction fee (${impliedFee} sat) exceeds maximum reasonable fee ` +
          `(${MAX_REASONABLE_FEE_SATS} sat). This may indicate manipulated UTXO data.`,
      );
    }

    // Add inputs with proper PSBT fields based on script type
    for (const { input, utxoData, txid, vout } of inputsWithUtxoData) {
      const psbtInputFields = getPsbtInputFields(
        {
          txid,
          vout,
          value: utxoData.value,
          scriptPubKey: utxoData.scriptPubKey,
        },
        publicKeyNoCoord,
      );

      psbt.addInput({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        ...psbtInputFields,
      });
    }

    // Step 3: Add outputs
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    // Step 4: Sign PSBT via wallet
    const signedPsbtHex = await this.config.btcWallet.signPsbt(psbt.toHex());
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Step 5: Finalize and extract transaction
    try {
      signedPsbt.finalizeAllInputs();
    } catch (e) {
      // Some wallets (e.g. UniSat, OKX) auto-finalize PSBTs before returning them.
      // Attempting to finalize again throws, which is expected and safe to skip —
      // but verify the wallet actually finalized all inputs.
      const allFinalized = signedPsbt.data.inputs.every(
        (inp) => inp.finalScriptWitness || inp.finalScriptSig,
      );
      if (!allFinalized) {
        throw new Error(
          `PSBT finalization failed and wallet did not auto-finalize: ${e}`,
        );
      }
    }

    const signedTxHex = signedPsbt.extractTransaction().toHex();

    // Step 6: Broadcast to Bitcoin network
    const btcTxid = await pushTx(signedTxHex, apiUrl);

    return btcTxid;
  }

  /**
   * Registers a peg-in on Ethereum by calling the BTCVaultRegistry contract.
   *
   * This method:
   * 1. Re-verifies the PopSignature against the currently connected ETH
   *    and BTC wallets — refuses to proceed if either has changed
   * 2. Derives vault ID and checks if it already exists (pre-flight)
   * 3. Encodes the contract call using viem
   * 4. Estimates gas (catches contract errors early with proper revert
   *    reasons)
   * 5. Sends transaction with pre-estimated gas via
   *    ethWallet.sendTransaction()
   *
   * The PopSignature must be obtained via
   * {@link signProofOfPossession} before this call.
   *
   * @param params - Registration parameters including the PopSignature
   *                 and the prepared Pre-PegIn / PegIn transactions
   * @returns Result containing Ethereum transaction hash and vault ID
   * @throws Error if the PopSignature does not match the connected wallets
   * @throws Error if the vault already exists
   * @throws Error if contract simulation fails (e.g., invalid signature,
   *         unauthorized)
   */
  async registerPeginOnChain(
    params: RegisterPeginParams,
  ): Promise<RegisterPeginResult> {
    const {
      unsignedPrePeginTx,
      depositorSignedPeginTx,
      vaultProvider,
      hashlock,
      htlcVout,
      depositorPayoutBtcAddress,
      depositorWotsPkHash,
      popSignature,
    } = params;

    // Step 1: Re-verify the PoP artifact against the currently connected
    // wallets so a mid-flow account/wallet switch fails here instead of
    // surfacing downstream as an opaque contract revert.
    if (!this.config.ethWallet.account) {
      throw new Error("Ethereum wallet account not found");
    }
    const depositorEthAddress = this.config.ethWallet.account.address;
    if (!isAddressEqual(popSignature.depositorEthAddress, depositorEthAddress)) {
      throw new Error(
        `Proof of possession was signed for ${popSignature.depositorEthAddress} ` +
          `but the Ethereum wallet is currently connected to ${depositorEthAddress}. ` +
          `Reconnect the original account or call signProofOfPossession() again.`,
      );
    }
    await this.assertPopMatchesBtcWallet(popSignature);
    const btcPopSignature = popSignature.btcPopSignature;

    // Step 2: Format parameters for contract call
    const depositorBtcPubkeyHex = ensureHexPrefix(popSignature.depositorBtcPubkey);
    const unsignedPrePeginTxHex = ensureHexPrefix(unsignedPrePeginTx);
    const depositorSignedPeginTxHex = ensureHexPrefix(depositorSignedPeginTx);

    const payoutScriptPubKey = await this.resolvePayoutScriptPubKey(
      depositorPayoutBtcAddress,
    );

    // Step 3: Calculate pegin tx hash and derive vault ID, then check if it already exists
    const peginTxHash = calculateBtcTxHash(depositorSignedPeginTxHex);
    const derivedVaultIdHex = await deriveVaultId(
      stripHexPrefix(peginTxHash),
      stripHexPrefix(depositorEthAddress),
    );
    const vaultId = ensureHexPrefix(derivedVaultIdHex) as Hex;
    const exists = await this.checkVaultExists(vaultId);

    if (exists) {
      throw new Error(
        `Vault already exists (ID: ${vaultId}, peginTxHash: ${peginTxHash}). ` +
          `Vault IDs are derived from the pegin transaction hash and depositor address. ` +
          `To create a new vault, use different UTXOs or a different amount to generate a unique transaction.`,
      );
    }

    // Step 4: Query required pegin fee from the contract
    const publicClient = createPublicClient({
      chain: this.config.ethChain,
      transport: http(),
    });

    let peginFee: bigint;
    try {
      peginFee = (await publicClient.readContract({
        address: this.config.vaultContracts.btcVaultRegistry,
        abi: BTCVaultRegistryABI,
        functionName: "getPegInFee",
        args: [vaultProvider],
      })) as bigint;
    } catch {
      throw new Error(
        "Failed to query pegin fee from the contract. " +
          "Please check your network connection and that the contract address is correct.",
      );
    }

    // Step 5: Encode the contract call data
    const callData = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "submitPeginRequest",
      args: [
        depositorEthAddress,
        depositorBtcPubkeyHex,
        btcPopSignature,
        unsignedPrePeginTxHex,
        depositorSignedPeginTxHex,
        vaultProvider,
        hashlock,
        htlcVout,
        payoutScriptPubKey,
        depositorWotsPkHash,
      ],
    });

    // Step 6: Estimate gas first to catch contract errors before showing wallet popup
    // This ensures users see actual contract revert reasons instead of gas errors
    // The gas estimate is then passed to sendTransaction to avoid double estimation
    let gasEstimate: bigint;
    try {
      gasEstimate = await publicClient.estimateGas({
        to: this.config.vaultContracts.btcVaultRegistry,
        data: callData,
        value: peginFee,
        account: this.config.ethWallet.account.address,
      });
    } catch (error) {
      // Estimation failed - handle contract error with actual revert reason
      handleContractError(error); // always throws (return type: never)
    }

    // Step 7: Submit peg-in request to contract (estimation passed)
    let ethTxHash: Hex;
    try {
      // Send transaction with pre-estimated gas to skip internal estimation
      // Note: viem's sendTransaction uses `gas`, not `gasLimit`
      ethTxHash = await this.config.ethWallet.sendTransaction({
        to: this.config.vaultContracts.btcVaultRegistry,
        data: callData,
        value: peginFee,
        account: this.config.ethWallet.account,
        chain: this.config.ethChain,
        gas: gasEstimate,
      });
    } catch (error) {
      // Use proper error handler for better error messages
      handleContractError(error); // always throws (return type: never)
    }

    // Step 8: Wait for transaction receipt and verify it was not reverted
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: ethTxHash,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    if (receipt.status === "reverted") {
      handleContractError(
        new Error(
          `Transaction reverted. Hash: ${ethTxHash}. ` +
            `Check the transaction on block explorer for details.`,
        ),
      );
    }

    return {
      ethTxHash: receipt.transactionHash,
      vaultId,
      peginTxHash,
    };
  }

  /**
   * Register multiple pegins on Ethereum in a single transaction.
   *
   * Uses the contract's submitPeginRequestBatch() to submit all vault
   * registrations atomically. All vaults must share the same vault provider.
   * The PoP signature is signed once and included in each request.
   *
   * @param params - Batch registration parameters
   * @returns Batch result with per-vault IDs and single ETH tx hash
   */
  async registerPeginBatchOnChain(
    params: RegisterPeginBatchParams,
  ): Promise<RegisterPeginBatchResult> {
    const { vaultProvider, unsignedPrePeginTx, requests, popSignature } =
      params;

    if (requests.length === 0) {
      throw new Error("Batch pegin requires at least one request");
    }

    // Step 1: Re-verify the PoP (same reasoning as registerPeginOnChain).
    if (!this.config.ethWallet.account) {
      throw new Error("Ethereum wallet account not found");
    }
    const depositorEthAddress = this.config.ethWallet.account.address;
    if (!isAddressEqual(popSignature.depositorEthAddress, depositorEthAddress)) {
      throw new Error(
        `Proof of possession was signed for ${popSignature.depositorEthAddress} ` +
          `but the Ethereum wallet is currently connected to ${depositorEthAddress}. ` +
          `Reconnect the original account or call signProofOfPossession() again.`,
      );
    }
    await this.assertPopMatchesBtcWallet(popSignature);
    const btcPopSignature = popSignature.btcPopSignature;

    // Step 2: Resolve per-request payout scriptPubKey.
    const resolvedPayoutScripts: Hex[] = [];
    for (const req of requests) {
      resolvedPayoutScripts.push(
        await this.resolvePayoutScriptPubKey(req.depositorPayoutBtcAddress),
      );
    }

    // Step 3: Pre-compute vault IDs and check for duplicates
    const vaultResults: BatchPeginResultItem[] = [];
    for (const req of requests) {
      const depositorSignedPeginTxHex = ensureHexPrefix(
        req.depositorSignedPeginTx,
      );
      const peginTxHash = calculateBtcTxHash(depositorSignedPeginTxHex);
      const derivedVaultIdHex = await deriveVaultId(
        stripHexPrefix(peginTxHash),
        stripHexPrefix(depositorEthAddress),
      );
      const vaultId = ensureHexPrefix(derivedVaultIdHex) as Hex;
      const exists = await this.checkVaultExists(vaultId);
      if (exists) {
        throw new Error(
          `Vault already exists (ID: ${vaultId}, peginTxHash: ${peginTxHash}). ` +
            `To create a new vault, use different UTXOs or a different amount.`,
        );
      }
      vaultResults.push({ vaultId, peginTxHash });
    }

    // Step 4: Query pegin fee and compute total
    const publicClient = createPublicClient({
      chain: this.config.ethChain,
      transport: http(),
    });

    let peginFee: bigint;
    try {
      peginFee = (await publicClient.readContract({
        address: this.config.vaultContracts.btcVaultRegistry,
        abi: BTCVaultRegistryABI,
        functionName: "getPegInFee",
        args: [vaultProvider],
      })) as bigint;
    } catch {
      throw new Error(
        "Failed to query pegin fee from the contract. " +
          "Please check your network connection and that the contract address is correct.",
      );
    }
    const totalFee = peginFee * BigInt(requests.length);

    // Step 5: Build BatchPeginRequest[] tuple array. Depositor BTC pubkey,
    // PoP, and Pre-PegIn tx hex are shared across the batch (carried on
    // the top-level params / PopSignature, not per request).
    const depositorBtcPubkeyHex = ensureHexPrefix(
      popSignature.depositorBtcPubkey,
    ) as Hex;
    const unsignedPrePeginTxHex = ensureHexPrefix(unsignedPrePeginTx) as Hex;
    const batchRequests = requests.map((req, i) => ({
      depositorBtcPubKey: depositorBtcPubkeyHex,
      btcPopSignature,
      unsignedPrePeginTx: unsignedPrePeginTxHex,
      depositorSignedPeginTx: ensureHexPrefix(
        req.depositorSignedPeginTx,
      ) as Hex,
      hashlock: req.hashlock,
      htlcVout: req.htlcVout,
      referralCode: NO_REFERRAL_CODE,
      depositorPayoutBtcAddress: resolvedPayoutScripts[i],
      depositorWotsPkHash: req.depositorWotsPkHash,
    }));

    // Step 6: Encode batch call data
    const callData = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "submitPeginRequestBatch",
      args: [depositorEthAddress, vaultProvider, batchRequests],
    });

    // Step 7: Estimate gas
    let gasEstimate: bigint;
    try {
      gasEstimate = await publicClient.estimateGas({
        to: this.config.vaultContracts.btcVaultRegistry,
        data: callData,
        value: totalFee,
        account: this.config.ethWallet.account.address,
      });
    } catch (error) {
      handleContractError(error); // always throws (return type: never)
    }

    // Step 8: Submit batch transaction
    let ethTxHash: Hex;
    try {
      ethTxHash = await this.config.ethWallet.sendTransaction({
        to: this.config.vaultContracts.btcVaultRegistry,
        data: callData,
        value: totalFee,
        account: this.config.ethWallet.account,
        chain: this.config.ethChain,
        gas: gasEstimate,
      });
    } catch (error) {
      handleContractError(error); // always throws (return type: never)
    }

    // Step 9: Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: ethTxHash,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    if (receipt.status === "reverted") {
      handleContractError(
        new Error(
          `Batch transaction reverted. Hash: ${ethTxHash}. ` +
            `Check the transaction on block explorer for details.`,
        ),
      );
    }

    return {
      ethTxHash: receipt.transactionHash,
      vaults: vaultResults,
    };
  }

  /**
   * Check if a vault already exists for a given vault ID.
   *
   * @param vaultId - The Bitcoin transaction hash (vault ID)
   * @returns True if vault exists, false otherwise
   */
  private async checkVaultExists(vaultId: Hex): Promise<boolean> {
    try {
      // Create a public client to read from the contract
      const publicClient = createPublicClient({
        chain: this.config.ethChain,
        transport: http(),
      });

      const result = (await publicClient.readContract({
        address: this.config.vaultContracts.btcVaultRegistry,
        abi: BTCVaultRegistryABI,
        functionName: "getBtcVaultBasicInfo",
        args: [vaultId],
      })) as { depositor: Address };

      return result.depositor !== zeroAddress;
    } catch {
      // If reading fails, assume vault doesn't exist and let contract handle it
      return false;
    }
  }

  /**
   * Resolve the BTC payout address to a scriptPubKey hex for the contract.
   *
   * If a payout address is provided, converts it directly.
   * If omitted, uses the wallet's address and validates it against the
   * wallet's public key to guard against a compromised wallet provider.
   */
  private async resolvePayoutScriptPubKey(
    depositorPayoutBtcAddress?: string,
  ): Promise<Hex> {
    let address: string;

    if (depositorPayoutBtcAddress) {
      address = depositorPayoutBtcAddress;
    } else {
      address = await this.config.btcWallet.getAddress();
      const walletPubkey = await this.config.btcWallet.getPublicKeyHex();
      if (
        !isAddressFromPublicKey(
          address,
          walletPubkey,
          this.config.btcNetwork,
        )
      ) {
        throw new Error(
          "The BTC address from your wallet does not match the wallet's public key. " +
            "Please ensure your wallet is using a supported address type (Taproot or Native SegWit).",
        );
      }
    }

    const network = getNetwork(this.config.btcNetwork);
    try {
      return `0x${bitcoin.address.toOutputScript(address, network).toString("hex")}` as Hex;
    } catch {
      throw new Error(
        `Invalid BTC payout address: "${address}". ` +
          `Please provide a valid Bitcoin address for the ${this.config.btcNetwork} network.`,
      );
    }
  }

  /**
   * Sign a BIP-322 BTC Proof-of-Possession binding the connected BTC
   * wallet to the connected ETH account for this chain and vault
   * registry. The returned {@link PopSignature} can be reused across
   * every register call in the same session.
   */
  async signProofOfPossession(): Promise<PopSignature> {
    if (!this.config.ethWallet.account) {
      throw new Error("Ethereum wallet account not found");
    }
    const depositorEthAddress = this.config.ethWallet.account.address;

    const depositorBtcPubkey = normalizeXOnlyPubkey(
      await this.config.btcWallet.getPublicKeyHex(),
    );

    // Message format matches BTCProofOfPossession.sol buildMessage()
    const verifyingContract = this.config.vaultContracts.btcVaultRegistry;
    const popMessage = `${depositorEthAddress.toLowerCase()}:${this.config.ethChain.id}:pegin:${verifyingContract.toLowerCase()}`;
    const raw = await this.config.btcWallet.signMessage(
      popMessage,
      "bip322-simple",
    );

    return {
      btcPopSignature: normalizePopSignature(raw),
      depositorEthAddress,
      depositorBtcPubkey,
    };
  }

  private async assertPopMatchesBtcWallet(
    popSignature: PopSignature,
  ): Promise<void> {
    const currentBtcPubkey = normalizeXOnlyPubkey(
      await this.config.btcWallet.getPublicKeyHex(),
    );
    // Normalize the PoP-embedded key the same way in case a consumer
    // serialized it through a path that changed casing or re-added 0x.
    const popBtcPubkey = normalizeXOnlyPubkey(popSignature.depositorBtcPubkey);
    if (currentBtcPubkey !== popBtcPubkey) {
      throw new Error(
        `Proof of possession was signed with BTC pubkey ${popBtcPubkey} ` +
          `but the BTC wallet is currently connected to ${currentBtcPubkey}. ` +
          `Reconnect the original wallet or call signProofOfPossession() again.`,
      );
    }
  }

  /**
   * Gets the configured Bitcoin network.
   *
   * @returns The Bitcoin network (mainnet, testnet, signet, regtest)
   */
  getNetwork(): Network {
    return this.config.btcNetwork;
  }

  /**
   * Gets the configured BTCVaultRegistry contract address.
   *
   * @returns The Ethereum address of the BTCVaultRegistry contract
   */
  getVaultContractAddress(): Address {
    return this.config.vaultContracts.btcVaultRegistry;
  }
}
