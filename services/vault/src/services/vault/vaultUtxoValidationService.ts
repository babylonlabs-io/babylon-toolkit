/**
 * UTXO Validation Service
 *
 * Checks a Pre-PegIn's inputs are still unspent before the deposit is
 * committed to (Ethereum registration, or the signer). Each input is asked
 * about by outpoint, so any address is covered. The rule lives in the SDK;
 * this wrapper supplies the mempool client.
 */

import {
  getOutspend,
  getUtxoInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  assertOutpointsAvailable,
  type OutpointPrevout,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { getMempoolApiUrl } from "../../clients/btc/config";

/** A failed mempool read, worded for the retryable "Bitcoin funds unavailable" callout. */
function fetchFailure(txid: string, vout: number, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`Failed to get UTXOs for input ${txid}:${vout}: ${detail}`, {
    cause,
  });
}

/**
 * Assert every input is unspent and, with `expectedPrevouts`, has the script
 * and value it was built with. Pass the selected UTXOs on the fresh path
 * (registration precedes signing); omit on resume, where per-outpoint
 * resolution follows.
 */
export async function assertUtxosAvailable(
  unsignedTxHex: string,
  expectedPrevouts?: Readonly<Record<string, OutpointPrevout>>,
): Promise<void> {
  const mempoolUrl = getMempoolApiUrl();
  await assertOutpointsAvailable({
    unsignedTxHex,
    expectedPrevouts,
    readers: {
      readOutspend: async (txid, vout) => {
        try {
          return await getOutspend(txid, vout, mempoolUrl);
        } catch (cause) {
          throw fetchFailure(txid, vout, cause);
        }
      },
      readOutpoint: async (txid, vout) => {
        try {
          return await getUtxoInfo(txid, vout, mempoolUrl);
        } catch (cause) {
          throw fetchFailure(txid, vout, cause);
        }
      },
    },
  });
}
