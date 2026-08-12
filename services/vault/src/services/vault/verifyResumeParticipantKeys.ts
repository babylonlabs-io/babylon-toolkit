/**
 * Pre-broadcast participant-key guard for the resume path.
 *
 * The inline deposit flow verifies participant keys right after registration
 * mines and before the BTC broadcast. A resume broadcasts the *same* Pre-PegIn
 * later — potentially days later, from another session — so it needs the same
 * assertion against the keys the scripts were actually built with, otherwise a
 * rotation that landed in between would be broadcast over.
 *
 * Reads the vault's frozen epochs and frozen membership rosters and re-resolves
 * from them, exactly as the payout and refund paths do.
 */

import {
  ParticipantKeyDriftError,
  canonicalizeBtcPubkey,
  resolveParticipantKeysAtEpochs,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

import {
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
  getVaultProviderGenesisBtcPubkeyFromChain,
} from "@/clients/eth-contract/btc-vault-registry/query";
import {
  getOperationKeyReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
} from "@/clients/eth-contract/sdk-readers";

/** The build-time keys persisted on the pending-pegin record. */
export interface ExpectedParticipantOperationKeys {
  vaultProvider: string;
  vaultKeepers: string[];
  universalChallengers: string[];
}

/**
 * Normalize a stamped key to the lowercase bare x-only form the resolved side
 * already has. A no-op for stamps written through `@/storage/peginStorage`,
 * which validates that shape — done here anyway so an encoding difference can
 * never read as drift if a second writer of the stamp appears.
 *
 * Not a `ParticipantKeyDriftError` on failure: nothing drifted, the stamp is
 * unreadable.
 */
function canonicalizeStamped(
  label: string,
  key: string,
  index?: number,
): string {
  try {
    return canonicalizeBtcPubkey(key);
  } catch (cause) {
    const at = index === undefined ? "" : ` at index ${index}`;
    throw new Error(
      `Cannot verify participant keys: the stamped value for ${label}${at} is ` +
        `not a readable BTC public key (${key}). The Pre-PegIn was not broadcast.`,
      { cause },
    );
  }
}

/**
 * Compare two key sets element-by-element, in order. Both sides are the sorted
 * arrays script construction consumes, so a set matching in a different order
 * is still a mismatch, and this is the only place that is caught — normalizing
 * below must not reorder anything.
 */
function assertSameSet(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): void {
  const expectedCanonical = expected.map((key, i) =>
    canonicalizeStamped(label, key, i),
  );

  if (
    expectedCanonical.length !== actual.length ||
    expectedCanonical.some((k, i) => k !== actual[i])
  ) {
    throw new ParticipantKeyDriftError(
      `Aborting Pre-PegIn broadcast: ${label} changed since this deposit was built ` +
        `(expected [${expectedCanonical.join(", ")}], got [${actual.join(", ")}]). ` +
        `The Pre-PegIn was not broadcast; the registered ETH vault will time out ` +
        `per protocol rules.`,
    );
  }
}

/**
 * Throw when the vault's frozen epochs no longer resolve to the keys the
 * Pre-PegIn was built with.
 *
 * Callers gate on the stamp being present: records written before this shipped
 * carry no `buildParticipantOperationKeys` and simply skip the check.
 *
 * Throws `ParticipantKeyDriftError`, which callers must NOT treat as a reason
 * to drop the pending record — see the class docs in the SDK.
 */
export async function verifyResumeParticipantKeys(params: {
  vaultId: Hex;
  expected: ExpectedParticipantOperationKeys;
}): Promise<void> {
  const { vaultId, expected } = params;
  const vault = await getVaultFromChain(vaultId);

  const [keeperReader, challengerReader, operationKeyReader] =
    await Promise.all([
      getVaultKeeperReader(),
      getUniversalChallengerReader(),
      getOperationKeyReader(),
    ]);

  const [vaultKeepers, universalChallengers, registrationVpBtcPubkey, epochs] =
    await Promise.all([
      keeperReader.getVaultKeepersByVersion(
        vault.applicationEntryPoint,
        vault.appVaultKeepersVersion,
      ),
      challengerReader.getUniversalChallengersByVersion(
        vault.universalChallengersVersion,
      ),
      getVaultProviderGenesisBtcPubkeyFromChain(vault.vaultProvider as Address),
      getVaultKeyEpochsFromChain(vaultId),
    ]);

  const resolved = await resolveParticipantKeysAtEpochs({
    operationKeyReader,
    query: {
      vaultProviderEthAddress: vault.vaultProvider as Address,
      vaultProviderGenesisBtcPubkey: registrationVpBtcPubkey,
      applicationEntryPoint: vault.applicationEntryPoint,
      vaultKeepers,
      universalChallengers,
    },
    epochs,
  });

  const expectedVp = canonicalizeStamped(
    "the vault provider's operation key",
    expected.vaultProvider,
  );
  if (resolved.vaultProvider.operationBtcPubkey !== expectedVp) {
    throw new ParticipantKeyDriftError(
      `Aborting Pre-PegIn broadcast: the vault provider's operation key changed ` +
        `since this deposit was built (expected ${expectedVp}, got ` +
        `${resolved.vaultProvider.operationBtcPubkey}). The Pre-PegIn was not ` +
        `broadcast; the registered ETH vault will time out per protocol rules.`,
    );
  }

  assertSameSet(
    "the vault keeper set",
    expected.vaultKeepers,
    resolved.vaultKeeperOperationKeysSorted,
  );
  assertSameSet(
    "the universal challenger set",
    expected.universalChallengers,
    resolved.universalChallengerOperationKeysSorted,
  );
}
