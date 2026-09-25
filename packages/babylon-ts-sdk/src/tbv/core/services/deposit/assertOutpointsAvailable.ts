/**
 * Outpoint-keyed availability of a Pre-PegIn's inputs.
 *
 * Every input is read by outpoint, so inputs on any address are covered. Two
 * reads each: the outspend route answers `{spent: false}` for an unknown
 * parent (mempool/electrs@cd6a967 `src/rest.rs:1489-1497`), so the output
 * itself is read too — together they mean "exists and unspent". With
 * `expectedPrevouts`, the chain's script and value are also compared to the
 * ones the transaction was built with, which catches a mislabelled outpoint
 * before Ethereum registration.
 */

import { getOutspend, getUtxoInfo } from "../../clients/mempool";
import {
  assertPrevoutMatchesChain,
  extractInputsFromTransaction,
  outpointKey,
  UtxoNotAvailableError,
  type MissingUtxoInfo,
  type Prevout,
} from "../../utils";

export interface AssertOutpointsAvailableParams {
  readonly unsignedTxHex: string;
  readonly mempoolApiUrl: string;
  /**
   * Prevouts the transaction was built against, keyed `txid:vout`. Pass on a
   * path that commits before signing; every input must then have an entry.
   */
  readonly expectedPrevouts?: Readonly<Record<string, Prevout>>;
}

/** A failed mempool read, worded for the retryable "funds unavailable" callout; never "unspent". */
async function readOrFail<T>(
  txid: string,
  vout: number,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Failed to get UTXOs for input ${outpointKey(txid, vout)}: ${detail}`,
      { cause },
    );
  }
}

/**
 * Assert every input exists and is unspent — and, with `expectedPrevouts`,
 * has the script and value it was built with. A failed read propagates as a
 * read failure; then a prevout mismatch (`InputPrevoutMismatchError`) wins
 * over a spend ({@link UtxoNotAvailableError}).
 */
export async function assertOutpointsAvailable(
  params: AssertOutpointsAvailableParams,
): Promise<void> {
  const { unsignedTxHex, mempoolApiUrl, expectedPrevouts } = params;
  const inputs = extractInputsFromTransaction(unsignedTxHex);
  if (inputs.length === 0) {
    throw new Error("Transaction has no inputs");
  }
  const seen = new Set<string>();
  for (const input of inputs) {
    const key = outpointKey(input.txid.toLowerCase(), input.vout);
    if (seen.has(key)) {
      throw new Error(
        `Transaction contains duplicate input ${key}. This would produce an ` +
          `invalid Bitcoin transaction.`,
      );
    }
    seen.add(key);
  }
  if (expectedPrevouts !== undefined) {
    for (const input of inputs) {
      const key = outpointKey(input.txid.toLowerCase(), input.vout);
      if (expectedPrevouts[key] === undefined) {
        throw new Error(
          `Input ${key} has no expected prevout; every input of a transaction ` +
            `checked before registration must be one it was built from.`,
        );
      }
    }
  }

  const results = await Promise.all(
    inputs.map(async (input) => {
      const txid = input.txid.toLowerCase();
      const [outspend, chain] = await Promise.all([
        readOrFail(txid, input.vout, () =>
          getOutspend(txid, input.vout, mempoolApiUrl),
        ),
        readOrFail(txid, input.vout, () =>
          getUtxoInfo(txid, input.vout, mempoolApiUrl),
        ),
      ]);
      return { txid, vout: input.vout, spent: outspend.spent, chain };
    }),
  );

  if (expectedPrevouts !== undefined) {
    for (const { txid, vout, chain } of results) {
      assertPrevoutMatchesChain(
        txid,
        vout,
        expectedPrevouts[outpointKey(txid, vout)],
        chain,
      );
    }
  }

  const missing: MissingUtxoInfo[] = results
    .filter((result) => result.spent)
    .map(({ txid, vout }) => ({ txid, vout }));
  if (missing.length > 0) {
    throw new UtxoNotAvailableError(missing);
  }
}
