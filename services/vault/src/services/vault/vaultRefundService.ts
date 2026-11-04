/**
 * Vault Refund Service — thin adapter over the SDK's `buildAndBroadcastRefund`.
 *
 * When a vault expires (ack_timeout, proof_timeout, or activation_timeout),
 * the depositor can reclaim their BTC from the Pre-PegIn HTLC output after
 * timelockRefund Bitcoin blocks have passed, using the refund script (leaf 1).
 *
 * Protocol logic (fee math, PSBT build, sign options, finalize, BIP68 and
 * bitcoind -25/-27 error typing) lives in the SDK. This adapter pre-fetches
 * the mempool fee rate and provides the transport-specific callbacks for
 * reads, signing, and broadcast. Those reads never touch the indexer: it could
 * otherwise block a depositor from BTC only they can spend, and everything the
 * refund needs is on Ethereum or Bitcoin.
 */

import type { SignPsbtOptions } from "@babylonlabs-io/ts-sdk/shared";
import {
  getNetworkFees,
  pushTx,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { isRegistrationLogsUnavailableError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  buildAndBroadcastRefund,
  readRefundPrePeginContext,
  RefundBroadcastRejectedError,
  type RefundPrePeginContext,
  type VaultBatchEntry,
  type VaultRefundData,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { Transaction } from "bitcoinjs-lib";
import type { Address, Hex } from "viem";

import { logger } from "@/infrastructure";
import { withRequestTimeout } from "@/utils/async";
import { assertVaultCoreVersionSupported } from "@/utils/vaultCoreVersionSupport";

import { getMempoolApiUrl } from "../../clients/btc/config";
import {
  fetchHtlcSpend,
  type HtlcSpend,
  isHtlcSpentByPegin,
} from "../../clients/btc/outspend";
import { getPrePeginSiblingIdsFromChain } from "../../clients/eth-contract/btc-vault-registry/prePeginSiblings";
import {
  getRegisteredPrePeginTxFromChainWithGrace,
  getVaultFromChain,
  type OnChainVaultData,
} from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getOperationKeyReader,
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";
import { COPY } from "../../copy";

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

export type RefundPreview =
  /**
   * The Pre-PegIn is not on Bitcoin, so the refund has no HTLC output to spend
   * (it never reached the network) — the caller should surface "nothing to
   * refund" rather than letting the user sign a doomed transaction. See
   * {@link isPrePeginOnChain}.
   */
  | { prePeginOnChain: false }
  | {
      prePeginOnChain: true;
      /**
       * The amount actually reclaimed by the refund: the funded HTLC output
       * value at `htlcVout` in the on-chain Pre-PegIn tx. This is the vault
       * deposit amount PLUS the protocol reserve (`depositorClaimValue +
       * minPeginFee`, plus the 240-sat P2A anchor) that peg-in baked into the
       * HTLC output — the depositor reclaims all of it (minus the network fee)
       * because activation never spent the reserve. NOT the bare on-chain
       * `amount` field, which is only the deposit amount. The broadcast path
       * pins the refund output to exactly this value minus the fee (see
       * `buildRefundPsbt`), so the preview must show the same figure.
       */
      amountSats: bigint;
      /**
       * The deposit amount (`amount` field) the SDK's fee-fraction safety cap
       * is computed against (`buildAndBroadcastRefund` caps the refund fee at a
       * fraction of `vault.amount`). The review UI mirrors that cap to avoid
       * letting the user confirm a fee the SDK is about to reject — so it must
       * use this deposit-amount basis, not the larger `amountSats`, otherwise
       * the mirror drifts (notably for small vaults where the reserve is a
       * large fraction of the deposit).
       */
      feeCapBasisSats: bigint;
      /**
       * Mempool's halfHourFee, or null if the fee endpoint failed. Vault data
       * loads independently — a fee fetch failure must not block the refund.
       */
      halfHourFeeSatsVb: number | null;
    };

/** Timeout for this module's mempool reads — well under the modal's UX budget. */
const MEMPOOL_READ_TIMEOUT_MS = 10_000;

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
    MEMPOOL_READ_TIMEOUT_MS,
  );
  try {
    // Raw fetch, not the SDK getTxInfo: getTxInfo takes no abort signal, so it
    // cannot honour this probe's shorter timeout. Only a definitive 404 means
    // "not on chain".
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

/**
 * Read the funded HTLC output value (satoshis) the refund will reclaim — the
 * output at `htlcVout` in the funded Pre-PegIn tx. This is the deposit amount
 * plus the protocol reserve peg-in baked into the HTLC; it is the value the
 * broadcast path pins the refund output to (minus the fee). The funded tx hex
 * is authenticated against the on-chain `prePeginTxHash` in
 * {@link readPrePeginTx} before it reaches here.
 */
function readFundedHtlcValueSats(
  fundedTxHex: string,
  htlcVout: number,
): bigint {
  const fundedTx = Transaction.fromHex(stripHexPrefix(fundedTxHex));
  const htlcOutput = fundedTx.outs[htlcVout];
  if (!htlcOutput) {
    throw new Error(
      `Funded Pre-PegIn tx has no output at htlcVout ${htlcVout} ` +
        `(it has ${fundedTx.outs.length} outputs). Cannot preview the ` +
        `refund amount.`,
    );
  }
  return BigInt(htlcOutput.value);
}

/**
 * Limit on {@link readPrePeginTx}. The log read's schedule bounds its backoff
 * but not its reads, so a node answering slowly could otherwise hold the race
 * for minutes, and a broadcast's modal cannot be closed while it waits.
 */
const PRE_PEGIN_READ_DEADLINE_MS = 20_000;

/**
 * Thrown when no source could supply the Pre-PegIn's bytes. `retryable` tells
 * the query client whether repeating the read is worth it.
 */
class RefundPrePeginTxUnavailableError extends Error {
  constructor(
    prePeginTxHash: string,
    public readonly retryable: boolean,
    options: ErrorOptions,
  ) {
    super(
      COPY.deposit.errors.refundPrePeginTxUnavailable(prePeginTxHash),
      options,
    );
    this.name = "RefundPrePeginTxUnavailableError";
  }
}

/**
 * Fetch the Pre-PegIn from Bitcoin by its on-chain txid. Raw fetch, not the SDK
 * `getTxHex`, for the reason {@link isPrePeginOnChain} gives: `getTxHex` takes
 * no abort signal, and its longer timeout would hold the race in
 * {@link readPrePeginTx} open after the log read has given up.
 */
async function fetchPrePeginTxFromBitcoin(
  prePeginTxHash: string,
  mempoolApiUrl: string,
): Promise<string> {
  const txid = stripHexPrefix(prePeginTxHash);
  const url = `${mempoolApiUrl}/tx/${txid}/hex`;
  return withRequestTimeout(
    {
      timeoutMs: MEMPOOL_READ_TIMEOUT_MS,
      requestLabel: "Pre-PegIn read",
      url,
    },
    async (signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(
          `Mempool API answered HTTP ${response.status} for Pre-PegIn ${txid}`,
        );
      }
      return response.text();
    },
  );
}

/**
 * Reduce a source's answer to the bytes the refund is built from, or reject it.
 *
 * The on-chain hash commits to every input and output but not to a witness, so
 * a witness is dropped rather than carried along unverified. What remains is
 * what the hash commits to, so every authenticated answer is the same bytes
 * whichever source served it.
 */
function authenticatePrePeginTx(txHex: string, prePeginTxHash: string): Hex {
  const tx = Transaction.fromHex(stripHexPrefix(txHex));
  for (const input of tx.ins) {
    input.witness = [];
  }
  const preWitnessTxHex = `0x${tx.toHex()}` as Hex;

  const computedTxHash = calculateBtcTxHash(preWitnessTxHex);
  if (computedTxHash.toLowerCase() !== prePeginTxHash.toLowerCase()) {
    const message =
      `A Pre-PegIn source served transaction ${computedTxHash}, but the ` +
      `vault registered ${prePeginTxHash}`;
    // Warned here because the race in readPrePeginTx hides this answer when
    // the other source wins, and a wrong transaction is a tamper signal.
    logger.warn(message);
    throw new Error(message);
  }
  return preWitnessTxHex;
}

/**
 * Read the vault's funded Pre-PegIn from Bitcoin and from its registration log,
 * and return the first answer that authenticates.
 *
 * Neither source can be the only one: single-block log reads are unreliable on
 * public nodes, and a mempool API can be down or geo-fenced while the Pre-PegIn
 * is on Bitcoin. Taking whichever answers first is not a silent fallback,
 * because {@link authenticatePrePeginTx} makes the two answers byte-identical.
 *
 * @throws {@link RefundPrePeginTxUnavailableError} when neither source answers
 * with the vault's transaction by {@link PRE_PEGIN_READ_DEADLINE_MS}. Its
 * `cause` holds each source's reason, or only the deadline if that passed first.
 */
async function readPrePeginTx(
  vaultId: Hex,
  vault: OnChainVaultData,
  mempoolApiUrl: string,
): Promise<Hex> {
  const { prePeginTxHash, createdAt } = vault;
  const authenticated = async (answer: Promise<string>) =>
    authenticatePrePeginTx(await answer, prePeginTxHash);

  const raceSettled = new AbortController();
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(
      () =>
        reject(
          new Error(
            `No Pre-PegIn source gave the vault's transaction within ${PRE_PEGIN_READ_DEADLINE_MS}ms`,
          ),
        ),
      PRE_PEGIN_READ_DEADLINE_MS,
    );
  });
  try {
    return await Promise.race([
      Promise.any([
        authenticated(
          fetchPrePeginTxFromBitcoin(prePeginTxHash, mempoolApiUrl),
        ),
        authenticated(
          getRegisteredPrePeginTxFromChainWithGrace(
            vaultId,
            createdAt,
            raceSettled.signal,
          ),
        ),
      ]),
      deadline,
    ]);
  } catch (err) {
    // Worth repeating unless the log read has used up its schedule or the
    // deadline has passed: then a repeat would only hold the modal's spinner for
    // longer. A failure the log read has no retries for gets the query client's.
    const retryable =
      err instanceof AggregateError &&
      !err.errors.some(isRegistrationLogsUnavailableError);
    throw new RefundPrePeginTxUnavailableError(prePeginTxHash, retryable, {
      cause: err,
    });
  } finally {
    clearTimeout(deadlineTimer);
    // The log read may still be backing off; nothing needs its answer now.
    raceSettled.abort();
  }
}

