/**
 * Reads the app makes today that the recording predates.
 *
 * A recording is a photograph of one moment in the app's history, and the app
 * keeps adding reads. When it adds one, that read has no recorded answer, the
 * call reverts, and whatever it fed renders as an error - which is how the
 * capture ends up photographing an error boundary again, the exact failure
 * this fixture exists to end.
 *
 * The honest fix is to re-record. Until someone does, a supplement covers a
 * read whose answer the recording ALREADY HOLDS somewhere else, so the value
 * is recovered rather than invented. Every entry must say where its value
 * came from, and none may make up a number the recording cannot justify: a
 * fabricated balance or price would put a plausible, wrong figure on a
 * screenshot that reviewers then treat as the expected look.
 *
 * This list is meant to stay short. If it grows, the recording is too old and
 * the answer is a new run, not more entries here.
 */

import {
  encodeAbiParameters,
  parseAbi,
  toFunctionSelector,
  type Hex,
} from "viem";

import { parseJson, type RecordedRun } from "./recording";

/**
 * `AaveIntegrationAdapter.VAULT_BTC_RESERVE_ID()`.
 *
 * Written as a signature rather than a literal selector so it tracks the
 * contract: if the getter is ever renamed, the selector stops matching, the
 * call goes unanswered, and the capture fails loudly instead of replaying an
 * answer to a question nobody asked any more.
 */
const VAULT_BTC_RESERVE_ID_ABI = parseAbi([
  "function VAULT_BTC_RESERVE_ID() view returns (uint256)",
]);

export interface Supplement {
  readonly target: string;
  readonly callData: Hex;
  readonly returnData: Hex;
  /** Why this value is the recording's own, quoted in review. */
  readonly because: string;
}

interface RecordedAaveConfig {
  readonly data?: {
    readonly aaveConfig?: {
      readonly adapterAddress?: string;
      readonly vaultBtcReserveId?: string;
    };
  };
}

/**
 * Derive the supplements a given run needs.
 *
 * Derived per run rather than hardcoded: re-recording against a deployment
 * with a different reserve id updates this automatically, where a literal
 * would keep asserting the old one and the app's own cross-check would throw.
 */
export function buildSupplements(run: RecordedRun): Supplement[] {
  const supplements: Supplement[] = [];

  // `fetchAaveAppConfig` reads the vBTC reserve id from the adapter and
  // refuses to continue unless it equals the id the indexer reported - a
  // deliberate guard against a compromised indexer aiming collateral maths at
  // another reserve. The recording holds the indexer's side of that
  // comparison, so the on-chain side it is checked against is recoverable
  // exactly: any other value would trip the app's own mismatch error.
  const aaveConfig = (run.byBackend.get("graphql") ?? [])
    .map(
      (entry) => parseJson<RecordedAaveConfig>(entry.resBody)?.data?.aaveConfig,
    )
    .findLast((config) => config?.vaultBtcReserveId !== undefined);

  if (
    aaveConfig?.adapterAddress &&
    aaveConfig.vaultBtcReserveId !== undefined
  ) {
    supplements.push({
      target: aaveConfig.adapterAddress,
      callData: toFunctionSelector(VAULT_BTC_RESERVE_ID_ABI[0]),
      returnData: encodeAbiParameters(
        [{ type: "uint256" }],
        [BigInt(aaveConfig.vaultBtcReserveId)],
      ),
      because:
        "the recorded GetAaveAppConfig response reports this reserve id, and " +
        "the app throws unless the on-chain getter agrees with it",
    });
  }

  return supplements;
}
