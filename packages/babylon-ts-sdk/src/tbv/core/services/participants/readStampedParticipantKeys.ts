/**
 * The participant keys an existing vault's scripts were built with.
 *
 * Rosters at the vault's stamped membership versions, then operation keys at
 * its frozen epochs — the same recipe the vault app runs on every resume
 * (`readStampedVaultContext` in services/vault). Lives in the SDK so the
 * claim-time context and terms builders and the refund context reader, which
 * have no app around them, read exactly what the deposit-time flow read.
 *
 * This is the way to get the keys for anything that rebuilds or signs for an
 * existing vault. The rosters alone hold registration keys, which differ from
 * the keys committed by any vault registered after a participant had rotated
 * its operation key.
 *
 * @module services/participants/readStampedParticipantKeys
 */

import type { Hex } from "viem";

import type {
  OperationKeyReader,
  UniversalChallengerReader,
  VaultBasicInfo,
  VaultKeeperReader,
  VaultProtocolInfo,
  VaultRegistryReader,
} from "../../clients/eth/types";
import { resolveParticipantKeysAtEpochs } from "./resolveParticipantKeys";
import type { ParticipantKeySet } from "./types";

/**
 * The reads this needs, as `Pick`s so a caller can pass the SDK's viem readers
 * or a narrower implementation.
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

/** Input to {@link readStampedParticipantKeys}. */
export interface ReadStampedParticipantKeysParams {
  /** The vault whose frozen key epochs to resolve at. */
  vaultId: Hex;
  /**
   * The vault's stamped provider, application and membership versions, read
   * from the registry. A full `VaultData` from `VaultRegistryReader.getVaultData`
   * satisfies it; a caller holding only these four fields can pass them alone.
   */
  vault: {
    /** The vault's provider and application entry point. */
    basic: Pick<VaultBasicInfo, "vaultProvider" | "applicationEntryPoint">;
    /** The membership versions the vault's rosters are read at. */
    protocol: Pick<
      VaultProtocolInfo,
      "appVaultKeepersVersion" | "universalChallengersVersion"
    >;
  };
  /** The on-chain reads; the SDK's viem readers satisfy every one. */
  readers: StampedParticipantKeyReaders;
}

/**
 * Read the operation keys an existing vault's scripts were built with: the
 * rosters at its stamped membership versions, resolved at its frozen key
 * epochs.
 *
 * @throws When either stamped roster is empty, or key resolution fails
 *         (`resolveParticipantKeysAtEpochs`).
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
