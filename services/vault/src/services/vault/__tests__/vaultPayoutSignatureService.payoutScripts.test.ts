/**
 * RFC-006 payout-destination resolution in `prepareSigningContext`.
 *
 * Operator payout destinations come from the registry at the vault's frozen
 * epochs rather than from a local BIP-86 derivation, and the keeper map must be
 * keyed by operation key using the roster-ordered pairs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPayoutScriptsAtEpochs = vi.hoisted(() => vi.fn());
const mockResolveParticipantKeysAtEpochs = vi.hoisted(() => vi.fn());

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  resolveParticipantKeysAtEpochs: (...args: unknown[]) =>
    mockResolveParticipantKeysAtEpochs(...args),
}));

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
  getVaultProviderGenesisBtcPubkeyFromChain: vi.fn(),
  getVaultKeyEpochsFromChain: vi.fn(),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("testnet"),
}));

vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn().mockResolvedValue({
    getTimelockPeginByVersion: vi.fn().mockResolvedValue(100),
    getOffchainParamsByVersion: vi.fn().mockResolvedValue({
      timelockAssert: 144n,
      securityCouncilKeys: ["0xcouncil"],
      councilQuorum: 1,
      minVpCommissionBps: 10,
    }),
  }),
  getVaultKeeperReader: vi.fn().mockResolvedValue({
    getVaultKeepersByVersion: vi
      .fn()
      .mockResolvedValue([{ btcPubKey: "vk1" }, { btcPubKey: "vk2" }]),
  }),
  getUniversalChallengerReader: vi.fn().mockResolvedValue({
    getUniversalChallengersByVersion: vi
      .fn()
      .mockResolvedValue([{ btcPubKey: "uc1" }]),
  }),
  getOperationKeyReader: vi.fn().mockResolvedValue({
    getPayoutScriptsAtEpochs: (...args: unknown[]) =>
      mockGetPayoutScriptsAtEpochs(...args),
  }),
}));

import {
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
  getVaultProviderGenesisBtcPubkeyFromChain,
} from "../../../clients/eth-contract/btc-vault-registry/query";
import { prepareSigningContext } from "../vaultPayoutSignatureService";

/**
 * The VP is rotated here: these two are deliberately different values. Setting
 * both to the same key is what let a regression to the registration key — the
 * natural mistake, since it is read as the genesis fallback — pass the
 * epoch-bonded-keys test below.
 */
const VP_GENESIS_KEY = "a".repeat(64);
const VP_OPERATION_KEY = "b".repeat(64);

/**
 * Two keeper operation keys whose *roster* order is the reverse of their
 * *sorted* order. The registry returns payout scripts index-aligned with the
 * roster, so joining them against the sorted key array would pair each keeper
 * with the other one's destination.
 */
const KEEPER_ROSTER_FIRST = "f".repeat(64);
const KEEPER_ROSTER_SECOND = "1".repeat(64);

const SCRIPT_FOR_ROSTER_FIRST = "0xaaaa";
const SCRIPT_FOR_ROSTER_SECOND = "0xbbbb";

/** A registered non-BIP-86 destination — what devnet's VP actually has set. */
const VP_REGISTERED_P2WPKH = "0x00142bbccc132d605bd10a4b0e14275b260c46f00d2f";

const signingArgs = {
  vaultId: "vault_id",
  depositorBtcPubkey: "depositor_pubkey",
  registeredPayoutScriptPubKey: "0xdepositorScript",
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getVaultFromChain).mockResolvedValue({
    depositorSignedPeginTx: "0xpegin",
    offchainParamsVersion: 1,
    vaultCoreVersion: 2,
    appVaultKeepersVersion: 2,
    universalChallengersVersion: 3,
    applicationEntryPoint: "0xapp",
    vaultProvider: "0xprovider",
    vaultProviderCommissionBps: 50,
  } as never);
  vi.mocked(getVaultProviderGenesisBtcPubkeyFromChain).mockResolvedValue(
    `0x${VP_GENESIS_KEY}` as never,
  );
  vi.mocked(getVaultKeyEpochsFromChain).mockResolvedValue({
    vpKeyEpoch: 12n,
    appKeeperKeyEpoch: 16n,
    ucKeyEpoch: 12n,
  } as never);

  mockResolveParticipantKeysAtEpochs.mockResolvedValue({
    vaultProvider: { operationBtcPubkey: VP_OPERATION_KEY },
    // Roster order — index-aligned with the payout scripts below.
    vaultKeepers: [
      { operationBtcPubkey: KEEPER_ROSTER_FIRST },
      { operationBtcPubkey: KEEPER_ROSTER_SECOND },
    ],
    // Sorted order — deliberately the reverse of the roster.
    vaultKeeperOperationKeysSorted: [KEEPER_ROSTER_SECOND, KEEPER_ROSTER_FIRST],
    universalChallengerOperationKeysSorted: ["uc1"],
  });
  mockGetPayoutScriptsAtEpochs.mockResolvedValue({
    vaultProvider: VP_REGISTERED_P2WPKH,
    vaultKeepers: [SCRIPT_FOR_ROSTER_FIRST, SCRIPT_FOR_ROSTER_SECOND],
  });
});

describe("prepareSigningContext — registered payout scripts", () => {
  it("pins the VP commission output to the registered scriptPubKey", async () => {
    const { context } = await prepareSigningContext(signingArgs);

    expect(context.vpCommissionScriptPubKey).toBe(VP_REGISTERED_P2WPKH);
  });

  it("keys each keeper payout script by its operation key from the roster-ordered pairs", async () => {
    const { context } = await prepareSigningContext(signingArgs);

    expect(context.vkClaimerPayoutScriptPubKeys).toEqual({
      [KEEPER_ROSTER_FIRST]: SCRIPT_FOR_ROSTER_FIRST,
      [KEEPER_ROSTER_SECOND]: SCRIPT_FOR_ROSTER_SECOND,
    });
  });

  it("resolves payout scripts at the vault's frozen epochs", async () => {
    await prepareSigningContext(signingArgs);

    expect(mockGetPayoutScriptsAtEpochs).toHaveBeenCalledWith(
      expect.anything(),
      { vpKeyEpoch: 12n, appKeeperKeyEpoch: 16n, ucKeyEpoch: 12n },
    );
  });

  it("builds with the epoch-bonded participant keys, not the registration key", async () => {
    const { context } = await prepareSigningContext(signingArgs);

    expect(context.vaultProviderBtcPubkey).toBe(VP_OPERATION_KEY);
    expect(context.vaultProviderBtcPubkey).not.toBe(VP_GENESIS_KEY);
    expect(context.vaultKeeperBtcPubkeys).toEqual([
      KEEPER_ROSTER_SECOND,
      KEEPER_ROSTER_FIRST,
    ]);
  });

  it("passes the registration key to resolution as the genesis fallback", async () => {
    // The registration key still has one job: the genesis the VP's epoch lookup
    // falls back to when the provider never rotated. Losing it would break
    // un-rotated providers — the harder failure to notice.
    await prepareSigningContext(signingArgs);

    expect(mockResolveParticipantKeysAtEpochs).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          vaultProviderGenesisBtcPubkey: `0x${VP_GENESIS_KEY}`,
        }),
      }),
    );
  });
});
