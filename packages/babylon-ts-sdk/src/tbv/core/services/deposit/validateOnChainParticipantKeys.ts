import type { Address, Hex } from "viem";

import type {
  OperationKeyReader,
  UniversalChallengerReader,
  VaultKeeperReader,
  VaultRegistryReader,
} from "../../clients/eth/types";
import { processPublicKeyToXOnly } from "../../primitives/utils/bitcoin";
import { resolveCurrentParticipantKeys } from "../participants/resolveParticipantKeys";
import type { ParticipantKeySet } from "../participants/types";

export interface ValidateOnChainParticipantKeysParams {
  vaultRegistryReader: VaultRegistryReader;
  vaultKeeperReader: VaultKeeperReader;
  universalChallengerReader: UniversalChallengerReader;
  vaultProviderEthAddress: Address;
  applicationEntryPoint: Address;
  expectedVaultProviderBtcPubkey: string;
  expectedVaultKeeperBtcPubkeys: string[];
  expectedUniversalChallengerBtcPubkeys: string[];
  /**
   * RFC-006. Participant keys are resolved to their *current operation* keys,
   * and those are what the returned key fields carry.
   */
  operationKeyReader: OperationKeyReader;
  /**
   * Optional observer for the case where the indexer hint matched the
   * operation keys rather than the registration keys — i.e. the indexer is
   * ahead of us, not wrong. Called at most once.
   */
  onIndexerServingOperationKeys?: (message: string) => void;
}

export interface ValidatedOnChainParticipantKeys {
  /** The VP key to build with: its current operation key. */
  vaultProviderBtcPubkeyXOnly: string;
  vaultKeeperBtcPubkeysSorted: string[];
  universalChallengerBtcPubkeysSorted: string[];
  expectedAppVaultKeepersVersion: number;
  expectedUniversalChallengersVersion: number;
  /**
   * The registration / roster keys, sorted. These are what indexer hints are
   * compared against first, and they stay available for diagnostics after
   * resolution.
   */
  registrationKeys: {
    vaultProvider: string;
    vaultKeepers: string[];
    universalChallengers: string[];
  };
  /**
   * The full resolution, including the admin↔key pairing. Feeds the
   * post-registration read-after-mine verification.
   */
  participantKeys: ParticipantKeySet;
}

const canonical = (k: string) => processPublicKeyToXOnly(k).toLowerCase();
const sortedSet = (keys: string[]) => keys.map(canonical).sort();

function setsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

