/**
 * Tests for the parameter search that recovers a reorg-stranded Pre-PegIn.
 *
 * Every case runs against a REAL WASM-built funded transaction — genuine HTLC
 * connector scriptPubKeys and genuine sizing — because the search's whole job
 * is to reproduce those bytes from the wrong end. A mocked oracle would prove
 * nothing.
 *
 * The differential these assert is the one file 01 §9 asks for: the recovered
 * parameters must equal the ones the transaction was built with, recovered
 * without ever being told what they were.
 */

import {
  computeMinClaimValue,
  computeMinPeginFee,
  getPrePeginHtlcConnectorInfo,
  peginP2aAnchorOutput,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

import {
  TEST_KEYS,
  initializeWasmForTests,
} from "../../primitives/psbt/__tests__/helpers";
import {
  buildPeginParamsCandidates,
  type OffchainParamsCandidate,
  type ParticipantKeySetCandidate,
} from "../peginParamsCandidates";
import { reconstructPeginParams } from "../reconstructPeginParams";
import {
  PeginParamsAmbiguousError,
  PeginParamsNotFoundError,
  UnanchoredPrePeginError,
} from "../recoveryErrors";

const NETWORK = "signet" as Network;
const VAULT_PROVIDER_ADDRESS =
  "0x1111111111111111111111111111111111111111" as const;
const PREPEGIN_MAX_FEE = 1500n;
const COMMISSION_BPS = 250;

const DEPOSITOR = TEST_KEYS.DEPOSITOR;
const VP = TEST_KEYS.VAULT_PROVIDER;
const VKS = [TEST_KEYS.VAULT_KEEPER_1, TEST_KEYS.VAULT_KEEPER_2];
const UCS = [TEST_KEYS.UNIVERSAL_CHALLENGER_1];

/** The parameters the fixtures are built with — the answer the search must find. */
const TRUE_OFFCHAIN: OffchainParamsCandidate = {
  version: 4,
  protocolFeeRate: 3n,
  minPeginFeeRate: 7n,
  councilQuorum: 2,
  councilSize: 3,
  timelockPegin: 684,
  timelockAssert: 700,
  timelockRefund: 2016,
};

const TRUE_PARTICIPANTS: ParticipantKeySetCandidate = {
  keyEpochPolicy: "genesis",
  vaultProvider: VAULT_PROVIDER_ADDRESS,
  vaultProviderBtcPubkey: VP,
  appVaultKeepersVersion: 2,
  vaultKeeperBtcPubkeys: VKS,
  universalChallengersVersion: 5,
  universalChallengerBtcPubkeys: UCS,
};

const TRUE_CORE_VERSION = 2;

interface Sibling {
  hashlock: string;
  amount: bigint;
}

/**
 * Build the funded Pre-PegIn a deposit under {@link TRUE_OFFCHAIN} would have
 * broadcast: real connector scriptPubKeys, real `amount + DCV + fee + anchor`
 * values, and the auth-anchor OP_RETURN at `vout === sibling count`.
 */
async function buildFundedTx(
  version: number,
  siblings: Sibling[],
  offchain: OffchainParamsCandidate = TRUE_OFFCHAIN,
  participants: ParticipantKeySetCandidate = TRUE_PARTICIPANTS,
): Promise<string> {
  const numVks = participants.vaultKeeperBtcPubkeys.length;
  const numUcs = participants.universalChallengerBtcPubkeys.length;
  const dcv = await computeMinClaimValue(
    version,
    numVks,
    numUcs,
    offchain.councilQuorum,
    offchain.councilSize,
    offchain.protocolFeeRate,
  );
  const fee = await computeMinPeginFee(
    version,
    numVks,
    numUcs,
    offchain.minPeginFeeRate,
  );
  const anchor = (await peginP2aAnchorOutput(version))?.value ?? 0n;

  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0);
  for (const sibling of siblings) {
    const info = await getPrePeginHtlcConnectorInfo({
      txGraphVersion: version,
      depositorPubkey: DEPOSITOR,
      vaultProviderPubkey: participants.vaultProviderBtcPubkey,
      vaultKeeperPubkeys: [...participants.vaultKeeperBtcPubkeys],
      universalChallengerPubkeys: [
        ...participants.universalChallengerBtcPubkeys,
      ],
      hashlock: sibling.hashlock,
      timelockRefund: offchain.timelockRefund,
      network: NETWORK,
    });
    tx.addOutput(
      Buffer.from(info.scriptPubKey, "hex"),
      Number(sibling.amount + dcv + fee + anchor),
    );
  }
  tx.addOutput(
    Buffer.concat([Buffer.from([0x6a, 0x20]), Buffer.alloc(32, 0xcd)]),
    0,
  );
  return tx.toHex();
}

