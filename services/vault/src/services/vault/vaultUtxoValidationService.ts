/**
 * UTXO Validation Service
 *
 * Validates that UTXOs referenced in a pre-pegin transaction are still unspent
 * BEFORE asking the user to sign. Types and helpers come from SDK; the async
 * functions live here because they perform I/O (fetching UTXOs from mempool).
 */

import { getAddressUtxos } from "@babylonlabs-io/ts-sdk";
import type {
  MissingUtxoInfo,
  UtxoValidationResult,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  UtxoNotAvailableError,
  extractInputsFromTransaction,
  assertUtxosAvailable as sdkAssertUtxosAvailable,
  validateUtxosAvailable as sdkValidateUtxosAvailable,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";

import { getMempoolApiUrl } from "../../clients/btc/config";

export { UtxoNotAvailableError, extractInputsFromTransaction };
export type { MissingUtxoInfo, UtxoValidationResult };

export async function validateUtxosAvailable(
  unsignedTxHex: string,
  depositorAddress: string,
): Promise<UtxoValidationResult> {
  const mempoolUrl = getMempoolApiUrl();
  const availableUtxos = await getAddressUtxos(depositorAddress, mempoolUrl);
  return sdkValidateUtxosAvailable(unsignedTxHex, availableUtxos);
}

export async function assertUtxosAvailable(
  unsignedTxHex: string,
  depositorAddress: string,
): Promise<void> {
  const mempoolUrl = getMempoolApiUrl();
  const availableUtxos = await getAddressUtxos(depositorAddress, mempoolUrl);
  sdkAssertUtxosAvailable(unsignedTxHex, availableUtxos);
}
