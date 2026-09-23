/**
 * UTXO Validation Service
 *
 * Checks a Pre-PegIn's inputs are still unspent before the deposit is
 * committed to (Ethereum registration, or the signer). Each input is asked
 * about by outpoint, so any address is covered. The rule lives in the SDK;
 * this wrapper supplies the app's mempool URL.
 */

import { assertOutpointsAvailable } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Prevout } from "@babylonlabs-io/ts-sdk/tbv/core/utils";

import { getMempoolApiUrl } from "../../clients/btc/config";

/**
 * Assert every input is unspent and, with `expectedPrevouts`, has the script
 * and value it was built with. Pass the selected UTXOs on the fresh path
 * (registration precedes signing); omit on resume, where per-outpoint
 * resolution follows.
 */
export function assertUtxosAvailable(
  unsignedTxHex: string,
  expectedPrevouts?: Readonly<Record<string, Prevout>>,
): Promise<void> {
  return assertOutpointsAvailable({
    unsignedTxHex,
    mempoolApiUrl: getMempoolApiUrl(),
    expectedPrevouts,
  });
}
