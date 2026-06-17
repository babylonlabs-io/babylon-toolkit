/**
 * Vault Refund Service — thin adapter over the SDK's `buildAndBroadcastRefund`.
 *
 * When a vault expires (ack_timeout, proof_timeout, or activation_timeout),
 * the depositor can reclaim their BTC from the Pre-PegIn HTLC output after
 * timelockRefund Bitcoin blocks have passed, using the refund script (leaf 1).
 *
 * Protocol logic (fee math, PSBT build, sign options, finalize, BIP68 error
 * mapping) lives in the SDK. This adapter pre-fetches the mempool fee rate
 * and provides the transport-specific callbacks for reads (on-chain +
 * indexer), signing, and broadcast.
 */

import type { SignPsbtOptions } from "@babylonlabs-io/ts-sdk/shared";
import {
  getNetworkFees,
  getSortedXOnlyPubkeys,
  processPublicKeyToXOnly,
  pushTx,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  buildAndBroadcastRefund,
  type RefundPrePeginContext,
  type VaultBatchEntry,
  type VaultRefundData,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Address, Hex } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { fetchHtlcSpend } from "../../clients/btc/outspend";
import { getVaultFromChain } from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";
import { COPY } from "../../copy";

import { fetchVaultProviderById } from "./fetchVaultProviders";
import { fetchVaultIdsByDepositor, fetchVaultRefundData } from "./fetchVaults";

export interface BroadcastRefundParams {
  vaultId: Hex;
  /**
   * Connected wallet's Ethereum address. Cross-checked against the
   * vault's on-chain `depositor` before sibling discovery — refund
   * refuses if the user has a vault loaded that doesn't belong to the
   * connected wallet (a mid-flow wallet swap or a stale modal).
   * Sibling enumeration itself uses the *on-chain* depositor as the
   * authoritative source, not this parameter.
   */
  depositorAddress: Address;
  btcWalletProvider: {
    signPsbt: (psbtHex: string, options?: SignPsbtOptions) => Promise<string>;
  };
  depositorBtcPubkey: string;
  feeRate: number;
  signal?: AbortSignal;
}

export interface RefundPreview {
  amountSats: bigint;
  /**
   * Mempool's halfHourFee, or null if the fee endpoint failed. Vault data
   * loads independently — a fee fetch failure must not block the refund.
   */
  halfHourFeeSatsVb: number | null;
  /**
   * Whether the Pre-PegIn transaction is present on Bitcoin. `false` means
   * the refund has no HTLC output to spend (the Pre-PegIn never reached the
   * network) — the caller should surface "nothing to refund" rather than
   * letting the user sign a doomed transaction. See {@link isPrePeginOnChain}.
   */
  prePeginOnChain: boolean;
}

/** Timeout for the Pre-PegIn existence probe — well under the modal's UX budget. */
const PREPEGIN_PROBE_TIMEOUT_MS = 10_000;

/**
 * Probe whether the Pre-PegIn transaction exists on Bitcoin.
 *
 * The refund spends the Pre-PegIn HTLC output; if the Pre-PegIn never
 * reached the network (never broadcast, or broadcast and evicted before
 * confirming) there is no HTLC to spend and the refund would fail at
 * broadcast. A mempool `/tx` lookup is the authoritative signal — on-chain
 * `verifiedAt`/status cannot distinguish "never broadcast" from "broadcast
 * but the vault provider never verified it" (both leave `verifiedAt = 0`).
 *
 * Returns `false` only on a definitive HTTP 404. Any other outcome — 2xx,
 * other status (e.g. a geo-fenced 403), network error, timeout — returns
 * `true`: a flaky or restricted mempool must never block a legitimate
 * refund of genuinely locked BTC.
 */