export async function getRefundPreview(vaultId: Hex): Promise<RefundPreview> {
  const mempoolApiUrl = getMempoolApiUrl();
  // The fee fetch doesn't depend on vault data — start it now so it overlaps
  // the reads below.
  const feePromise = getNetworkFees(mempoolApiUrl).catch(() => null);
  const vault = await getVaultFromChain(vaultId);

  // Probe before reading the bytes. For a Pre-PegIn that never reached Bitcoin
  // only the log can supply them, and "nothing to refund" must not depend on
  // that flaky read.
  if (!(await isPrePeginOnChain(vault.prePeginTxHash, mempoolApiUrl))) {
    return { prePeginOnChain: false };
  }

  const [feeRecommendation, prePeginTx] = await Promise.all([
    feePromise,
    readPrePeginTx(vaultId, vault, mempoolApiUrl),
  ]);
  return {
    prePeginOnChain: true,
    // Reclaimed amount = the funded HTLC output value, not the bare deposit
    // `amount`. The reserve peg-in baked into the HTLC returns to the
    // depositor since activation never spent it.
    amountSats: readFundedHtlcValueSats(prePeginTx, vault.htlcVout),
    // The SDK caps the refund fee against the deposit amount; mirror that
    // basis in the UI cap so the two never disagree.
    feeCapBasisSats: vault.amount,
    halfHourFeeSatsVb:
      feeRecommendation && feeRecommendation.halfHourFee > 0
        ? feeRecommendation.halfHourFee
        : null,
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
 * Candidates come from the registry's list of the depositor's vaults and
 * membership from on-chain `prePeginTxHash` equality, so a stale or
 * compromised indexer cannot fabricate or drop siblings, or block this
 * refund with a bad ID. Each sibling's authoritative hashlock / htlcVout /
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
  target: OnChainVaultData,
  targetVaultId: Hex,
  connectedDepositorAddress: Address,
): Promise<ReadonlyArray<VaultBatchEntry>> {
  const onChainDepositor = target.depositor;
  if (
    onChainDepositor.toLowerCase() !== connectedDepositorAddress.toLowerCase()
  ) {
    throw new Error(
      `Vault ${targetVaultId} is owned by ${onChainDepositor}, but the ` +
        `connected wallet is ${connectedDepositorAddress}. Connect with ` +
        `the depositor wallet to refund this vault.`,
    );
  }

  const targetPrePeginTxHash = target.prePeginTxHash.toLowerCase();
  // Lean sibling filter first. The fully-validated getVaultFromChain read
  // (which fail-closes on a bad stamped vaultCoreVersion) runs only for actual
  // siblings — an unrelated broken vault in the depositor's list must not
  // block this refund.
  const siblingIds = await getPrePeginSiblingIdsFromChain(
    targetVaultId,
    target,
  );
  const siblingOnChain = await Promise.all(
    siblingIds.map((id) => getVaultFromChain(id)),
  );

  const siblings: VaultBatchEntry[] = [
    {
      hashlock: target.hashlock,
      amount: target.amount,
      htlcVout: target.htlcVout,
    },
  ];
  for (const sib of siblingOnChain) {
    // Re-check on the validated read — the two reads are separate RPCs.
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
        COPY.deposit.errors.refundSiblingVectorNonContiguous(
          targetPrePeginTxHash,
          siblings.length - 1,
          observed,
        ),
      );
    }
  }
  return siblings;
}