function search(
  siblings: Sibling[],
  fundedPrePeginTxHex: string,
  candidates: ReturnType<typeof buildPeginParamsCandidates>,
) {
  return reconstructPeginParams({
    hashlocks: siblings.map((s) => s.hashlock),
    fundedPrePeginTxHex,
    depositorBtcPubkey: DEPOSITOR,
    prepeginMaxFee: PREPEGIN_MAX_FEE,
    maxAcceptableCommissionBps: COMMISSION_BPS,
    network: NETWORK,
    candidates,
  });
}

describe("reconstructPeginParams", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  it("recovers every destroyed parameter of a two-vault deposit", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
      { hashlock: "cd".repeat(32), amount: 2_500_000n },
    ];
    const txHex = await buildFundedTx(TRUE_CORE_VERSION, siblings);

    // The space also holds the nearest wrong neighbour: an offchain version
    // differing only in tRefund, the one scalar of the set that reaches the
    // HTLC scriptPubKey and so the only one the search can rule out.
    const candidates = buildPeginParamsCandidates({
      vaultCoreVersion: TRUE_CORE_VERSION,
      offchainParams: [
        { ...TRUE_OFFCHAIN, version: 3, timelockRefund: 1008 },
        TRUE_OFFCHAIN,
      ],
      participantKeySets: [TRUE_PARTICIPANTS],
    });
    expect(candidates).toHaveLength(2);

    const result = await search(siblings, txHex, candidates);

    expect(result.candidate.vaultCoreVersion).toBe(TRUE_CORE_VERSION);
    expect(result.candidate.offchainParams.version).toBe(TRUE_OFFCHAIN.version);
    expect(result.candidate.participants.appVaultKeepersVersion).toBe(2);
    expect(result.candidate.participants.universalChallengersVersion).toBe(5);
    expect(result.candidate.participants.vaultProvider).toBe(
      VAULT_PROVIDER_ADDRESS,
    );
    expect(result.peginAmounts).toEqual([1_000_000n, 2_500_000n]);
    expect(result.candidatesTried).toBe(2);
    expect(result.authAnchorHash).toBe("cd".repeat(32));

    expect(result.terms.vaults).toHaveLength(2);
    expect(result.terms.timelockRefund).toBe(TRUE_OFFCHAIN.timelockRefund);
    expect(result.terms.vaults.map((v) => v.htlcVout)).toEqual([0, 1]);
    expect(result.terms.vaults.map((v) => v.peginAmount)).toEqual([
      1_000_000n,
      2_500_000n,
    ]);
  });

  it("recovers a single-vault v1 deposit, where the graph carries no anchor", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ef".repeat(32), amount: 750_000n },
    ];
    const txHex = await buildFundedTx(1, siblings);

    const result = await search(
      siblings,
      txHex,
      buildPeginParamsCandidates({
        vaultCoreVersion: 1,
        offchainParams: [TRUE_OFFCHAIN],
        participantKeySets: [TRUE_PARTICIPANTS],
      }),
    );

    expect(result.candidate.vaultCoreVersion).toBe(1);
    expect(result.peginAmounts).toEqual([750_000n]);
  });

  it("rejects a roster that is one keeper short of the real one", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 900_000n },
    ];
    const txHex = await buildFundedTx(TRUE_CORE_VERSION, siblings);

    await expect(
      search(
        siblings,
        txHex,
        buildPeginParamsCandidates({
          vaultCoreVersion: TRUE_CORE_VERSION,
          offchainParams: [TRUE_OFFCHAIN],
          participantKeySets: [
            {
              ...TRUE_PARTICIPANTS,
              appVaultKeepersVersion: 1,
              vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
            },
          ],
        }),
      ),
    ).rejects.toThrow(PeginParamsNotFoundError);
  });

  it("rejects a vault provider key that is not the one in the taptree", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 900_000n },
    ];
    const txHex = await buildFundedTx(TRUE_CORE_VERSION, siblings);

    await expect(
      search(
        siblings,
        txHex,
        buildPeginParamsCandidates({
          vaultCoreVersion: TRUE_CORE_VERSION,
          offchainParams: [TRUE_OFFCHAIN],
          participantKeySets: [
            {
              ...TRUE_PARTICIPANTS,
              keyEpochPolicy: "current",
              vaultProviderBtcPubkey: TEST_KEYS.UNIVERSAL_CHALLENGER_2,
            },
          ],
        }),
      ),
    ).rejects.toThrow(PeginParamsNotFoundError);
  });

  it("reports a bounded sample of rejection reasons when nothing matches", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 900_000n },
    ];
    const txHex = await buildFundedTx(TRUE_CORE_VERSION, siblings);

    const error = await search(
      siblings,
      txHex,
      buildPeginParamsCandidates({
        vaultCoreVersion: TRUE_CORE_VERSION,
        offchainParams: [{ ...TRUE_OFFCHAIN, timelockRefund: 1008 }],
        participantKeySets: [TRUE_PARTICIPANTS],
      }),
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(PeginParamsNotFoundError);
    const notFound = error as PeginParamsNotFoundError;
    expect(notFound.candidatesTried).toBe(1);
    expect(notFound.sampleRejections).toHaveLength(1);
    expect(notFound.sampleRejections[0]).toContain("core=2");
    expect(notFound.sampleRejections[0]).toContain("scriptPubKey");
  });

  it("fails closed when two candidates both reproduce the transaction", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_200_000n },
    ];
    const txHex = await buildFundedTx(TRUE_CORE_VERSION, siblings);

    // Two offchain versions with identical contents: a real possibility
    // whenever a params bump leaves the script- and value-relevant fields
    // alone. Both survive, so the vault's stamped version is unknowable.
    const error = await search(
      siblings,
      txHex,
      buildPeginParamsCandidates({
        vaultCoreVersion: TRUE_CORE_VERSION,
        offchainParams: [TRUE_OFFCHAIN, { ...TRUE_OFFCHAIN, version: 9 }],
        participantKeySets: [TRUE_PARTICIPANTS],
      }),
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(PeginParamsAmbiguousError);
    const ambiguous = error as PeginParamsAmbiguousError;
    expect(ambiguous.survivorLabels).toHaveLength(2);
    expect(ambiguous.message).toContain("offchain=4");
    expect(ambiguous.message).toContain("offchain=9");
  });

  it("refuses a Pre-PegIn with no auth-anchor OP_RETURN rather than guessing the vault count", async () => {
    const tx = new Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, 0x11), 0);
    tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1_000_000);

    await expect(
      search(
        [{ hashlock: "ab".repeat(32), amount: 900_000n }],
        tx.toHex(),
        buildPeginParamsCandidates({
          vaultCoreVersion: TRUE_CORE_VERSION,
          offchainParams: [TRUE_OFFCHAIN],
          participantKeySets: [TRUE_PARTICIPANTS],
        }),
      ),
    ).rejects.toThrow(UnanchoredPrePeginError);
  });

  it("refuses a hashlock set that does not cover every HTLC output", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
      { hashlock: "cd".repeat(32), amount: 2_500_000n },
    ];
    const txHex = await buildFundedTx(TRUE_CORE_VERSION, siblings);

    await expect(
      search(
        siblings.slice(0, 1),
        txHex,
        buildPeginParamsCandidates({
          vaultCoreVersion: TRUE_CORE_VERSION,
          offchainParams: [TRUE_OFFCHAIN],
          participantKeySets: [TRUE_PARTICIPANTS],
        }),
      ),
    ).rejects.toThrow(/auth-anchor OP_RETURN sits at vout 2/);
  });

  it("refuses an empty hashlock set instead of matching a zero-vault transaction", async () => {
    await expect(
      reconstructPeginParams({
        hashlocks: [],
        fundedPrePeginTxHex: await buildFundedTx(TRUE_CORE_VERSION, [
          { hashlock: "ab".repeat(32), amount: 900_000n },
        ]),
        depositorBtcPubkey: DEPOSITOR,
        prepeginMaxFee: PREPEGIN_MAX_FEE,
        maxAcceptableCommissionBps: COMMISSION_BPS,
        network: NETWORK,
        candidates: buildPeginParamsCandidates({
          vaultCoreVersion: TRUE_CORE_VERSION,
          offchainParams: [TRUE_OFFCHAIN],
          participantKeySets: [TRUE_PARTICIPANTS],
        }),
      }),
    ).rejects.toThrow(/at least one hashlock is required/);
  });

  it("refuses an empty candidate space instead of reporting no match", async () => {
    await expect(
      reconstructPeginParams({
        hashlocks: ["ab".repeat(32)],
        fundedPrePeginTxHex: await buildFundedTx(TRUE_CORE_VERSION, [
          { hashlock: "ab".repeat(32), amount: 900_000n },
        ]),
        depositorBtcPubkey: DEPOSITOR,
        prepeginMaxFee: PREPEGIN_MAX_FEE,
        maxAcceptableCommissionBps: COMMISSION_BPS,
        network: NETWORK,
        candidates: [],
      }),
    ).rejects.toThrow(/candidate space is empty/);
  });
});

