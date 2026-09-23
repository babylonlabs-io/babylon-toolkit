/**
 * The participant keys an existing vault's scripts were built with.
 *
 * Rosters at the vault's stamped membership versions, then operation keys at
 * its frozen epochs — the same recipe the vault app runs on every resume
 * (`readStampedVaultContext` in services/vault). Lives in the SDK so the
 * claim-time context and terms builders, which have no app around them, read
 * exactly what the deposit-time flow read.
 *
 * @module services/participants/readStampedParticipantKeys
 */

import type { Hex } from "viem";

import type {
  OperationKeyReader,
  UniversalChallengerReader,
  VaultData,
  VaultKeeperReader,
  VaultRegistryReader,
} from "../../clients/eth/types";
import { resolveParticipantKeysAtEpochs } from "./resolveParticipantKeys";
import type { ParticipantKeySet } from "./types";

/**
 * The reads this needs, as `Pick`s so a caller can pass the SDK's viem readers
 * or a narrower implementation.
 *
 * @experimental
 */
export interface StampedParticipantKeyReaders {
  registryReader: Pick<
    VaultRegistryReader,
    "getVaultProviderGenesisBtcPubKey" | "getVaultKeyEpochs"
  >;
  vaultKeeperReader: Pick<VaultKeeperReader, "getVaultKeepersByVersion">;
  universalChallengerReader: Pick<
    UniversalChallengerReader,
    "getUniversalChallengersByVersion"
  >;
  operationKeyReader: Pick<OperationKeyReader, "getOperationKeysAtEpochs">;
}

/** @experimental */
export interface ReadStampedParticipantKeysParams {
  vaultId: Hex;
  /** The vault's on-chain record, as `VaultRegistryReader.getVaultData` returns it. */
  vault: VaultData;
  readers: StampedParticipantKeyReaders;
}

/**
 * @throws When either stamped roster is empty, or key resolution fails
 *         (`resolveParticipantKeysAtEpochs`).
 * @experimental
 */
export async function readStampedParticipantKeys(
  params: ReadStampedParticipantKeysParams,
): Promise<ParticipantKeySet> {
  const { basic, protocol } = params.vault;
  const {
    registryReader,
    vaultKeeperReader,
    universalChallengerReader,
    operationKeyReader,
  } = params.readers;

  const [
    vaultKeepers,
    universalChallengers,
    vaultProviderGenesisBtcPubkey,
    epochs,
  ] = await Promise.all([
    vaultKeeperReader.getVaultKeepersByVersion(
      basic.applicationEntryPoint,
      protocol.appVaultKeepersVersion,
    ),
    universalChallengerReader.getUniversalChallengersByVersion(
      protocol.universalChallengersVersion,
    ),
    registryReader.getVaultProviderGenesisBtcPubKey(basic.vaultProvider),
    registryReader.getVaultKeyEpochs(params.vaultId),
  ]);

  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers for version ${protocol.appVaultKeepersVersion}`,
    );
  }
  if (universalChallengers.length === 0) {
    throw new Error(
      `No universal challengers for version ${protocol.universalChallengersVersion}`,
    );
  }

  return resolveParticipantKeysAtEpochs({
    operationKeyReader,
    query: {
      vaultProviderEthAddress: basic.vaultProvider,
      vaultProviderGenesisBtcPubkey:
        `0x${vaultProviderGenesisBtcPubkey}` as Hex,
      applicationEntryPoint: basic.applicationEntryPoint,
      vaultKeepers,
      universalChallengers,
    },
    epochs,
  });
}