async function readVaultForRefund(
  vault: OnChainVaultData,
  params: BroadcastRefundParams,
  mempoolApiUrl: string,
): Promise<VaultRefundData> {
  const { vaultId, depositorAddress, depositorBtcPubkey } = params;
  // Fail closed before signing when this build's WASM can't reconstruct the
  // vault's stamped graph version for the refund template.
  await assertVaultCoreVersionSupported(vault.vaultCoreVersion);
  const batch = await discoverBatch(vault, vaultId, depositorAddress);

  return {
    vaultCoreVersion: vault.vaultCoreVersion,
    hashlock: vault.hashlock,
    htlcVout: vault.htlcVout,
    offchainParamsVersion: vault.offchainParamsVersion,
    appVaultKeepersVersion: vault.appVaultKeepersVersion,
    universalChallengersVersion: vault.universalChallengersVersion,
    vaultProvider: vault.vaultProvider,
    applicationEntryPoint: vault.applicationEntryPoint,
    amount: vault.amount,
    unsignedPrePeginTxHex: await readPrePeginTx(vaultId, vault, mempoolApiUrl),
    // The wallet is the authoritative source for the depositor's signing key.
    depositorBtcPubkey,
    batch,
  };
}

/**
 * The refund context from the chain alone: operation keys at the vault's frozen
 * epochs, and params at its stamped version. The refund's HTLC comparison
 * refuses a key the funded output does not commit to, before the wallet prompt.
 */