describe("why vaultCoreVersion is supplied rather than searched", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  it("produces a byte-identical HTLC scriptPubKey for v1 and v2", async () => {
    const connectorFor = (txGraphVersion: number) =>
      getPrePeginHtlcConnectorInfo({
        txGraphVersion,
        depositorPubkey: DEPOSITOR,
        vaultProviderPubkey: VP,
        vaultKeeperPubkeys: VKS,
        universalChallengerPubkeys: UCS,
        hashlock: "ab".repeat(32),
        timelockRefund: TRUE_OFFCHAIN.timelockRefund,
        network: NETWORK,
      });

    const [v1, v2] = await Promise.all([connectorFor(1), connectorFor(2)]);

    // The graph version reaches the Pre-PegIn only through the reserve folded
    // into the HTLC value, which the search inverts back out of that same
    // value — so with the script identical there is nothing left to
    // discriminate on. If a future graph version changes the connector, this
    // fails and the version becomes searchable again.
    expect(v1.scriptPubKey).toBe(v2.scriptPubKey);
  });

  it("reserves a different amount per version, which is what the inversion absorbs", async () => {
    const reserveFor = async (version: number) => {
      const dcv = await computeMinClaimValue(
        version,
        VKS.length,
        UCS.length,
        TRUE_OFFCHAIN.councilQuorum,
        TRUE_OFFCHAIN.councilSize,
        TRUE_OFFCHAIN.protocolFeeRate,
      );
      const fee = await computeMinPeginFee(
        version,
        VKS.length,
        UCS.length,
        TRUE_OFFCHAIN.minPeginFeeRate,
      );
      const anchor = (await peginP2aAnchorOutput(version))?.value ?? 0n;
      return dcv + fee + anchor;
    };

    expect(await reserveFor(1)).not.toBe(await reserveFor(2));
  });
});

