import { isAddress, isAddressEqual } from "viem";
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
  /**
   * The application entry point the caller believes the provider serves — a
   * *hint*, checked against the registry, in the same sense as
   * `expectedVaultProviderBtcPubkey` below.
   *
   * The registry's own `getVaultProviderApplication(vp)` is authoritative: it
   * is what the peg-in submit path resolves internally, and it selects the
   * keeper roster, the roster version and the keeper key epoch a deposit is
   * bonded to. This value comes from the dApp's configuration instead. They
   * agree today, so the check is normally a no-op — but if they ever diverge,
   * building against the configured one would bond the vault to an application
   * the caller never chose, and nothing downstream would say so.
   */
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
  /**
   * Block to resolve every read against, so the roster versions, the roster
   * members and their operation keys all describe one chain state.
   *
   * This function reads in four dependent rounds — the application entry point
   * and the challenger axis, then the keeper version and epoch keyed on that
   * entry point, then the roster members at those versions, then those members'
   * operation keys — because each round needs the previous round's output.
   * Left unpinned, each round lands on
   * whatever `latest` happens to be, and a rotation between rounds yields a key
   * set that no single block ever held. The Bitcoin lock built from it would
   * commit to that mixture, and no counterparty would agree with it.
   *
   * Required rather than optional, and deliberately so. This function exists
   * only for the fresh-deposit path, where an unpinned read is never correct —
   * an optional pin would be a silent fallback to `latest`-per-round on a path
   * that builds a Bitcoin lock. Callers must pass the same block to
   * `ProtocolParamsReader.getPegInConfiguration`; the reader interfaces keep
   * their pin optional because their other callers resolve against a vault's
   * already-frozen epochs, where pinning is meaningless.
   */
  blockNumber: bigint;
}

export interface ValidatedOnChainParticipantKeys {
  /** The VP key to build with: its current operation key. */
  vaultProviderBtcPubkeyXOnly: string;
  vaultKeeperBtcPubkeysSorted: string[];
  universalChallengerBtcPubkeysSorted: string[];
  expectedAppVaultKeepersVersion: number;
  expectedUniversalChallengersVersion: number;
  /**
   * The two operation-key epochs the peg-in config fingerprint commits to, as
   * `bigint` (`uint64` on-chain).
   *
   * They live here rather than beside the protocol params because they label
   * the very keys this function resolves: `appKeeperKeyEpoch` is the epoch the
   * keeper operation keys above were read at, and `ucKeyEpoch` the same for the
   * challengers. Reading them anywhere else would create a second place for the
   * epoch and the keys it names to come from different blocks.
   */
  appKeeperKeyEpoch: bigint;
  ucKeyEpoch: bigint;
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

/**
 * The application entry point the caller passed cannot be used, either because
 * the registry says this vault provider serves a different one, or because the
 * value is not a well-formed address so no comparison is possible.
 *
 * Both are a deployment or configuration fault — not chain drift, and not
 * anything a depositor can act on. One class covers both because the caller's
 * recovery is identical and the distinction only matters in a bug report, which
 * the message carries.
 *
 * It is typed only so the consuming app can recognise it and show its own
 * generic copy: the messages name addresses and the protocol values at stake,
 * which belongs in that bug report rather than in front of a depositor. An
 * untyped `Error` would be rendered verbatim as the callout body by the
 * mapper's last-resort bucket.
 */
export class ApplicationEntryPointMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationEntryPointMismatchError";
  }
}

// `instanceof` alone fails across module boundaries (duplicate copies, test
// mocks). Fall back to the name field, as the sibling drift guards do.
export function isApplicationEntryPointMismatchError(
  err: unknown,
): err is ApplicationEntryPointMismatchError {
  return (
    err instanceof ApplicationEntryPointMismatchError ||
    (err instanceof Error && err.name === "ApplicationEntryPointMismatchError")
  );
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
    blockNumber,
  } = params;

  // Round 1: everything that needs no other read's output. The application
  // entry point is among them because the keeper reads below key on it, and it
  // must come from the registry rather than from the caller's configuration.
  const [
    registryApplicationEntryPoint,
    onChainVpKey,
    expectedUniversalChallengersVersion,
    ucKeyEpoch,
  ] = await Promise.all([
    vaultRegistryReader.getVaultProviderApplication(
      vaultProviderEthAddress,
      blockNumber,
    ),
    vaultRegistryReader.getVaultProviderGenesisBtcPubKey(
      vaultProviderEthAddress,
      blockNumber,
    ),
    universalChallengerReader.getLatestUniversalChallengersVersion(blockNumber),
    universalChallengerReader.getCurrentUcKeyEpoch(blockNumber),
  ]);

  // Fail closed before any roster is read. A divergence here is a deployment or
  // configuration fault rather than something the depositor can act on, so it
  // carries a TYPED error: the app maps that to its own generic copy and keeps
  // the message below for the bug report. An untyped `Error` would be rendered
  // verbatim as the depositor-facing callout body by the mapper's last resort.
  //
  // The shape check runs first because callers reach this with a plain `string`
  // cast to `Address` — nothing validates that cast — and `isAddressEqual`
  // *parses* both sides, so a malformed value would throw viem's error instead
  // of the one written for this situation. `isAddressEqual` rather than `===`
  // because the two values arrive from different sources and need not share
  // EIP-55 casing.
  if (!isAddress(applicationEntryPoint, { strict: false })) {
    throw new ApplicationEntryPointMismatchError(
      `The application entry point this deposit was prepared for is not a ` +
        `valid address: ${applicationEntryPoint}`,
    );
  }
  if (!isAddressEqual(registryApplicationEntryPoint, applicationEntryPoint)) {
    throw new ApplicationEntryPointMismatchError(
      `Vault provider ${vaultProviderEthAddress} is registered to application ` +
        `${registryApplicationEntryPoint}, but this deposit was prepared for ` +
        `${applicationEntryPoint}. Refusing to build: the vault keeper roster, ` +
        `its version, and the keeper key epoch would all resolve against a ` +
        `different application than the one selected.`,
    );
  }

  // Round 2: keyed on the registry-resolved entry point. The keeper roster
  // version and the keeper key epoch are read together so the epoch labels the
  // roster it was read beside.
  const [expectedAppVaultKeepersVersion, appKeeperKeyEpoch] = await Promise.all(
    [
      vaultKeeperReader.getCurrentVaultKeepersVersion(
        registryApplicationEntryPoint,
        blockNumber,
      ),
      vaultKeeperReader.getCurrentAppKeeperKeyEpoch(
        registryApplicationEntryPoint,
        blockNumber,
      ),
    ],
  );

  const [onChainKeepers, onChainChallengers] = await Promise.all([
    vaultKeeperReader.getVaultKeepersByVersion(
      registryApplicationEntryPoint,
      expectedAppVaultKeepersVersion,
      blockNumber,
    ),
    universalChallengerReader.getUniversalChallengersByVersion(
      expectedUniversalChallengersVersion,
      blockNumber,
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
        applicationEntryPoint: registryApplicationEntryPoint,
        vaultKeepers: onChainKeepers,
        universalChallengers: onChainChallengers,
      },
      blockNumber,
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
    appKeeperKeyEpoch,
    ucKeyEpoch,
    registrationKeys,
    participantKeys,
  };
}
