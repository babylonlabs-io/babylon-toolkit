import type { Address, Hex } from "viem";

import type {
  OperationKeyReader,
  UniversalChallengerReader,
  VaultKeeperReader,
  VaultRegistryReader,
} from "../../clients/eth/types";
import { canonicalizeBtcPubkey } from "../../primitives/utils/bitcoin";
import {
  type HintMatch,
  isHintAccepted,
  matchKeyHint,
  matchKeySetHint,
} from "../participants/indexerKeyHint";
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
  /**
   * Optional observer for the case where the indexer is serving a half-applied
   * view — one role explainable only by the registration keys, another only by
   * the operation keys. That blocks every deposit for the provider until the
   * indexer converges, and "Refresh and try again" cannot help, so the block
   * needs to be visible rather than showing up only as user reports. Called
   * immediately before the throw.
   */
  onIndexerHintsInconsistent?: (message: string) => void;
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

const sortedSet = (keys: string[]) => keys.map(canonicalizeBtcPubkey).sort();

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
    onIndexerHintsInconsistent,
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
    vaultProvider: canonicalizeBtcPubkey(onChainVpKey),
    vaultKeepers: sortedSet(onChainKeepers.map((p) => p.btcPubKey)),
    universalChallengers: sortedSet(onChainChallengers.map((p) => p.btcPubKey)),
  };

  // Resolve the current operation keys. This is what we build the Bitcoin lock
  // with; the registration keys above stay only as the primary comparison
  // target for indexer hints.
  //
  // Read unconditionally, which is why this path cannot use
  // `assertVaultProviderHintAccepted` — that helper reads the operation key
  // lazily, for callers that only need it to explain a hint mismatch.
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
  // so each role is accepted against both candidates — see `indexerKeyHint`,
  // which owns that policy and the whole-set matching rule. The cross-role
  // check below closes the same hole one level up.
  const vpMatch: HintMatch = matchKeyHint(
    expectedVaultProviderBtcPubkey,
    registrationKeys.vaultProvider,
    operationKeys.vaultProvider,
  );
  const keeperMatch: HintMatch = matchKeySetHint(
    expectedVaultKeeperBtcPubkeys,
    registrationKeys.vaultKeepers,
    operationKeys.vaultKeepers,
  );
  const challengerMatch: HintMatch = matchKeySetHint(
    expectedUniversalChallengerBtcPubkeys,
    registrationKeys.universalChallengers,
    operationKeys.universalChallengers,
  );

  if (!isHintAccepted(vpMatch)) {
    throw new Error(
      `Vault provider BTC pubkey indexer hint does not match BTCVaultRegistry for ${vaultProviderEthAddress}. Refresh and try again.`,
    );
  }
  if (!isHintAccepted(keeperMatch)) {
    throw new Error(
      `Vault keeper BTC pubkeys (v${expectedAppVaultKeepersVersion}) indexer set does not match ApplicationRegistry on-chain set. Refresh and try again.`,
    );
  }
  if (!isHintAccepted(challengerMatch)) {
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
    const message =
      `Indexer participant hints are internally inconsistent for vault provider ` +
      `${vaultProviderEthAddress}: some roles match the registration keys while ` +
      `others match the rotated operation keys.`;
    // Report before throwing. This state blocks every deposit for the provider
    // and clears only when the indexer converges across all three registries —
    // nothing the user does resolves it, so it has to be observable to us.
    onIndexerHintsInconsistent?.(message);
    throw new Error(`${message} Refresh and try again.`);
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
