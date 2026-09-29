import type {
  PegInConfiguration,
  ValidatedOnChainParticipantKeys,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  computePeginFingerprint,
  PeginFingerprintInputError,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import { computeBuildPeginFingerprint } from "../peginFingerprintInput";

// Every value distinct and non-zero. The fingerprint is one hash over nine
// fields, so two fields sharing a value would make a swap between them
// invisible — the encoder would produce the same bytes either way.
const CHAIN_ID = 11_155_111;
const REGISTRY = "0x2222222222222222222222222222222222222222" as Address;
const VP_KEY_X_ONLY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const APP_KEEPER_KEY_EPOCH = 13n;
const UC_KEY_EPOCH = 17n;
const KEEPERS_VERSION = 3;
const CHALLENGERS_VERSION = 5;
const OFFCHAIN_PARAMS_VERSION = 9;
const VAULT_CORE_VERSION = 2;

function validatedKeys(
  overrides: Partial<ValidatedOnChainParticipantKeys> = {},
): ValidatedOnChainParticipantKeys {
  return {
    vaultProviderBtcPubkeyXOnly: VP_KEY_X_ONLY,
    vaultKeeperBtcPubkeysSorted: [],
    universalChallengerBtcPubkeysSorted: [],
    expectedAppVaultKeepersVersion: KEEPERS_VERSION,
    expectedUniversalChallengersVersion: CHALLENGERS_VERSION,
    appKeeperKeyEpoch: APP_KEEPER_KEY_EPOCH,
    ucKeyEpoch: UC_KEY_EPOCH,
    registrationKeys: {
      vaultProvider: VP_KEY_X_ONLY,
      vaultKeepers: [],
      universalChallengers: [],
    },
    participantKeys: {} as ValidatedOnChainParticipantKeys["participantKeys"],
    ...overrides,
  };
}

function buildConfig(
  overrides: Partial<PegInConfiguration> = {},
): PegInConfiguration {
  return {
    offchainParamsVersion: OFFCHAIN_PARAMS_VERSION,
    activeVaultCoreVersion: VAULT_CORE_VERSION,
    // The remaining fields shape the Bitcoin transaction, not the fingerprint.
    minimumPegInAmount: 10_000n,
    maxPegInAmount: 1_000_000n,
    pegInAckTimeout: 100n,
    pegInActivationTimeout: 200n,
    maxHtlcOutputCount: 2,
    expiredPegInGraceBlocks: 10n,
    timelockPegin: 144,
    timelockRefund: 288,
    minVpCommissionBps: 10,
    offchainParams: {} as PegInConfiguration["offchainParams"],
    ...overrides,
  };
}

function compute(
  keys = validatedKeys(),
  config = buildConfig(),
  chainId = CHAIN_ID,
) {
  return computeBuildPeginFingerprint({
    chainId,
    registryAddress: REGISTRY,
    validatedKeys: keys,
    buildConfig: config,
  });
}

describe("computeBuildPeginFingerprint", () => {
  it("maps every field to the slot the encoder expects", () => {
    // The oracle is the SDK encoder called with values written out by hand, so
    // this pins the mapping rather than re-running the same code twice. The
    // encoder itself is pinned against the contract's own vectors elsewhere.
    expect(compute()).toBe(
      computePeginFingerprint({
        chainId: BigInt(CHAIN_ID),
        registryAddress: REGISTRY,
        vaultProviderBtcKey: `0x${VP_KEY_X_ONLY}`,
        appKeeperKeyEpoch: APP_KEEPER_KEY_EPOCH,
        ucKeyEpoch: UC_KEY_EPOCH,
        appVaultKeepersVersion: KEEPERS_VERSION,
        universalChallengersVersion: CHALLENGERS_VERSION,
        offchainParamsVersion: OFFCHAIN_PARAMS_VERSION,
        vaultCoreVersion: VAULT_CORE_VERSION,
      }),
    );
  });

  it("adds the 0x prefix exactly once, never to an already-prefixed key", () => {
    // The mapping test above proves the prefix is added. This proves it is not
    // added blindly: if the SDK ever returned an already-prefixed key, or a
    // caller pre-prefixed it, concatenating again yields 66 hex characters and
    // the encoder must reject that rather than silently truncate or pad it into
    // a different — and wrong — 32-byte word.
    // Pinned to the encoder's own error, not a bare `.toThrow()`: any typo in
    // the fixture would also throw, and this test would pass without ever
    // exercising the double-prefix path it is named for.
    expect(() =>
      compute(
        validatedKeys({ vaultProviderBtcPubkeyXOnly: `0x${VP_KEY_X_ONLY}` }),
      ),
    ).toThrow(PeginFingerprintInputError);
  });

  // One case per field the fingerprint commits to. A field that is read from
  // the wrong place, or not read at all, leaves the hash unchanged here — which
  // is exactly the failure the contract would otherwise catch after the
  // depositor has signed.
  it.each([
    ["the chain id", () => compute(validatedKeys(), buildConfig(), 1)],
    [
      "the vault provider key",
      () =>
        compute(
          validatedKeys({
            vaultProviderBtcPubkeyXOnly:
              "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
          }),
        ),
    ],
    [
      "the app keeper key epoch",
      () => compute(validatedKeys({ appKeeperKeyEpoch: 14n })),
    ],
    ["the uc key epoch", () => compute(validatedKeys({ ucKeyEpoch: 18n }))],
    [
      "the keepers version",
      () => compute(validatedKeys({ expectedAppVaultKeepersVersion: 4 })),
    ],
    [
      "the challengers version",
      () => compute(validatedKeys({ expectedUniversalChallengersVersion: 6 })),
    ],
    [
      "the offchain params version",
      () =>
        compute(validatedKeys(), buildConfig({ offchainParamsVersion: 10 })),
    ],
    [
      "the vault core version",
      () =>
        compute(validatedKeys(), buildConfig({ activeVaultCoreVersion: 3 })),
    ],
  ])("changes when %s changes", (_label, mutate) => {
    expect(mutate()).not.toBe(compute());
  });

  it("changes when the registry address changes", () => {
    expect(
      computeBuildPeginFingerprint({
        chainId: CHAIN_ID,
        registryAddress: "0x3333333333333333333333333333333333333333",
        validatedKeys: validatedKeys(),
        buildConfig: buildConfig(),
      }),
    ).not.toBe(compute());
  });

  it("does not confuse the two roster versions with the two key epochs", () => {
    // Four values on two axes. Swapping either pair has to move the hash, or
    // the keeper and challenger halves are not really distinguished.
    const swappedVersions = compute(
      validatedKeys({
        expectedAppVaultKeepersVersion: CHALLENGERS_VERSION,
        expectedUniversalChallengersVersion: KEEPERS_VERSION,
      }),
    );
    const swappedEpochs = compute(
      validatedKeys({
        appKeeperKeyEpoch: UC_KEY_EPOCH,
        ucKeyEpoch: APP_KEEPER_KEY_EPOCH,
      }),
    );

    expect(swappedVersions).not.toBe(compute());
    expect(swappedEpochs).not.toBe(compute());
  });

  it("rejects a malformed vault provider key rather than encoding it", () => {
    expect(() =>
      compute(validatedKeys({ vaultProviderBtcPubkeyXOnly: "not-a-key" })),
    ).toThrow(PeginFingerprintInputError);
  });
});
