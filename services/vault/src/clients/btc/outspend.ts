/**
 * Mempool-API helper that reports whether a Pre-PegIn HTLC output has been
 * spent, and by which transaction. A spend is either the depositor's CSV
 * refund or the vault's PegIn sweeping the deposit into the BTCVault — tell
 * them apart with `isHtlcSpentByPegin` below. A pure BTC refund emits no
 * Ethereum event, so neither the indexer nor the BTC monitor sees it today —
 * the frontend reads the spend status directly from the esplora-compatible
 * `outspend` endpoint. That endpoint's word is never enough to reveal a secret
 * on: `provePeginSpendsHtlc` proves from the PegIn transaction itself that it
 * is a valid spend of the HTLC, and every path that reveals the secret after a
 * reported PegIn sweep runs it first.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  getOutspend,
  getTxHex,
  type VaultProtocolInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { verifyPeginHashlockSpend } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";

import { normalizeChainHeight } from "@/models/reclaimEligibility";
import { canonicalizeTxid } from "@/utils/txid";

export interface HtlcSpend {
  /** True when the HTLC output has been spent (in the mempool or a block). */
  spent: boolean;
  /** True only when the spending tx is confirmed in a block. */
  confirmed: boolean;
  /** Spending transaction id (the refund or the PegIn), when spent. */
  spendingTxid?: string;
  /**
   * Height of the block containing the spending tx, when confirmed. Used by
   * the reclaim gate, which needs confirmation depth rather than a boolean —
   * see `models/reclaimEligibility`.
   */
  blockHeight?: number;
}

/**
 * Returns the spend status of a vault's HTLC output `(prePeginTxHash,
 * htlcVout)`. Callers handle errors (404, 429, network blips) at their layer.
 */
export async function fetchHtlcSpend(
  prePeginTxHash: string,
  htlcVout: number,
  apiUrl: string,
): Promise<HtlcSpend> {
  const res = await getOutspend(
    stripHexPrefix(prePeginTxHash),
    htlcVout,
    apiUrl,
  );
  return {
    spent: res.spent === true,
    confirmed: res.spent === true && res.status?.confirmed === true,
    spendingTxid: res.txid,
    // `getOutspend` returns the parsed body verbatim, so the declared
    // `number | undefined` is not a guarantee about the value.
    blockHeight: normalizeChainHeight(res.status?.block_height),
  };
}

/**
 * Whether the PegIn, not a refund, spent a vault's HTLC.
 *
 * A spend is only a refund if somebody other than the PegIn made it; when the
 * PegIn is the spender the BTC moved INTO the BTCVault. Positive proof only: a
 * missing `spendingTxid` or PegIn txid reads as false. The display, the
 * stuck-state probe and the refunded-HTLC cache all attribute through this,
 * and the cache and the refund flow also refuse a spend reported without its
 * transaction (the refund flow names it only after an "already in chain"
 * rejection, which proves the spender is its own refund), so a PegIn sweep is
 * not recorded as a refund. The expired-vault redeem checks it before acting.
 */
export function isHtlcSpentByPegin(
  spend: HtlcSpend | undefined,
  peginTxHash: string | undefined,
): boolean {
  const peginTxCanonical = canonicalizeTxid(peginTxHash);
  return (
    spend?.spent === true &&
    peginTxCanonical !== undefined &&
    canonicalizeTxid(spend.spendingTxid) === peginTxCanonical
  );
}

/** The fields of a vault's on-chain registry record the PegIn proof reads. */
export type PeginProofSource = Pick<
  VaultProtocolInfo,
  "depositorSignedPeginTx" | "prePeginTxHash" | "htlcVout" | "hashlock"
>;

export type PeginSpendProof =
  | { status: "proven" }
  /** The PegIn or its Pre-PegIn could not be fetched from Bitcoin. */
  | { status: "unavailable"; cause: unknown }
  /** What was served is not the vault's PegIn validly spending its HTLC. */
  | { status: "unproven"; reason: string };

/**
 * Whether Bitcoin data proves the vault's PegIn is a valid spend of its HTLC:
 * the PegIn, fetched by the txid of the on-chain signed PegIn, spends the
 * registered HTLC outpoint with a witness Bitcoin would accept — the preimage
 * of the registered hashlock and every participant's signature
 * (`verifyPeginHashlockSpend`). Whoever can serve that transaction holds the
 * secret, and can broadcast it while the HTLC is unspent.
 *
 * Takes the registry record itself, so the txids, the outpoint and the hashlock
 * all come from one on-chain read and no indexer value can be mixed in. The
 * signed PegIn stored on Ethereum (the PegIn's txid, no preimage) does not
 * pass, nor does a witness with a leaked secret and signatures that do not
 * verify. The participants' signatures are public, so once the secret is too,
 * anyone can build a passing PegIn: the proof shows a valid spend of the HTLC,
 * broadcastable while the HTLC is unspent, not that it was broadcast. A
 * malformed signed PegIn in the registry throws rather than reading as
 * unproven; the registered Pre-PegIn txid is a `bytes32`, so it is always a
 * well-formed txid, and a fetch that fails for either transaction reads as
 * unavailable.
 */
export async function provePeginSpendsHtlc(
  vault: PeginProofSource,
  apiUrl: string,
): Promise<PeginSpendProof> {
  const peginTxid = stripHexPrefix(
    calculateBtcTxHash(vault.depositorSignedPeginTx),
  );
  const prePeginTxid = stripHexPrefix(vault.prePeginTxHash);
  let peginTxHex: string;
  let prePeginTxHex: string;
  try {
    [peginTxHex, prePeginTxHex] = await Promise.all([
      getTxHex(peginTxid, apiUrl),
      getTxHex(prePeginTxid, apiUrl),
    ]);
  } catch (cause) {
    return { status: "unavailable", cause };
  }
  const verdict = verifyPeginHashlockSpend({
    peginTxHex,
    prePeginTxHex,
    peginTxid,
    prePeginTxid,
    htlcVout: vault.htlcVout,
    hashlock: vault.hashlock,
  });
  return verdict.valid
    ? { status: "proven" }
    : { status: "unproven", reason: verdict.reason };
}
