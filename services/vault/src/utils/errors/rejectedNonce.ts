/**
 * The nonce a node names when it refuses a sent transaction as "nonce too low".
 *
 * go-ethereum's transaction pool words the refusal "nonce too low: next nonce
 * <the account's count>, tx nonce <the refused transaction's nonce>"
 * (core/txpool/validation.go), and Reth answers with the same text. Wallets
 * pass it on behind a prefix of their own, e.g. MetaMask's
 * "RPC 0xaa36a7 Infura eth_sendRawTransaction: ". Nethermind, Erigon and Besu
 * answer only "nonce too low", which names no nonce.
 *
 * geth's other wording, "nonce too low: address 0x…, tx: N state: M", comes
 * from executing a call with a nonce the caller chose (eth_call,
 * eth_estimateGas), not from admitting a signed transaction, so it says
 * nothing about the transaction that was sent and is not read here.
 */

import { chainMatchesFrame } from "./causeChain";

const TXPOOL_NONCE_TOO_LOW_PATTERN =
  /nonce too low: next nonce (\d+), tx nonce (\d+)/gi;

export interface RejectedNonce {
  /** The nonce the refused transaction was signed with. */
  nonce: number;
  /** The account's transaction count the node checked it against. */
  nextNonce: number;
}

/** The text `classifyError` reads in a frame: a bare string or `message`. */
function frameText(frame: unknown): string {
  if (typeof frame === "string") return frame;
  if (frame === null || typeof frame !== "object") return "";
  const { message } = frame as { message?: unknown };
  return typeof message === "string" ? message : "";
}

/**
 * The nonce the refused transaction was signed with, read from the node's
 * text anywhere in the error's `cause` chain. viem repeats the node's text in
 * every frame it wraps, so every match must name the same numbers: text that
 * names two different nonces, or a pair no node would send (a count not above
 * the nonce), proves nothing about either. Null when no frame names a nonce.
 */
export function readRejectedNonce(error: unknown): RejectedNonce | null {
  const named: RejectedNonce[] = [];
  chainMatchesFrame(error, (frame) => {
    for (const match of frameText(frame).matchAll(
      TXPOOL_NONCE_TOO_LOW_PATTERN,
    )) {
      named.push({ nextNonce: Number(match[1]), nonce: Number(match[2]) });
    }
    // Never a match, so the walk reads every frame.
    return false;
  });

  if (named.length === 0) return null;
  const first = named[0];
  const agreed = named.every(
    ({ nonce, nextNonce }) =>
      nonce === first.nonce && nextNonce === first.nextNonce,
  );
  const plausible =
    Number.isSafeInteger(first.nonce) &&
    Number.isSafeInteger(first.nextNonce) &&
    first.nextNonce > first.nonce;
  return agreed && plausible ? first : null;
}