async function isPrePeginOnChain(
  prePeginTxHash: string,
  mempoolApiUrl: string,
): Promise<boolean> {
  const txid = stripHexPrefix(prePeginTxHash);
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PREPEGIN_PROBE_TIMEOUT_MS,
  );
  try {
    // Raw fetch, not the SDK getTxInfo: getTxInfo collapses every non-2xx
    // into one opaque error, but here we need the exact status — only a
    // definitive 404 means "not on chain".
    const response = await fetch(`${mempoolApiUrl}/tx/${txid}`, {
      signal: controller.signal,
    });
    return response.status !== 404;
  } catch {
    return true;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getRefundPreview(vaultId: Hex): Promise<RefundPreview> {
  const mempoolApiUrl = getMempoolApiUrl();
  // The fee fetch doesn't depend on vault data — start it now so it overlaps
  // readTargetVault. The Pre-PegIn probe needs the on-chain prePeginTxHash,
  // so it can only start once readTargetVault resolves.
  const feePromise = getNetworkFees(mempoolApiUrl).catch(() => null);
  const target = await readTargetVault(vaultId);
  const [feeRecommendation, prePeginOnChain] = await Promise.all([
    feePromise,
    isPrePeginOnChain(target.onChainVault.prePeginTxHash, mempoolApiUrl),
  ]);
  return {
    amountSats: target.onChainVault.amount,
    halfHourFeeSatsVb:
      feeRecommendation && feeRecommendation.halfHourFee > 0
        ? feeRecommendation.halfHourFee
        : null,
    prePeginOnChain,
  };
}

interface TargetVaultData {
  onChainVault: Awaited<ReturnType<typeof getVaultFromChain>>;
  unsignedPrePeginTx: Hex;
  depositorBtcPubkey: Hex;
}

/**
 * Read the target vault's on-chain + indexer data without doing sibling
 * discovery. Shared by the refund-preview path (which only needs amount)
 * and the broadcast path (which then derives the full sibling batch).
 */
async function readTargetVault(vaultId: Hex): Promise<TargetVaultData> {
  // Signing-critical fields come from the on-chain contract — a compromised
  // indexer could otherwise substitute a different signer set, amount, or
  // transaction. From the indexer we pull only the Pre-PegIn tx hex (not
  // stored on-chain) and the depositor's BTC pubkey (overridden by the
  // caller's wallet key before signing). The amount comes from the contract.
  // The Pre-PegIn tx hex is validated against the on-chain prePeginTxHash.
  const [onChainVault, indexerRefundData] = await Promise.all([
    getVaultFromChain(vaultId),
    fetchVaultRefundData(vaultId),
  ]);
  if (!indexerRefundData) {
    throw new Error(`Vault ${vaultId} not found`);
  }

  // Validate that the indexer-provided Pre-PegIn tx matches the on-chain hash.
  // The tx hash commits to all inputs and outputs, so a substituted transaction
  // would produce a different hash. SegWit txid excludes witness data, so
  // hash(unsignedTx) === hash(signedTx) === prePeginTxHash.
  const computedTxHash = calculateBtcTxHash(
    indexerRefundData.unsignedPrePeginTx,
  );
  if (
    computedTxHash.toLowerCase() !== onChainVault.prePeginTxHash.toLowerCase()
  ) {
    throw new Error(
      `Pre-PegIn transaction hash mismatch: computed ${computedTxHash} from indexer tx, ` +
        `but on-chain contract has ${onChainVault.prePeginTxHash}. ` +
        `Aborting refund to prevent potential attack.`,
    );
  }

  return {
    onChainVault,
    unsignedPrePeginTx: indexerRefundData.unsignedPrePeginTx,
    depositorBtcPubkey: indexerRefundData.depositorBtcPubkey,
  };
}

/**
 * Discover and validate the full vout-ordered HTLC vector for the
 * funded Pre-PegIn that this vault belongs to.
 *
 * For a single-vault deposit the returned batch is length 1. For a
 * batched deposit (e.g. an Aave split that committed two vaults to one
 * Pre-PegIn) every sibling sharing the target's `prePeginTxHash` is
 * pulled from chain so the WASM refund template can be reconstructed
 * with the exact (hashlocks, amounts) vector the funded tx commits to.
 *
 * Sibling membership is decided by on-chain `prePeginTxHash` equality,
 * not by indexer hex comparison — that way a stale or compromised
 * indexer cannot fabricate or drop siblings. The indexer is only used
 * to enumerate vault IDs (via the lean `id`-only projection so a
 * malformed unrelated field on a sibling row cannot silently shrink
 * the batch); each candidate's authoritative hashlock / htlcVout /
 * amount comes from the contract.
 *
 * Enumeration uses the **on-chain** depositor of the target vault, not
 * the connected wallet. The connected wallet's address is treated as a
 * sanity input: if it disagrees with the on-chain depositor (e.g. the
 * user has a stale modal open after switching wallets), refund refuses
 * with a clear error rather than silently looking up siblings in the
 * wrong wallet's vault list.
 */
async function discoverBatch(
  target: TargetVaultData,
  targetVaultId: Hex,
  connectedDepositorAddress: Address,
): Promise<ReadonlyArray<VaultBatchEntry>> {
  const onChainDepositor = target.onChainVault.depositor;
  if (
    onChainDepositor.toLowerCase() !== connectedDepositorAddress.toLowerCase()
  ) {
    throw new Error(
      `Vault ${targetVaultId} is owned by ${onChainDepositor}, but the ` +
        `connected wallet is ${connectedDepositorAddress}. Connect with ` +
        `the depositor wallet to refund this vault.`,
    );
  }

  const targetPrePeginTxHash = target.onChainVault.prePeginTxHash.toLowerCase();
  // Use the on-chain depositor (not the parameter) as the enumeration
  // source. They're equal here by the assertion above, but the on-chain
  // value is the authoritative one to thread into the indexer query.
  const depositorVaultIds = await fetchVaultIdsByDepositor(onChainDepositor);

  const targetIdLower = targetVaultId.toLowerCase();
  const candidateIds = depositorVaultIds.filter(
    (id) => id.toLowerCase() !== targetIdLower,
  );

  const candidateOnChain = await Promise.all(
    candidateIds.map((id) => getVaultFromChain(id)),
  );

  const siblings: VaultBatchEntry[] = [
    {
      hashlock: target.onChainVault.hashlock,
      amount: target.onChainVault.amount,
      htlcVout: target.onChainVault.htlcVout,
    },
  ];
  for (let i = 0; i < candidateIds.length; i++) {
    const sib = candidateOnChain[i];
    if (sib.prePeginTxHash.toLowerCase() !== targetPrePeginTxHash) continue;
    siblings.push({
      hashlock: sib.hashlock,
      amount: sib.amount,
      htlcVout: sib.htlcVout,
    });
  }

  siblings.sort((a, b) => a.htlcVout - b.htlcVout);

  // Strict invariant: the vector must cover [0, N-1] without gaps or
  // duplicates. The WASM template uses these positions directly; a gap
  // would silently mis-align with the funded tx's outputs.
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].htlcVout !== i) {
      const observed = siblings.map((s) => s.htlcVout).join(", ");
      throw new Error(
        `Sibling vault discovery produced a non-contiguous HTLC vector ` +
          `for prePeginTxHash ${targetPrePeginTxHash}: expected vouts ` +
          `[0..${siblings.length - 1}], observed [${observed}]. ` +
          `Refund refused — sibling set incomplete or indexer out of sync.`,
      );
    }
  }
  return siblings;
}

