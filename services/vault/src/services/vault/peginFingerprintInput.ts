/**
 * Assemble the peg-in configuration fingerprint from the block-pinned snapshot
 * the Bitcoin lock was built from.
 *
 * The registry recomputes this hash live when it includes our registration and
 * reverts with `PeginFingerprintChanged` unless it matches. So the value is
 * only meaningful if every field comes from the *same* observation of the chain
 * that shaped the Pre-Pegin — a fingerprint computed from fresher state would
 * be accepted by the contract while our scripts were stale, which is precisely
 * the bug the fingerprint exists to prevent.
 *
 * That is why this module takes whole objects rather than nine loose
 * arguments: `validatedKeys` and `buildConfig` are each produced by one pinned
 * read, so a caller cannot mix a field from one block with a field from
 * another without it being visible at the call site.
 *
 * It lives beside `buildConfigConsistency.ts` and `pinnedBuildLimits.ts` — the
 * other pure, unit-testable pieces of the pre-build gate — rather than inline
 * in `useDepositFlow`, so the two conversions below can be tested directly.
 *
 * @module services/vault/peginFingerprintInput
 */

import type {
  PegInConfiguration,
  ValidatedOnChainParticipantKeys,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { computePeginFingerprint } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

export interface PeginFingerprintParams {
  /** `block.chainid` of the chain the registry is deployed on. */
  chainId: number;
  /** The `BTCVaultRegistry` address the registration will be sent to. */
  registryAddress: Address;
  /** Participant resolution from the pinned `validateOnChainParticipantKeys`. */
  validatedKeys: ValidatedOnChainParticipantKeys;
  /** Peg-in configuration read at the same pinned block. */
  buildConfig: PegInConfiguration;
}

/**
 * Compute the fingerprint to send with the registration.
 *
 * Two conversions happen here and nowhere else, which is the reason this is a
 * function rather than an object literal at the call site:
 *
 * - The SDK resolves operation keys as x-only hex *without* a `0x` prefix
 *   (`OnChainBtcPubkey`), while the encoder wants a `0x`-prefixed 32-byte
 *   `Hex`. The encoder rejects an unprefixed value, so this fails closed — but
 *   it fails, and it is the one step here that is easy to get silently wrong.
 * - `chainId` is a `number` everywhere in the app's config and a `bigint` in
 *   the encoder, which encodes it as `uint256`.
 *
 * On the vault-provider key specifically: the contract resolves it as
 * `operationBtcKeyAtEpoch(vaultProvider, currentVpKeyEpoch)`, while we supply
 * `getCurrentOperationBtcKey(vaultProvider)`. Those agree because a provider's
 * key history is append-only, so a lookup at any epoch at or after the last
 * rotation returns the key `getCurrent` returns. The two are the same value,
 * reached by two routes.
 *
 * @throws {PeginFingerprintInputError} when a field is missing, malformed, or
 *   outside the width the contract declares for it — raised by the encoder.
 */
export function computeBuildPeginFingerprint({
  chainId,
  registryAddress,
  validatedKeys,
  buildConfig,
}: PeginFingerprintParams): Hex {
  return computePeginFingerprint({
    chainId: BigInt(chainId),
    registryAddress,
    vaultProviderBtcKey:
      `0x${validatedKeys.vaultProviderBtcPubkeyXOnly}` as Hex,
    appKeeperKeyEpoch: validatedKeys.appKeeperKeyEpoch,
    ucKeyEpoch: validatedKeys.ucKeyEpoch,
    appVaultKeepersVersion: validatedKeys.expectedAppVaultKeepersVersion,
    universalChallengersVersion:
      validatedKeys.expectedUniversalChallengersVersion,
    offchainParamsVersion: buildConfig.offchainParamsVersion,
    vaultCoreVersion: buildConfig.activeVaultCoreVersion,
  });
}