async function readPrePeginContext(
  vault: VaultRefundData,
  vaultId: Hex,
): Promise<RefundPrePeginContext> {
  const [
    protocolParamsReader,
    vaultKeeperReader,
    universalChallengerReader,
    operationKeyReader,
  ] = await Promise.all([
    getProtocolParamsReader(),
    getVaultKeeperReader(),
    getUniversalChallengerReader(),
    getOperationKeyReader(),
  ]);

  return readRefundPrePeginContext({
    vaultId,
    vault,
    readers: {
      registryReader: getVaultRegistryReader(),
      protocolParamsReader,
      vaultKeeperReader,
      universalChallengerReader,
      operationKeyReader,
    },
    network: getBTCNetworkForWASM(),
  });
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
  /** The transaction that already spent the HTLC output. */
  public readonly spendingTxid: string;
  /** True when that spending tx is confirmed in a block. */
  public readonly confirmed: boolean;

  constructor(spendingTxid: string, confirmed: boolean) {
    super("Refund already settled: the HTLC output has already been spent.");
    this.name = "RefundAlreadySettledError";
    this.spendingTxid = spendingTxid;
    this.confirmed = confirmed;
  }
}

/**
 * Where in the refund the spent HTLC was found: before the wallet signed, or
 * only when the signed refund was rejected at broadcast. Picks the copy, so a
 * depositor who just approved a signature is not told nothing was signed.
 */
type RefundStage = "beforeSigning" | "afterSigning";

/**
 * Thrown when the vault's HTLC output was spent by the vault's own PegIn, not
 * by a refund: the BTC moved into the BTCVault, so no refund can ever land and
 * the depositor's exit is the expired-vault redeem. Kept apart from
 * {@link RefundAlreadySettledError} so a PegIn sweep is never recorded as a
 * refund — a refunded record drops the vault from the HTLC probe and, with it,
 * the redeem action.
 */
export class HtlcSweptByPeginError extends Error {
  constructor(stage: RefundStage) {
    super(COPY.deposit.refundSweptByPegin[stage]);
    this.name = "HtlcSweptByPeginError";
  }
}

/**
 * Throws for an HTLC output that is already spent, attributing the spender
 * first. The PegIn txid comes from the on-chain signed PegIn, so an indexer
 * record cannot turn a sweep into a "refund" here. A spend reported without
 * its transaction can be neither, so it is refused as retryable rather than
 * recorded as a settled refund.
 */
