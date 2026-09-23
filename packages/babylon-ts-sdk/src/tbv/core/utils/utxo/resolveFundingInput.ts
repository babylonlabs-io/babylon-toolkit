/**
 * Per-input prevout resolution for a Pre-PegIn's funding inputs.
 *
 * Single-address funding resolves each input through the caller's own lookup.
 * Multi-address funding (any prevout declaring `internalPubkeyHex`) pins every
 * input to its declared key and re-reads it from the chain by outpoint.
 */

import { Buffer } from "buffer";

import {
  assertKeyOwnsScript,
  assertPrevoutMatchesChain,
  type FundingPrevout,
  isMultiAddressFunding,
  outpointKey,
  requireFundingPrevout,
} from "./prevoutBinding";

interface ChainPrevout {
  scriptPubKey: string;
  value: number;
}

export interface ResolvedFundingInput<T extends ChainPrevout> {
  utxoData: T;
  /** Set only for multi-address funding: the key this input is signed under. */
  internalPubkeyHex?: string;
}

export interface FundingInputResolverParams<T extends ChainPrevout> {
  prevouts: Record<string, FundingPrevout> | undefined;
  /** Outpoint-keyed chain read (`getUtxoInfo`); the chain's values are used. */
  readChain: (txid: string, vout: number) => Promise<T>;
  /** The caller's single-address lookup (declared prevout or mempool). */
  resolveSingle: (txid: string, vout: number) => Promise<T>;
}

/** Build the resolver for one transaction's inputs; the mode is decided once. */
export function createFundingInputResolver<T extends ChainPrevout>(
  params: FundingInputResolverParams<T>,
): (txid: string, vout: number) => Promise<ResolvedFundingInput<T>> {
  const { prevouts, readChain, resolveSingle } = params;
  if (!isMultiAddressFunding(prevouts)) {
    return async (txid, vout) => ({
      utxoData: await resolveSingle(txid, vout),
    });
  }
  return async (txid, vout) => {
    const key = outpointKey(txid, vout);
    const declared = requireFundingPrevout(prevouts, txid, vout);
    assertKeyOwnsScript(key, declared.internalPubkeyHex, declared.scriptPubKey);
    const chain = await readChain(txid, vout);
    assertPrevoutMatchesChain(key, declared, chain);
    return { utxoData: chain, internalPubkeyHex: declared.internalPubkeyHex };
  };
}

/** The internal key an input is signed under: its own when declared, else the depositor's. */
export function fundingInputInternalKey(
  internalPubkeyHex: string | undefined,
  depositorKey: Buffer,
): Buffer {
  return internalPubkeyHex === undefined
    ? depositorKey
    : Buffer.from(internalPubkeyHex, "hex");
}