describe("buildPeginParamsCandidates", () => {
  it("expands the three axes into their full product", () => {
    const candidates = buildPeginParamsCandidates({
      vaultCoreVersion: TRUE_CORE_VERSION,
      offchainParams: [TRUE_OFFCHAIN, { ...TRUE_OFFCHAIN, version: 5 }],
      participantKeySets: [
        TRUE_PARTICIPANTS,
        { ...TRUE_PARTICIPANTS, keyEpochPolicy: "current" },
        { ...TRUE_PARTICIPANTS, appVaultKeepersVersion: 1 },
      ],
    });

    expect(candidates).toHaveLength(6);
  });

  it("refuses a vaultCoreVersion that is not a positive integer", () => {
    expect(() =>
      buildPeginParamsCandidates({
        vaultCoreVersion: 0,
        offchainParams: [TRUE_OFFCHAIN],
        participantKeySets: [TRUE_PARTICIPANTS],
      }),
    ).toThrow(/vaultCoreVersion must be a positive integer/);
  });

  // Each empty axis collapses the product to nothing. Returning an empty list
  // would surface later as "no candidate matched" — a search that never ran,
  // reported as a search that failed.
  it("refuses an empty offchain-params axis", () => {
    expect(() =>
      buildPeginParamsCandidates({
        vaultCoreVersion: 2,
        offchainParams: [],
        participantKeySets: [TRUE_PARTICIPANTS],
      }),
    ).toThrow(/at least one offchain-params version/);
  });

  it("refuses an empty participant-key-set axis", () => {
    expect(() =>
      buildPeginParamsCandidates({
        vaultCoreVersion: 2,
        offchainParams: [TRUE_OFFCHAIN],
        participantKeySets: [],
      }),
    ).toThrow(/at least one participant key set/);
  });
});
