/**
 * Outpoint-keyed availability of a Pre-PegIn's inputs.
 *
 * Every input is read by outpoint, so inputs on any address are covered. Two
 * reads each: the outspend route answers `{spent: false}` for an unknown
 * parent (mempool/electrs `src/rest.rs`), so the output itself is read too —
 * together they mean "exists and unspent". With `expectedPrevouts`, the
 * chain's script and value are also compared to the ones the transaction was
 * built with, which catches a mislabelled outpoint before Ethereum
 * registration.
 */

import {
  extractInputsFromTransaction,
  outpointKey,
  UtxoNotAvailableError,
  type MissingUtxoInfo,
} from "../../utils";

/** Script and value of one output, as the chain or the build reports them. */
export interface OutpointPrevout {
  readonly scriptPubKey: string;
  readonly value: number;
}

export interface OutpointReaders {
  /** Spend status by outpoint (`getOutspend`); a failed read must throw. */
  readOutspend(txid: string, vout: number): Promise<{ spent: boolean }>;
  /** The output by outpoint (`getUtxoInfo`); must throw for an unknown parent. */
  readOutpoint(txid: string, vout: number): Promise<OutpointPrevout>;
}

export interface AssertOutpointsAvailableParams {
  readonly unsignedTxHex: string;
  readonly readers: OutpointReaders;
  /**
   * Prevouts the transaction was built against, keyed `txid:vout`. Pass on a
   * path that commits before signing; every input must then have an entry.
   */
  readonly expectedPrevouts?: Readonly<Record<string, OutpointPrevout>>;
}

/** An input's outpoint has a script or value other than the one it was built with. */
export class InputPrevoutMismatchError extends Error {
  constructor(
    public readonly txid: string,
    public readonly vout: number,
    public readonly expected: OutpointPrevout,
    public readonly chain: OutpointPrevout,
  ) {
    super(
      `Input ${outpointKey(txid, vout)} was built as ${expected.value} sat paying ` +
        `${expected.scriptPubKey}, but the chain reports ${chain.value} sat paying ` +
        `${chain.scriptPubKey}. The listing entry does not describe this outpoint; ` +
        `the transaction cannot be signed correctly.`,
    );
    this.name = "InputPrevoutMismatchError";
  }
}

/**
 * Assert every input exists and is unspent — and, with `expectedPrevouts`,
 * has the script and value it was built with. A failed read propagates as
 * is; then a prevout mismatch ({@link InputPrevoutMismatchError}) wins over
 * a spend ({@link UtxoNotAvailableError}).
 */
export async function assertOutpointsAvailable(
  params: AssertOutpointsAvailableParams,
): Promise<void> {
  const { unsignedTxHex, readers, expectedPrevouts } = params;
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
        readers.readOutspend(txid, input.vout),
        readers.readOutpoint(txid, input.vout),
      ]);
      // An unreadable body must not pass as "unspent"; it is a read failure.
      if (typeof outspend.spent !== "boolean") {
        throw new Error(
          `The mempool API returned an unreadable spend status for ` +
            `${outpointKey(txid, input.vout)} (${JSON.stringify(outspend)}); ` +
            `the input cannot be confirmed unspent.`,
        );
      }
      return { txid, vout: input.vout, spent: outspend.spent, chain };
    }),
  );

  if (expectedPrevouts !== undefined) {
    for (const { txid, vout, chain } of results) {
      const expected = expectedPrevouts[outpointKey(txid, vout)];
      const scriptDiffers =
        chain.scriptPubKey.toLowerCase() !==
        expected.scriptPubKey.toLowerCase();
      if (scriptDiffers || chain.value !== expected.value) {
        throw new InputPrevoutMismatchError(
          txid,
          vout,
          {
            scriptPubKey: expected.scriptPubKey.toLowerCase(),
            value: expected.value,
          },
          {
            scriptPubKey: chain.scriptPubKey.toLowerCase(),
            value: chain.value,
          },
        );
      }
    }
  }

  const missing: MissingUtxoInfo[] = results
    .filter((result) => result.spent)
    .map(({ txid, vout }) => ({ txid, vout }));
  if (missing.length > 0) {
    throw new UtxoNotAvailableError(missing);
  }
}
