/**
 * Mempool-API helper that reports whether a Pre-PegIn HTLC output has been
 * spent, and by which transaction. A spend is either the depositor's CSV
 * refund or the vault's PegIn sweeping the deposit into the BTCVault — tell
 * them apart with `isHtlcSpentByPegin` below. A pure BTC refund emits no
 * Ethereum event, so neither the indexer nor the BTC monitor sees it today —
 * the frontend reads the spend status directly from the esplora-compatible
 * `outspend` endpoint. Before a secret is revealed, `peginWitnessRevealsSecret`
 * proves the PegIn's spend from the transaction itself instead.
 */

import {
  ensureHexPrefix,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { getOutspend } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { validateSecretAgainstHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { Transaction } from "bitcoinjs-lib";
import type { Hex } from "viem";

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

/** Byte length of the HTLC secret: the hashlock leaf enforces `OP_SIZE <32>`. */
const HTLC_PREIMAGE_BYTES = 32;

/** The on-chain facts a PegIn transaction is checked against. */
export interface PeginSpendExpectation {
  /** Txid of the on-chain signed PegIn (no `0x` required). */
  peginTxid: string;
  /** The vault's HTLC outpoint, as registered on chain. */
  prePeginTxHash: string;
  htlcVout: number;
  /** The vault's on-chain hashlock, `sha256(secret)`. */
  hashlock: string;
}

/**
 * Whether `txHex` is the vault's PegIn spending its HTLC through the hashlock
 * leaf: its txid is the on-chain PegIn's, an input spends the HTLC outpoint,
 * and that input's witness carries the 32-byte preimage of the hashlock.
 *
 * This is proof from the transaction itself, not from the mempool API's word.
 * A txid does not commit to the witness, so the preimage is what carries the
 * weight: only someone who already knows the secret can produce one, so a
 * match shows the secret is public before the redeem reveals it on Ethereum —
 * whatever the API reports about where the transaction is. The hashlock leaf
 * witness is `[UC…, VK…, VP, depositor, preimage, script, control block]`; any
 * 32-byte item is checked rather than a fixed position, since every other item
 * is longer and any item that hashes to the hashlock is the secret.
 */
export function peginWitnessRevealsSecret(
  txHex: string,
  expected: PeginSpendExpectation,
): boolean {
  let tx: Transaction;
  try {
    tx = Transaction.fromHex(stripHexPrefix(txHex));
  } catch {
    return false;
  }
  if (canonicalizeTxid(tx.getId()) !== canonicalizeTxid(expected.peginTxid)) {
    return false;
  }
  const htlcTxid = canonicalizeTxid(expected.prePeginTxHash);
  const htlcInput = tx.ins.find(
    (input) =>
      input.index === expected.htlcVout &&
      Buffer.from(input.hash).reverse().toString("hex") === htlcTxid,
  );
  if (!htlcInput) return false;
  const hashlock = ensureHexPrefix(expected.hashlock) as Hex;
  return htlcInput.witness.some(
    (item) =>
      item.length === HTLC_PREIMAGE_BYTES &&
      validateSecretAgainstHashlock(
        ensureHexPrefix(item.toString("hex")) as Hex,
        hashlock,
      ),
  );
}