export async function validateOnChainParticipantKeys(
  params: ValidateOnChainParticipantKeysParams,
): Promise<ValidatedOnChainParticipantKeys> {
  const {
    vaultRegistryReader,
    vaultKeeperReader,
    universalChallengerReader,
    vaultProviderEthAddress,
    applicationEntryPoint,
    expectedVaultProviderBtcPubkey,
    expectedVaultKeeperBtcPubkeys,
    expectedUniversalChallengerBtcPubkeys,
    operationKeyReader,
    onIndexerServingOperationKeys,
  } = params;

  const [
    onChainVpKey,
    expectedAppVaultKeepersVersion,
    expectedUniversalChallengersVersion,
  ] = await Promise.all([
    vaultRegistryReader.getVaultProviderBtcPubKey(vaultProviderEthAddress),
    vaultKeeperReader.getCurrentVaultKeepersVersion(applicationEntryPoint),
    universalChallengerReader.getLatestUniversalChallengersVersion(),
  ]);

  const [onChainKeepers, onChainChallengers] = await Promise.all([
    vaultKeeperReader.getVaultKeepersByVersion(
      applicationEntryPoint,
      expectedAppVaultKeepersVersion,
    ),
    universalChallengerReader.getUniversalChallengersByVersion(
      expectedUniversalChallengersVersion,
    ),
  ]);

  const registrationKeys = {
    vaultProvider: canonical(onChainVpKey),
    vaultKeepers: sortedSet(onChainKeepers.map((p) => p.btcPubKey)),
    universalChallengers: sortedSet(onChainChallengers.map((p) => p.btcPubKey)),
  };

  // Resolve the current operation keys, if enabled. This is what we build the
  // Bitcoin lock with; the registration keys above stay only as the primary
  // comparison target for indexer hints.
  const participantKeys: ParticipantKeySet =
    await resolveCurrentParticipantKeys({
      operationKeyReader,
      query: {
        vaultProviderEthAddress,
        vaultProviderGenesisBtcPubkey: `0x${onChainVpKey}` as Hex,
        applicationEntryPoint,
        vaultKeepers: onChainKeepers,
        universalChallengers: onChainChallengers,
      },
    });

  const operationKeys = {
    vaultProvider: participantKeys.vaultProvider.operationBtcPubkey as string,
    vaultKeepers: [...participantKeys.vaultKeeperOperationKeysSorted],
    universalChallengers: [
      ...participantKeys.universalChallengerOperationKeysSorted,
    ],
  };

  // --- Indexer hint cross-check -----------------------------------------
  //
  // The hint never influences the resolved key — resolution is chain-only.
  // Its job is to catch a wrong VP address, a wrong application entry point,
  // or a stale roster version, and it still does that.
  //
  // Once rotation is possible the indexer may legitimately serve either the
  // registration keys (it has not caught up) or the operation keys (it has),
  // so each role is accepted against both candidates. For a role that never
  // rotated the two candidates are identical, so this is strictly the old
  // check until someone rotates.
  //
  // Each role is compared as a *whole set*, never as per-element membership of
  // the union: a keeper set holding one registration key and one operation key
  // is an indexer inconsistency, and union membership would wave it through.
  // The cross-role check below closes the same hole one level up.
  const hintVp = canonical(expectedVaultProviderBtcPubkey);
  const hintKeepers = sortedSet(expectedVaultKeeperBtcPubkeys);
  const hintChallengers = sortedSet(expectedUniversalChallengerBtcPubkeys);

  /** Which of the two candidate sets a role's hint matched. */
  interface RoleMatch {
    registration: boolean;
    operation: boolean;
  }

  const vpMatch: RoleMatch = {
    registration: hintVp === registrationKeys.vaultProvider,
    operation: hintVp === operationKeys.vaultProvider,
  };
  const keeperMatch: RoleMatch = {
    registration: setsEqual(hintKeepers, registrationKeys.vaultKeepers),
    operation: setsEqual(hintKeepers, operationKeys.vaultKeepers),
  };
  const challengerMatch: RoleMatch = {
    registration: setsEqual(
      hintChallengers,
      registrationKeys.universalChallengers,
    ),
    operation: setsEqual(hintChallengers, operationKeys.universalChallengers),
  };

  const accepted = (m: RoleMatch) => m.registration || m.operation;

  if (!accepted(vpMatch)) {
    throw new Error(
      `Vault provider BTC pubkey indexer hint does not match BTCVaultRegistry for ${vaultProviderEthAddress}. Refresh and try again.`,
    );
  }
  if (!accepted(keeperMatch)) {
    throw new Error(
      `Vault keeper BTC pubkeys (v${expectedAppVaultKeepersVersion}) indexer set does not match ApplicationRegistry on-chain set. Refresh and try again.`,
    );
  }
  if (!accepted(challengerMatch)) {
    throw new Error(
      `Universal challenger BTC pubkeys (v${expectedUniversalChallengersVersion}) indexer set does not match ProtocolParams on-chain set. Refresh and try again.`,
    );
  }

  // Cross-role consistency. A role whose two candidates are identical (nobody
  // in it rotated) matches both and constrains nothing. But if one role can
  // *only* be explained by the registration keys while another can *only* be
  // explained by the operation keys, the indexer is serving a half-applied
  // view — accepting that would mean building with a key set no single
  // snapshot of the indexer ever held.
  const roles = [vpMatch, keeperMatch, challengerMatch];
  const pinsRegistration = roles.some((m) => m.registration && !m.operation);
  const pinsOperation = roles.some((m) => m.operation && !m.registration);

  if (pinsRegistration && pinsOperation) {
    throw new Error(
      `Indexer participant hints are internally inconsistent for vault provider ` +
        `${vaultProviderEthAddress}: some roles match the registration keys while ` +
        `others match the rotated operation keys. Refresh and try again.`,
    );
  }

  if (pinsOperation) {
    onIndexerServingOperationKeys?.(
      `Indexer is serving rotated operation keys for vault provider ${vaultProviderEthAddress}`,
    );
  }

  return {
    vaultProviderBtcPubkeyXOnly: operationKeys.vaultProvider,
    vaultKeeperBtcPubkeysSorted: operationKeys.vaultKeepers,
    universalChallengerBtcPubkeysSorted: operationKeys.universalChallengers,
    expectedAppVaultKeepersVersion,
    expectedUniversalChallengersVersion,
    registrationKeys,
    participantKeys,
  };
}