async function readVaultForRefund(
  vaultId: Hex,
  depositorAddress: Address,
): Promise<VaultRefundData> {
  const target = await readTargetVault(vaultId);
  const batch = await discoverBatch(target, vaultId, depositorAddress);

  return {
    hashlock: target.onChainVault.hashlock,
    htlcVout: target.onChainVault.htlcVout,
    offchainParamsVersion: target.onChainVault.offchainParamsVersion,
    appVaultKeepersVersion: target.onChainVault.appVaultKeepersVersion,
    universalChallengersVersion:
      target.onChainVault.universalChallengersVersion,
    vaultProvider: target.onChainVault.vaultProvider,
    applicationEntryPoint: target.onChainVault.applicationEntryPoint,
    amount: target.onChainVault.amount,
    unsignedPrePeginTxHex: target.unsignedPrePeginTx,
    depositorBtcPubkey: target.depositorBtcPubkey,
    batch,
  };
}

async function readPrePeginContext(
  vault: VaultRefundData,
): Promise<RefundPrePeginContext> {
  const [protocolReader, keeperReader, challengerReader] = await Promise.all([
    getProtocolParamsReader(),
    getVaultKeeperReader(),
    getUniversalChallengerReader(),
  ]);

  const [
    offchainParams,
    vaultProvider,
    vaultProviderOnChainPubkey,
    vaultKeepers,
    universalChallengersList,
  ] = await Promise.all([
    protocolReader.getOffchainParamsByVersion(vault.offchainParamsVersion),
    fetchVaultProviderById(vault.vaultProvider),
    getVaultRegistryReader().getVaultProviderBtcPubKey(
      vault.vaultProvider as Address,
    ),
    keeperReader.getVaultKeepersByVersion(
      vault.applicationEntryPoint,
      vault.appVaultKeepersVersion,
    ),
    challengerReader.getUniversalChallengersByVersion(
      vault.universalChallengersVersion,
    ),
  ]);

  if (!vaultProvider) {
    throw new Error(
      `Vault provider ${vault.vaultProvider} not found. Cannot build refund transaction.`,
    );
  }
  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers found for version ${vault.appVaultKeepersVersion}`,
    );
  }
  if (universalChallengersList.length === 0) {
    throw new Error(
      `Universal challengers not found for version ${vault.universalChallengersVersion}`,
    );
  }

  // Cross-check the GraphQL-supplied VP pubkey against the chain-registered
  // value. A stale or compromised indexer could otherwise substitute a
  // different key and produce a refund signed against a Taproot script tree
  // that doesn't match the actual vault.
  const indexerXOnly = processPublicKeyToXOnly(
    vaultProvider.btcPubKey,
  ).toLowerCase();
  if (indexerXOnly !== vaultProviderOnChainPubkey.toLowerCase()) {
    throw new Error(
      `Indexer vault provider key for ${vault.vaultProvider} does not match on-chain registry. Aborting refund.`,
    );
  }

  const vaultKeeperPubkeys = getSortedXOnlyPubkeys(
    vaultKeepers.map((vk) => vk.btcPubKey),
  );
  const universalChallengerPubkeys = getSortedXOnlyPubkeys(
    universalChallengersList.map((uc) => uc.btcPubKey),
  );

  return {
    vaultProviderPubkey: vaultProviderOnChainPubkey,
    vaultKeeperPubkeys,
    universalChallengerPubkeys,
    timelockRefund: offchainParams.tRefund,
    feeRate: offchainParams.feeRate,
    minPeginFeeRate: offchainParams.minPeginFeeRate,
    numLocalChallengers: vaultKeeperPubkeys.length,
    councilQuorum: offchainParams.councilQuorum,
    councilSize: offchainParams.securityCouncilKeys.length,
    network: getBTCNetworkForWASM(),
  };
}

/**
 * Thrown when the refund cannot proceed because the vault's HTLC output is
 * already spent — the depositor's refund has already landed, often from
 * another device or session. Carries the spending (refund) txid so the UI can
 * show success instead of a doomed retry. A pure BTC refund emits no Ethereum
 * event, so this is detected by probing the HTLC outpoint's spend status, not
 * from the indexer.
 */
export class RefundAlreadySettledError extends Error {
  /** The transaction that already spent the HTLC output, when known. */
  public readonly spendingTxid?: string;
  /** True when that spending tx is confirmed in a block. */
  public readonly confirmed: boolean;

  constructor(spendingTxid: string | undefined, confirmed: boolean) {
    super("Refund already settled: the HTLC output has already been spent.");
    this.name = "RefundAlreadySettledError";
    this.spendingTxid = spendingTxid;
    this.confirmed = confirmed;
  }
}

// bitcoind sendrawtransaction rejection codes that mean "this refund already
// happened", relayed verbatim by mempool.space as `...RPC error: {"code":-N,...}`.
// -27 = RPC_VERIFY_ALREADY_IN_UTXO_SET (the tx is already confirmed); -25 =
// missing/already-spent inputs (the HTLC was already spent). Verified against
// bitcoin/bitcoin src/rpc/protocol.h + src/node/transaction.cpp.
const ALREADY_IN_CHAIN_CODE_RE = /"code"\s*:\s*-27\b/;
const MISSING_OR_SPENT_INPUTS_CODE_RE = /"code"\s*:\s*-25\b/;

/**
 * Build, sign, and broadcast a refund transaction for an expired vault.
 *
 * The broadcast will be rejected by the Bitcoin network if timelockRefund
 * blocks have not yet passed since the Pre-PegIn transaction was confirmed;
 * in that case the SDK throws {@link BIP68NotMatureError}.
 *
 * @returns The broadcasted refund transaction ID
 * @throws {@link RefundAlreadySettledError} if the HTLC output is already spent
 * @throws If vault data is missing or the broadcast fails
 */
export async function buildAndBroadcastRefundTransaction(
  params: BroadcastRefundParams,
): Promise<string> {
  const {
    vaultId,
    depositorAddress,
    btcWalletProvider,
    depositorBtcPubkey,
    feeRate,
    signal,
  } = params;
  const mempoolApiUrl = getMempoolApiUrl();

  // Re-probe Pre-PegIn existence before the wallet popup. The modal's
  // preview can be stale (cached) or the tx can be evicted from mempool
  // between preview and confirm; without this guard the user would sign
  // a refund whose HTLC input doesn't exist on Bitcoin and only learn
  // that at broadcast. Fails open on any non-404 outcome — same fail-open
  // semantics as the preview probe — so a flaky mempool never blocks a
  // legitimate refund. See {@link isPrePeginOnChain}.
  const target = await readTargetVault(vaultId);
  const stillOnChain = await isPrePeginOnChain(
    target.onChainVault.prePeginTxHash,
    mempoolApiUrl,
  );
  if (!stillOnChain) {
    throw new Error(COPY.deposit.refundNotBroadcast.broadcastGuardError);
  }

  // The Pre-PegIn exists, but its HTLC output may already be spent — the refund
  // already landed (e.g. from another device/session). The refund tx is
  // deterministic, so re-broadcasting hits bitcoind -27 (already in chain) or
  // -25 (input already spent); surface the existing refund as success instead
  // of a doomed retry. On-chain `htlcVout` (never the indexer's) keys the
  // probe. Fail-open: a flaky probe must not block a legitimate refund — the
  // broadcast-time classification below is the backstop.
  const htlcSpend = await fetchHtlcSpend(
    target.onChainVault.prePeginTxHash,
    target.onChainVault.htlcVout,
    mempoolApiUrl,
  ).catch(() => undefined);
  if (htlcSpend?.spent) {
    throw new RefundAlreadySettledError(
      htlcSpend.spendingTxid,
      htlcSpend.confirmed,
    );
  }

  // Override indexer-provided depositor pubkey with the caller's wallet key —
  // the wallet is the authoritative source for the depositor's signing key.
  const { txId } = await buildAndBroadcastRefund({
    vaultId,
    readVault: async () => {
      const data = await readVaultForRefund(vaultId, depositorAddress);
      return { ...data, depositorBtcPubkey };
    },
    readPrePeginContext: (vault) => readPrePeginContext(vault),
    feeRate,
    signPsbt: (psbtHex, options) =>
      btcWalletProvider.signPsbt(psbtHex, options),
    broadcastTx: async (signedTxHex) => {
      try {
        return { txId: await pushTx(signedTxHex, mempoolApiUrl) };
      } catch (err) {
        // Race: the HTLC was spent between the guard above and this broadcast.
        // On bitcoind -27/-25, re-probe the outpoint; if spent, the refund is
        // already done — report success rather than a retryable failure.
        const message = err instanceof Error ? err.message : String(err);
        if (
          ALREADY_IN_CHAIN_CODE_RE.test(message) ||
          MISSING_OR_SPENT_INPUTS_CODE_RE.test(message)
        ) {
          const spend = await fetchHtlcSpend(
            target.onChainVault.prePeginTxHash,
            target.onChainVault.htlcVout,
            mempoolApiUrl,
          ).catch(() => undefined);
          if (spend?.spent) {
            throw new RefundAlreadySettledError(
              spend.spendingTxid,
              spend.confirmed,
            );
          }
        }
        throw err;
      }
    },
    signal,
  });

  return txId;
}
