/**
 * RFC-006 participant operation-key resolution.
 *
 * Under RFC-006 an operator's BTC key is no longer fixed at registration: it
 * is an append-only history of *operation* keys, rotated by the operator's
 * cold ETH admin key. Every consumer that needs "the key this participant
 * signs with" must resolve it, in one of two modes:
 *
 * - **current** — for a peg-in being built now, and for the VP auth pin.
 *   Needs no epoch read; each registry resolves its own genesis fallback, so
 *   an operator that never rotated yields its registration key.
 * - **at epochs** — for any vault that already exists. The vault froze its
 *   epochs at `submitPeginRequest`, and resolving against them is what keeps
 *   an old vault signable after a later rotation.
 *
 * Both modes go through the same `finalize` pass, which is where the
 * rotation-specific safety checks live.
 *
 * @module services/participants/resolveParticipantKeys
 */

import { assertOnChainBtcPubkey } from "../../clients/eth/onChainBtcPubkey";
import type {
  KeyEpochs,
  OperationKeyQuery,
  OperationKeyReader,
  RawOperationKeys,
} from "../../clients/eth/types";
import type {
  KeyResolutionMode,
  ParticipantKeySet,
  ResolvedParticipant,
} from "./types";

/** Role label used in validation error messages. */
type Role = "vault provider" | "vault keeper" | "universal challenger";

function resolveOne(
  role: Role,
  rosterEntry: { ethAddress: `0x${string}`; btcPubKey: `0x${string}` },
  rawOperationKey: `0x${string}`,
): ResolvedParticipant {
  const label = `${role} operation key (admin=${rosterEntry.ethAddress})`;
  const genesisBtcPubkey = assertOnChainBtcPubkey(
    rosterEntry.btcPubKey,
    `${role} roster key (admin=${rosterEntry.ethAddress})`,
  );
  const operationBtcPubkey = assertOnChainBtcPubkey(rawOperationKey, label);

  return {
    adminAddress: rosterEntry.ethAddress,
    genesisBtcPubkey,
    operationBtcPubkey,
    rotated: operationBtcPubkey !== genesisBtcPubkey,
  };
}

/**
 * Assert no two participants resolved to the same operation key.
 *
 * The on-chain guarantees are narrower than "registration keys are distinct",
 * and narrower than an earlier revision of this comment claimed. Each registry
 * enforces uniqueness *within its own role*, on rotation as well as
 * registration, and a VP rotation additionally rejects any key held in the
 * current vault-keeper or universal-challenger rosters.
 *
 * What no contract checks is the cross-role direction those rules leave open:
 * a keeper or challenger rotating **onto** the VP's key (the VP-side check runs
 * at VP rotation time and does not run again when a keeper moves), a keeper and
 * a challenger colliding with each other, and keepers of different applications
 * colliding. Any of those would collapse two entries in the sorted script key
 * set and silently build a lock with the wrong participant count, so they are
 * rejected here — before any script is constructed — rather than surfacing as a
 * confusing signature mismatch much later.
 */
function assertDistinctOperationKeys(
  participants: ResolvedParticipant[],
): void {
  const seen = new Map<string, string>();
  for (const participant of participants) {
    const previousOwner = seen.get(participant.operationBtcPubkey);
    if (previousOwner) {
      throw new Error(
        `Participant operation key collision: ${previousOwner} and ` +
          `${participant.adminAddress} both resolve to operation key ` +
          `${participant.operationBtcPubkey}`,
      );
    }
    seen.set(participant.operationBtcPubkey, participant.adminAddress);
  }
}

function finalize(
  query: OperationKeyQuery,
  raw: RawOperationKeys,
  resolvedAt: KeyResolutionMode,
): ParticipantKeySet {
  if (
    raw.vaultKeepers.length !== query.vaultKeepers.length ||
    raw.universalChallengers.length !== query.universalChallengers.length
  ) {
    throw new Error(
      `Operation-key resolution returned ${raw.vaultKeepers.length} keeper and ` +
        `${raw.universalChallengers.length} challenger keys for a roster of ` +
        `${query.vaultKeepers.length} keepers and ` +
        `${query.universalChallengers.length} challengers`,
    );
  }

  const vaultProvider = resolveOne(
    "vault provider",
    {
      ethAddress: query.vaultProviderEthAddress,
      btcPubKey: query.vaultProviderGenesisBtcPubkey,
    },
    raw.vaultProvider,
  );

  const vaultKeepers = query.vaultKeepers.map((keeper, i) =>
    resolveOne("vault keeper", keeper, raw.vaultKeepers[i]),
  );
  const universalChallengers = query.universalChallengers.map((challenger, i) =>
    resolveOne("universal challenger", challenger, raw.universalChallengers[i]),
  );

  assertDistinctOperationKeys([
    vaultProvider,
    ...vaultKeepers,
    ...universalChallengers,
  ]);

  return {
    vaultProvider,
    vaultKeepers,
    universalChallengers,
    // Derived from the pairs, never the reverse — see ParticipantKeySet.
    vaultKeeperOperationKeysSorted: vaultKeepers
      .map((p) => p.operationBtcPubkey as string)
      .sort(),
    universalChallengerOperationKeysSorted: universalChallengers
      .map((p) => p.operationBtcPubkey as string)
      .sort(),
    resolvedAt,
    query,
  };
}

/**
 * Resolve every participant's *current* operation key.
 *
 * Use for a peg-in being built now. Issues no epoch read, so it never touches
 * the extended `getBtcVaultProtocolInfo` ABI.
 *
 * `blockNumber` pins the resolution to one block, and is required. Pass the
 * same block the rosters in `query` were read at: the roster supplies each
 * participant's address and genesis key, and this call resolves what that
 * participant has rotated to. Reading the two at different blocks can pair a
 * roster member with a key from a different chain state, so there is no
 * correct unpinned call and no default worth having.
 */
export async function resolveCurrentParticipantKeys(params: {
  operationKeyReader: OperationKeyReader;
  query: OperationKeyQuery;
  blockNumber: bigint;
}): Promise<ParticipantKeySet> {
  const raw = await params.operationKeyReader.getCurrentOperationKeys(
    params.query,
    params.blockNumber,
  );
  return finalize(params.query, raw, { mode: "current" });
}

/**
 * Resolve every participant's operation key bonded at a vault's frozen epochs.
 *
 * Use for every existing-vault path: resume, payout signing, refund. The
 * rosters in `query` must be read at the vault's frozen *membership* versions,
 * because those roster keys are the genesis the keeper/challenger getters fall
 * back to.
 */
export async function resolveParticipantKeysAtEpochs(params: {
  operationKeyReader: OperationKeyReader;
  query: OperationKeyQuery;
  epochs: KeyEpochs;
}): Promise<ParticipantKeySet> {
  const raw = await params.operationKeyReader.getOperationKeysAtEpochs(
    params.query,
    params.epochs,
  );
  return finalize(params.query, raw, {
    mode: "epochs",
    epochs: params.epochs,
  });
}