function throwIfHtlcSpent(
  spend: HtlcSpend | undefined,
  peginTxid: string,
  stage: RefundStage,
): void {
  if (!spend?.spent) return;
  if (!spend.spendingTxid) {
    throw new Error(COPY.deposit.refundSpenderUnknown[stage]);
  }
  if (isHtlcSpentByPegin(spend, peginTxid)) {
    throw new HtlcSweptByPeginError(stage);
  }
  throw new RefundAlreadySettledError(spend.spendingTxid, spend.confirmed);
}

/**
 * Build, sign, and broadcast a refund transaction for an expired vault.
 *
 * The broadcast will be rejected by the Bitcoin network if timelockRefund
 * blocks have not yet passed since the Pre-PegIn transaction was confirmed;
 * in that case the SDK throws {@link BIP68NotMatureError}.
 *
 * @returns The broadcasted refund transaction ID
 * @throws {@link HtlcSweptByPeginError} if the vault's PegIn spent the HTLC output
 * @throws {@link RefundAlreadySettledError} if anything else already spent it
 * @throws A retryable error if it is reported spent without the spending tx
 * @throws The original transport error if a -25/-27 rejection finds no spender
 * @throws If vault data is missing or the broadcast fails
 */
export async function buildAndBroadcastRefundTransaction(
  params: BroadcastRefundParams,
): Promise<string> {
  const { vaultId, btcWalletProvider, feeRate, signal } = params;
  const mempoolApiUrl = getMempoolApiUrl();

  // Re-probe Pre-PegIn existence before the wallet popup. The modal's
  // preview can be stale (cached) or the tx can be evicted from mempool
  // between preview and confirm; without this guard the user would sign
  // a refund whose HTLC input doesn't exist on Bitcoin and only learn
  // that at broadcast. Fails open on any non-404 outcome — same fail-open
  // semantics as the preview probe — so a flaky mempool never blocks a
  // legitimate refund. See {@link isPrePeginOnChain}.
  const vault = await getVaultFromChain(vaultId);
  const stillOnChain = await isPrePeginOnChain(
    vault.prePeginTxHash,
    mempoolApiUrl,
  );
  if (!stillOnChain) {
    throw new Error(COPY.deposit.refundNotBroadcast.broadcastGuardError);
  }
  const peginTxid = calculateBtcTxHash(vault.depositorSignedPeginTx);

  // The Pre-PegIn exists, but its HTLC output may already be spent: by a refund
  // that already landed (e.g. from another device/session) or by the vault's
  // PegIn. Attribute the spender before the wallet prompt — a landed refund is
  // surfaced as success instead of a doomed re-broadcast, a PegIn sweep points
  // to the redeem, and an unnamed spender is refused as retryable. On-chain
  // `htlcVout` keys the probe. Fail-open: a flaky probe must not block a
  // legitimate refund — the broadcast-time classification below is the
  // backstop. Neither guard reads the Pre-PegIn's bytes, so neither depends on
  // that read; the bytes are read last, inside `readVault`.
  const htlcSpend = await fetchHtlcSpend(
    vault.prePeginTxHash,
    vault.htlcVout,
    mempoolApiUrl,
  ).catch(() => undefined);
  throwIfHtlcSpent(htlcSpend, peginTxid, "beforeSigning");

  try {
    const { txId } = await buildAndBroadcastRefund({
      vaultId,
      readVault: () => readVaultForRefund(vault, params, mempoolApiUrl),
      readPrePeginContext: (vaultData) =>
        readPrePeginContext(vaultData, vaultId),
      feeRate,
      signPsbt: (psbtHex, options) =>
        btcWalletProvider.signPsbt(psbtHex, options),
      broadcastTx: async (signedTxHex) => ({
        txId: await pushTx(signedTxHex, mempoolApiUrl),
      }),
      signal,
    });
    return txId;
  } catch (err) {
    if (!(err instanceof RefundBroadcastRejectedError)) throw err;
    // Race: the HTLC was spent between the guard above and this broadcast.
    // Re-probe the outpoint and attribute the spender as the guard does.
    const probed = await fetchHtlcSpend(
      vault.prePeginTxHash,
      vault.htlcVout,
      mempoolApiUrl,
    ).catch(() => undefined);
    // -27 says this signed refund is itself confirmed, so a spend the
    // probe reports without its transaction is this refund.
    const spend =
      err.code === -27 && probed?.spent && !probed.spendingTxid
        ? {
            ...probed,
            spendingTxid: stripHexPrefix(calculateBtcTxHash(err.signedTxHex)),
          }
        : probed;
    throwIfHtlcSpent(spend, peginTxid, "afterSigning");
    throw err.cause;
  }
}
