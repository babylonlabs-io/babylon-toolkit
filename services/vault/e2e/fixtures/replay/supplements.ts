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
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  encodeFunctionResult,
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

/** `AaveIntegrationAdapter.BTC_VAULT_CORE_SPOKE()`, same reasoning as above. */
const BTC_VAULT_CORE_SPOKE_ABI = parseAbi([
  "function BTC_VAULT_CORE_SPOKE() view returns (address)",
]);

/** `ISpoke.getReserve`, with the `ISpoke.Reserve` struct layout. */
const GET_RESERVE_ABI = parseAbi([
  "struct Reserve { address underlying; address hub; uint16 assetId; uint8 decimals; uint24 collateralRisk; uint8 flags; uint32 dynamicConfigKey; }",
  "function getReserve(uint256 reserveId) view returns (Reserve)",
]);

/** `ReserveFlagsMap` bit masks from aave-v4 `spoke/libraries/ReserveFlagsMap.sol`. */
const RESERVE_PAUSED_MASK = 0x01;
const RESERVE_FROZEN_MASK = 0x02;
const RESERVE_BORROWABLE_MASK = 0x04;

export interface Supplement {
  readonly target: string;
  readonly callData: Hex;
  readonly returnData: Hex;
  /** Why this value is the recording's own, quoted in review. */
  readonly because: string;
}

/**
 * The recording's own successful answer to an exact call, or null when it
 * holds none.
 */
export type RecordedAnswer = (target: string, callData: Hex) => Hex | null;

/** GraphQL sends a missing field as null, so every field may be absent either way. */
interface RecordedReserveRow {
  readonly id?: string | null;
  readonly underlying?: Hex | null;
  readonly hub?: Hex | null;
  readonly assetId?: number | null;
  readonly decimals?: number | null;
  readonly collateralRisk?: number | null;
  readonly dynamicConfigKey?: number | string | null;
  readonly paused?: boolean | null;
  readonly frozen?: boolean | null;
  readonly borrowable?: boolean | null;
}

interface RecordedAaveAppConfig {
  readonly data?: {
    readonly aaveConfig?: {
      readonly adapterAddress?: string;
      readonly vaultBtcReserveId?: string;
    };
    readonly aaveReserves?: {
      readonly items?: readonly RecordedReserveRow[];
    };
  };
}

function reserveFlags(row: {
  paused: boolean;
  frozen: boolean;
  borrowable: boolean;
}): number {
  return (
    (row.paused ? RESERVE_PAUSED_MASK : 0) |
    (row.frozen ? RESERVE_FROZEN_MASK : 0) |
    (row.borrowable ? RESERVE_BORROWABLE_MASK : 0)
  );
}

/**
 * `fetchAaveAppConfig` proves every indexed reserve against the Core Spoke's
 * `getReserve` and throws on any disagreement, so each answer must equal the
 * recorded GetAaveAppConfig row for that reserve - any other value would trip
 * the app's own mismatch error. The spoke those reads target is the recorded
 * answer to the adapter's `BTC_VAULT_CORE_SPOKE()`.
 *
 * The receive-shares flag bit is not in the recording and is left clear;
 * nothing the app reads from `getReserve` depends on it. A row missing any
 * field the answer needs is skipped rather than completed with a guess.
 */
function reserveSupplements(
  data: RecordedAaveAppConfig["data"],
  recorded: RecordedAnswer,
): Supplement[] {
  const adapterAddress = data?.aaveConfig?.adapterAddress;
  const rows = data?.aaveReserves?.items ?? [];
  if (!adapterAddress || rows.length === 0) return [];

  const coreSpokeAnswer = recorded(
    adapterAddress,
    toFunctionSelector(BTC_VAULT_CORE_SPOKE_ABI[0]),
  );
  if (coreSpokeAnswer === null) return [];
  const coreSpoke = decodeFunctionResult({
    abi: BTC_VAULT_CORE_SPOKE_ABI,
    functionName: "BTC_VAULT_CORE_SPOKE",
    data: coreSpokeAnswer,
  });

  const supplements: Supplement[] = [];
  for (const row of rows) {
    if (
      row.id == null ||
      row.underlying == null ||
      row.hub == null ||
      row.assetId == null ||
      row.decimals == null ||
      row.collateralRisk == null ||
      row.dynamicConfigKey == null ||
      row.paused == null ||
      row.frozen == null ||
      row.borrowable == null
    ) {
      continue;
    }
    supplements.push({
      target: coreSpoke,
      callData: encodeFunctionData({
        abi: GET_RESERVE_ABI,
        functionName: "getReserve",
        args: [BigInt(row.id)],
      }),
      returnData: encodeFunctionResult({
        abi: GET_RESERVE_ABI,
        functionName: "getReserve",
        result: {
          underlying: row.underlying,
          hub: row.hub,
          assetId: row.assetId,
          decimals: row.decimals,
          collateralRisk: row.collateralRisk,
          flags: reserveFlags({
            paused: row.paused,
            frozen: row.frozen,
            borrowable: row.borrowable,
          }),
          dynamicConfigKey: Number(row.dynamicConfigKey),
        },
      }),
      because:
        `the recorded GetAaveAppConfig response lists reserve ${row.id} with ` +
        "these fields, and the app throws unless the Core Spoke agrees with it",
    });
  }
  return supplements;
}

/**
 * Derive the supplements a given run needs.
 *
 * Derived per run rather than hardcoded: re-recording against a deployment
 * with a different reserve id updates this automatically, where a literal
 * would keep asserting the old one and the app's own cross-check would throw.
 */
export function buildSupplements(
  run: RecordedRun,
  recorded: RecordedAnswer,
): Supplement[] {
  const supplements: Supplement[] = [];

  const data = (run.byBackend.get("graphql") ?? [])
    .map((entry) => parseJson<RecordedAaveAppConfig>(entry.resBody)?.data)
    .findLast(
      (response) => response?.aaveConfig?.vaultBtcReserveId !== undefined,
    );

  // `fetchAaveAppConfig` reads the vBTC reserve id from the adapter and
  // refuses to continue unless it equals the id the indexer reported - a
  // deliberate guard against a compromised indexer aiming collateral maths at
  // another reserve. The recording holds the indexer's side of that
  // comparison, so the on-chain side it is checked against is recoverable
  // exactly: any other value would trip the app's own mismatch error.
  const aaveConfig = data?.aaveConfig;
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

  supplements.push(...reserveSupplements(data, recorded));

  return supplements;
}
