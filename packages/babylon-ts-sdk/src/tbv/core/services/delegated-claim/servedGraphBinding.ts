/**
 * Checks on the vault provider's served graph that run before any PSBT is
 * built or any wallet is prompted.
 *
 * The graph arrives from the vault provider and carries the presignatures a
 * claim needs to complete: the VP, vault keeper and universal challenger
 * signatures on the Assert and Payout, and the depositor's own NoPayout
 * signature per challenger. A bad one is otherwise caught only at assembly
 * (`buildWatchtowerArtifacts`), after the depositor has signed everything,
 * and the Claim signature already spends the claim reserve on its own.
 *
 * The WASM verifier checks each signature against the key the graph itself
 * carries (btc-vault 5bc96f5c `sign.rs:318-358`), so a vault provider could
 * swap in keys it controls and sign with them. So these are bound to the
 * vault's on-chain values first: every key a presignature is verified
 * against (vault provider, vault keepers, universal challengers, the local
 * and universal challenger sets), the claimer and depositor keys including
 * the Claim's signing key, and the PegIn and Assert timelocks. Not bound
 * here: the council keys, `timelock_challenge_assert`, `timelock_refund` and
 * each challenger's own key (`challenger`, `challenger_pubkey`) in the
 * Assert's challenger connectors and the challenger subgraphs. At this rev the artifact verifier also
 * never compares the graph's top-level `claimer_pubkey` with its connectors.
 *
 * @module services/delegated-claim/servedGraphBinding
 */

import { deriveLocalChallengers } from "../../primitives/challengers";
import { loadTbvWasm, verifyGraphPresignatures } from "../../wasm";

import type { DelegatedClaimVaultContext } from "./types";
import { xOnlyHex } from "./walletIdentity";

/**
 * Thrown when a participant key or timelock in the served graph is not the
 * vault's on-chain value.
 *
 * @experimental
 */
export class GraphParticipantMismatchError extends Error {
  constructor(
    /** JSON path of the offending field, e.g. `payout_tx.vault_utxo_spender.connector.vault_keepers`. */
    readonly path: string,
    /** Value found at `path`, or a placeholder when it is not a key, key set or number. */
    readonly found: string,
    /** The vault's on-chain value for that field. */
    readonly expected: string,
  ) {
    super(
      `Served graph has ${found} at ${path}, but the vault's on-chain value ` +
        `is ${expected}. Refusing to sign a claim built for other participants.`,
    );
    this.name = "GraphParticipantMismatchError";
  }
}

/**
 * Thrown when the WASM verifier rejects the served graph: it does not decode,
 * or a presignature in it is missing or invalid.
 *
 * @experimental
 */
export class GraphPresignatureError extends Error {
  constructor(
    /** The WASM verifier's rejection; it can quote served graph content. */
    cause: unknown,
  ) {
    super(
      "Served graph is malformed or its presignatures do not verify. " +
        "Refusing to sign a claim that could not complete.",
      { cause },
    );
    this.name = "GraphPresignatureError";
  }
}

/**
 * On-chain values the served graph's participants must match.
 *
 * @experimental
 */
export type ServedGraphParticipants = Pick<
  DelegatedClaimVaultContext,
  | "depositorBtcPubkey"
  | "vaultProviderBtcPubkey"
  | "vaultKeeperBtcPubkeys"
  | "universalChallengerBtcPubkeys"
  | "timelockPegin"
  | "timelockAssert"
>;

/** @experimental */
export interface AssertServedGraphPresignedParams {
  txGraphVersion: number;
  /** Graph JSON as the vault provider served it. */
  graphJson: string;
  vault: ServedGraphParticipants;
}

/**
 * Throws unless the graph's bound participant keys and timelocks (see the
 * module doc) are the vault's on-chain values and every presignature verifies.
 *
 * @throws {@link GraphParticipantMismatchError} on a foreign, missing or
 *         malformed participant key, key set or timelock.
 * @throws {@link GraphPresignatureError} when the WASM verifier rejects the graph.
 * @throws A plain `Error` when the graph is not valid JSON or not a JSON
 *         object, when the WASM engine fails to load (a local fault, not the
 *         vault provider's), or when `vault` holds a key that is not
 *         compressed or x-only hex, a duplicate key, or no vault keeper other
 *         than the depositor.
 * @experimental
 */
export async function assertServedGraphPresigned(
  params: AssertServedGraphPresignedParams,
): Promise<void> {
  assertParticipantsMatchVault(params.graphJson, params.vault);
  // Loaded outside the catch so a local load failure is not blamed on the graph.
  await loadTbvWasm();
  try {
    await verifyGraphPresignatures(params.txGraphVersion, params.graphJson);
  } catch (cause) {
    throw new GraphPresignatureError(cause);
  }
}

interface FieldRule {
  matches(value: unknown): boolean;
  expected: string;
}

// btc-vault 5bc96f5c field names: TxGraph (tx_graph/graph.rs) and each
// connector (connectors/, transactions/), all plain-serde.
const KEY_FIELDS = {
  depositor: ["claimer", "claimer_pubkey", "depositor", "depositor_pubkey"],
  vaultProvider: ["vault_provider", "vault_provider_pubkey"],
  vaultKeepers: ["vault_keepers"],
  universalChallengers: ["universal_challengers"],
  challengers: ["challengers", "challenger_pubkeys"],
} as const;
// Present on every graph; an absent one would let the walk pass unchecked.
const REQUIRED_TOP_LEVEL_FIELDS = [
  "claimer_pubkey",
  "depositor_pubkey",
  "vault_provider_pubkey",
  "vault_keepers",
  "universal_challengers",
  "challenger_pubkeys",
];
const CLAIM_KEY_PATH = "pegin_tx.depositor_claim_connector.pubkey";
const X_ONLY_HEX = /^[0-9a-f]{64}$/;
// Field names and challenger keys; anything else is VP content, not echoed.
const SAFE_PATH_SEGMENT = /^[a-z0-9_]+$/;

function assertParticipantsMatchVault(
  graphJson: string,
  vault: ServedGraphParticipants,
): void {
  let graph: unknown;
  try {
    graph = JSON.parse(graphJson);
  } catch {
    // The parser's message quotes the input.
    throw new Error("Served graph is not valid JSON.");
  }
  if (graph === null || typeof graph !== "object" || Array.isArray(graph)) {
    throw new Error("Served graph is not a JSON object.");
  }
  const { rules, pathRules } = participantRules(vault);
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    const rule = rules.get(field);
    if (rule === undefined) throw new Error(`No rule for required field ${field}.`);
    if (!Object.hasOwn(graph, field)) {
      throw new GraphParticipantMismatchError(field, "nothing", rule.expected);
    }
  }
  walk(graph, "", rules, pathRules);
}

function participantRules(vault: ServedGraphParticipants): {
  rules: Map<string, FieldRule>;
  pathRules: Map<string, FieldRule>;
} {
  const depositor = xOnlyHex(vault.depositorBtcPubkey);
  const vaultProvider = xOnlyHex(vault.vaultProviderBtcPubkey);
  const keepers = uniqueKeys(vault.vaultKeeperBtcPubkeys, "vault keeper");
  const universal = uniqueKeys(
    vault.universalChallengerBtcPubkeys,
    "universal challenger",
  );
  // The depositor is the claimer, so the local challengers are the keepers.
  const local = deriveLocalChallengers({
    claimerBtcPubkey: depositor,
    depositorBtcPubkey: depositor,
    vaultProviderBtcPubkey: vaultProvider,
    vaultKeeperBtcPubkeys: keepers,
  });

  const rules = new Map<string, FieldRule>();
  const add = (fields: readonly string[], rule: FieldRule) => {
    for (const field of fields) rules.set(field, rule);
  };
  add(KEY_FIELDS.depositor, keyRule(depositor));
  add(KEY_FIELDS.vaultProvider, keyRule(vaultProvider));
  add(KEY_FIELDS.vaultKeepers, keySetRule(keepers));
  add(KEY_FIELDS.universalChallengers, keySetRule(universal));
  add(KEY_FIELDS.challengers, {
    matches: (value) =>
      isPlainObject(value) &&
      Object.keys(value).sort().join() === "local,universal" &&
      sameKeySet(value.local, local) &&
      sameKeySet(value.universal, universal),
    expected: `local [${local.join(", ")}] universal [${universal.join(", ")}]`,
  });
  add(["timelock_pegin"], numberRule(vault.timelockPegin));
  add(["timelock_assert"], numberRule(vault.timelockAssert));
  // The Claim's leaf and signing key (sign.rs finalize_claim_tx); its field
  // name, `pubkey`, says nothing about the role, so it is bound by path.
  const pathRules = new Map([[CLAIM_KEY_PATH, keyRule(depositor)]]);
  return { rules, pathRules };
}

function uniqueKeys(keys: readonly string[], role: string): string[] {
  const xOnly = keys.map(xOnlyHex);
  if (new Set(xOnly).size !== xOnly.length) {
    throw new Error(`The vault context lists the same ${role} key more than once.`);
  }
  return xOnly;
}

function keyRule(expected: string): FieldRule {
  return { matches: (value) => value === expected, expected };
}

function keySetRule(expected: string[]): FieldRule {
  return {
    matches: (value) => sameKeySet(value, expected),
    expected: `[${expected.join(", ")}]`,
  };
}

function numberRule(expected: number): FieldRule {
  return { matches: (value) => value === expected, expected: String(expected) };
}

function sameKeySet(value: unknown, expected: string[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  const seen = new Set(value);
  return seen.size === value.length && expected.every((key) => seen.has(key));
}

function walk(
  value: unknown,
  path: string,
  rules: Map<string, FieldRule>,
  pathRules: Map<string, FieldRule>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walk(item, `${path}[${index}]`, rules, pathRules),
    );
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const segment = SAFE_PATH_SEGMENT.test(key) ? key : "<key>";
    const childPath = path === "" ? segment : `${path}.${segment}`;
    const rule = rules.get(key) ?? pathRules.get(childPath);
    if (rule === undefined) {
      walk(child, childPath, rules, pathRules);
      continue;
    }
    if (!rule.matches(child)) {
      throw new GraphParticipantMismatchError(childPath, describe(child), rule.expected);
    }
  }
}

/** Echo only keys, key sets and numbers; anything else could be arbitrary VP content. */
function describe(value: unknown): string {
  if (isXOnly(value)) return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every(isXOnly)) return `[${value.join(", ")}]`;
  if (
    isPlainObject(value) &&
    Array.isArray(value.local) &&
    value.local.every(isXOnly) &&
    Array.isArray(value.universal) &&
    value.universal.every(isXOnly)
  ) {
    return `local [${value.local.join(", ")}] universal [${value.universal.join(", ")}]`;
  }
  return "a malformed value";
}

function isXOnly(value: unknown): value is string {
  return typeof value === "string" && X_ONLY_HEX.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
