import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VaultClaimableByNotFoundError } from "../../../clients/eth/claimable-event-error";
import {
  calculateBtcTxHash,
  derivePeginVaultId,
} from "../../../clients/eth/pegin-transaction";
import type {
  OnChainBtcPubkey,
  PeginRegistrationRecord,
  VaultData,
} from "../../../clients/eth/types";
import { readDelegatedClaimVaultContext } from "../readDelegatedClaimVaultContext";

const DEPOSITOR_ETH = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
/** Value of the depositor-signed PegIn's only output. */
const PEGIN_VAULT_OUTPUT_SATS = 1_000;
/** The Pre-PegIn output the vault's PegIn spends, as the record stamps it. */
const HTLC_VOUT = 1;
/** Minimal parseable transactions standing in for the batch's unsigned Pre-PegIn (locktime 1) and a stranger's (locktime 2). */
const UNSIGNED_PREPEGIN_HEX =
  `0x0200000001${"00".repeat(32)}0000000000ffffffff01e803000000000000015101000000` as Hex;
const OTHER_PREPEGIN_HEX =
  `0x0200000001${"00".repeat(32)}0000000000ffffffff01e803000000000000015102000000` as Hex;
const PREPEGIN_TX_HASH = calculateBtcTxHash(UNSIGNED_PREPEGIN_HEX);
/**
 * The depositor-signed PegIn: one input spending the Pre-PegIn's HTLC output
 * and one `OP_1` output, the shape btc-vault builds
 * (`transactions/pegin.rs:521-529` @ ac4954e7).
 */
function signedPegin({
  outputSats = PEGIN_VAULT_OUTPUT_SATS,
  withOutput = true,
  prevoutTxid = PREPEGIN_TX_HASH,
  prevoutVout = HTLC_VOUT,
  withSecondInput = false,
}: {
  outputSats?: number;
  withOutput?: boolean;
  prevoutTxid?: Hex;
  prevoutVout?: number;
  withSecondInput?: boolean;
} = {}): Hex {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(prevoutTxid.slice(2), "hex").reverse(), prevoutVout);
  if (withSecondInput) {
    const other = calculateBtcTxHash(OTHER_PREPEGIN_HEX);
    tx.addInput(Buffer.from(other.slice(2), "hex").reverse(), 0);
  }
  if (withOutput) tx.addOutput(Buffer.from("51", "hex"), outputSats);
  return `0x${tx.toHex()}` as Hex;
}
/** The vault id the registry files a PegIn under (`PeginLogic.sol:336-337` @ c559f5c2). */
function vaultIdOf(signedPeginHex: Hex): Hex {
  return `0x${derivePeginVaultId(calculateBtcTxHash(signedPeginHex), DEPOSITOR_ETH)}` as Hex;
}
const SIGNED_PEGIN_HEX = signedPegin();
const PEGIN_TX_HASH = calculateBtcTxHash(SIGNED_PEGIN_HEX);
const VAULT_ID = vaultIdOf(SIGNED_PEGIN_HEX);
const APP = "0xaaaa000000000000000000000000000000000001" as Address;
const VP_ADDRESS = "0xbbbb000000000000000000000000000000000002" as Address;
// x-only points G, 2G, 3G, 4G, 5G: every key here must be on the curve.
const DEPOSITOR =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const VP_GENESIS =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const KEEPER =
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const CHALLENGER =
  "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13";
const VP_OPERATION =
  "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4";
const WOTS_PK_HASH = `0x${"cc".repeat(32)}` as Hex;
const HASHLOCK = `0x${"dd".repeat(32)}` as Hex;
const PAYOUT_SCRIPT = `0x5120${"79".repeat(32)}` as Hex;
const CREATED_AT = 1_000n;
const CLAIMABLE_BLOCK = 5_000n;

function vaultData(
  over: Partial<VaultData["protocol"]> = {},
  basicOver: Partial<VaultData["basic"]> = {},
): VaultData {
  return {
    basic: {
      depositor: DEPOSITOR_ETH,
      depositorBtcPubKey: `0x${DEPOSITOR}` as Hex,
      // The registry records output 0's value as the vault's amount
      // (`PeginLogic.sol:266-267` @ c559f5c2), so the fixtures must agree.
      amount: BigInt(PEGIN_VAULT_OUTPUT_SATS),
      vaultProvider: VP_ADDRESS,
      status: 3,
      applicationEntryPoint: APP,
      createdAt: CREATED_AT,
      ...basicOver,
    },
    protocol: {
      depositorSignedPeginTx: SIGNED_PEGIN_HEX,
      universalChallengersVersion: 9,
      appVaultKeepersVersion: 7,
      // Distinct from vaultCoreVersion so the params reads are pinned to this
      // axis and not to a value the two versions happen to share.
      offchainParamsVersion: 5,
      verifiedAt: 1_100n,
      depositorWotsPkHash: WOTS_PK_HASH,
      hashlock: HASHLOCK,
      htlcVout: HTLC_VOUT,
      depositorPopSignature: "0x" as Hex,
      prePeginTxHash: PREPEGIN_TX_HASH,
      vaultProviderCommissionBps: 100,
      vaultCoreVersion: 3,
      ...over,
    },
  };
}

function record(
  over: Partial<PeginRegistrationRecord> = {},
): PeginRegistrationRecord {
  return {
    vaultId: VAULT_ID,
    depositor: DEPOSITOR_ETH,
    vaultProvider: VP_ADDRESS,
    amount: BigInt(PEGIN_VAULT_OUTPUT_SATS),
    vaultCoreVersion: 3,
    universalChallengersVersion: 9,
    appVaultKeepersVersion: 7,
    proverCircuitVersion: 11,
    offchainParamsVersion: 5,
    peginTxHash: PEGIN_TX_HASH,
    depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
    unsignedPrePeginTx: UNSIGNED_PREPEGIN_HEX,
    maxAcceptableCommissionBps: 300,
    blockNumber: CREATED_AT,
    ...over,
  };
}

function claimable(
  over: Partial<{
    vaultCoreVersion: number;
    proverCircuitVersion: number;
    peginTxHash: Hex;
    offchainParamsVersion: number;
    universalChallengersVersion: number;
    appVaultKeepersVersion: number;
  }> = {},
) {
  return {
    blockNumber: CLAIMABLE_BLOCK,
    claimerPk: DEPOSITOR as OnChainBtcPubkey,
    peginTxHash: PEGIN_TX_HASH,
    vaultCoreVersion: 3,
    proverCircuitVersion: 11,
    offchainParamsVersion: 5,
    universalChallengersVersion: 9,
    appVaultKeepersVersion: 7,
    ...over,
  };
}

function offchainParams(over: Partial<{ timelockAssert: bigint }> = {}) {
  return {
    timelockAssert: 700n,
    timelockChallengeAssert: 1n,
    securityCouncilKeys: ["0x01", "0x02", "0x03"],
    councilQuorum: 2,
    feeRate: 3n,
    babeTotalInstances: 1,
    babeInstancesToFinalize: 1,
    minVpCommissionBps: 0,
    tRefund: 2016,
    tStale: 1,
    minPeginFeeRate: 7n,
    proverCircuitVersion: 11,
    minPrepeginDepth: 1,
    ...over,
  };
}

function readers() {
  return {
    registryReader: {
      getVaultData: vi.fn().mockResolvedValue(vaultData()),
      getVaultKeyEpochs: vi.fn().mockResolvedValue({
        vpKeyEpoch: 1n,
        appKeeperKeyEpoch: 1n,
        ucKeyEpoch: 1n,
      }),
      getVaultProviderGenesisBtcPubKey: vi
        .fn()
        .mockResolvedValue(VP_GENESIS as OnChainBtcPubkey),
      getRegistrationRecordsAtBlock: vi.fn().mockResolvedValue([record()]),
      getVaultClaimableBy: vi.fn().mockResolvedValue(claimable()),
    },
    vaultKeeperReader: {
      getVaultKeepersByVersion: vi.fn().mockResolvedValue([
        {
          ethAddress: "0x0000000000000000000000000000000000000011",
          btcPubKey: `0x${KEEPER}`,
        },
      ]),
    },
    universalChallengerReader: {
      getUniversalChallengersByVersion: vi.fn().mockResolvedValue([
        {
          ethAddress: "0x0000000000000000000000000000000000000022",
          btcPubKey: `0x${CHALLENGER}`,
        },
      ]),
    },
    operationKeyReader: {
      getOperationKeysAtEpochs: vi.fn().mockResolvedValue({
        vaultProvider: `0x${VP_OPERATION}`,
        vaultKeepers: [`0x${KEEPER}`],
        universalChallengers: [`0x${CHALLENGER}`],
      }),
    },
    protocolParamsReader: {
      getOffchainParamsByVersion: vi.fn().mockResolvedValue(offchainParams()),
    },
  };
}

describe("readDelegatedClaimVaultContext", () => {
  let r: ReturnType<typeof readers>;
  beforeEach(() => {
    r = readers();
  });

  it("builds every context field from chain, with the VP operation key and the registered payout script", async () => {
    const read = await readDelegatedClaimVaultContext({
      vaultId: VAULT_ID,
      readers: r,
    });

    expect(read.context).toEqual({
      vaultId: VAULT_ID,
      depositorEthAddress: DEPOSITOR_ETH,
      depositorBtcPubkey: DEPOSITOR,
      registeredPayoutScriptPubKey: `5120${"79".repeat(32)}`,
      vaultProviderBtcPubkey: VP_OPERATION,
      vaultKeeperBtcPubkeys: [KEEPER],
      universalChallengerBtcPubkeys: [CHALLENGER],
      txGraphVersion: 3,
      proverCircuitVersion: 11,
      vaultCoreVersion: 3,
      claimableEventBlockNumber: CLAIMABLE_BLOCK,
      peginVaultOutputValueSats: PEGIN_VAULT_OUTPUT_SATS,
      protocolFeeRate: 3n,
      councilSize: 3,
      timelockPegin: 700,
      timelockAssert: 700,
    });
    expect(read).toMatchObject({
      depositorBtcPubKeyBytes32: `0x${DEPOSITOR}`,
      depositorWotsPkHash: WOTS_PK_HASH,
      prePeginTxHash: PREPEGIN_TX_HASH,
      // The VP proxy is addressed by these two; derived here so a caller
      // never re-reads the vault or re-derives the txid to get them.
      peginTxHash: PEGIN_TX_HASH,
      vaultProvider: VP_ADDRESS,
      htlcVout: 1,
    });
    // The redemption log is looked up for the depositor's registered key at
    // the vault's registration block.
    expect(r.registryReader.getVaultClaimableBy).toHaveBeenCalledWith(
      VAULT_ID,
      `0x${DEPOSITOR}`,
      CREATED_AT,
    );
    expect(r.registryReader.getRegistrationRecordsAtBlock).toHaveBeenCalledWith(
      CREATED_AT,
    );
  });

  it("reads the Vault UTXO value from output 0 of the depositor-signed PegIn", async () => {
    const otherPegin = signedPegin({ outputSats: 2_000 });
    const otherHash = calculateBtcTxHash(otherPegin);
    const otherVaultId = vaultIdOf(otherPegin);
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({ depositorSignedPeginTx: otherPegin }, { amount: 2_000n }),
    );
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ vaultId: otherVaultId, peginTxHash: otherHash, amount: 2_000n }),
    ]);
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ peginTxHash: otherHash }),
    );

    const read = await readDelegatedClaimVaultContext({
      vaultId: otherVaultId,
      readers: r,
    });

    expect(read.context.peginVaultOutputValueSats).toBe(2_000);
  });

  it("refuses a depositor-signed PegIn that does not derive the vault id asked for", async () => {
    const strangerVaultId = `0x${"ab".repeat(32)}` as Hex;
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ vaultId: strangerVaultId }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: strangerVaultId, readers: r }),
    ).rejects.toThrow(/derives vault id .* refusing an inconsistent node/);
  });

  it("refuses a vault record whose amount is not output 0's value", async () => {
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({}, { amount: BigInt(PEGIN_VAULT_OUTPUT_SATS) + 1n }),
    );
    // The registration log agrees with the record, so only the transaction disagrees.
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ amount: BigInt(PEGIN_VAULT_OUTPUT_SATS) + 1n }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /pays 1000 sats to output 0 but the vault record says 1001; refusing an inconsistent node/,
    );
  });

  it("refuses a registration log whose amount differs from the vault record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ amount: BigInt(PEGIN_VAULT_OUTPUT_SATS) + 7n }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* records amount 1007 sats but the vault record says 1000; refusing an inconsistent node/,
    );
  });

  it("refuses a depositor-signed PegIn that carries no output 0", async () => {
    const noOutputs = signedPegin({ withOutput: false });
    const noOutputsHash = calculateBtcTxHash(noOutputs);
    const noOutputsVaultId = vaultIdOf(noOutputs);
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({ depositorSignedPeginTx: noOutputs }),
    );
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ vaultId: noOutputsVaultId, peginTxHash: noOutputsHash }),
    ]);
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ peginTxHash: noOutputsHash }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: noOutputsVaultId, readers: r }),
    ).rejects.toThrow(
      /has no output 0; the Payout cannot spend the Vault UTXO/,
    );
  });

  it("refuses a depositor-signed PegIn that spends a transaction other than the record's Pre-PegIn", async () => {
    const strayPegin = signedPegin({
      prevoutTxid: calculateBtcTxHash(OTHER_PREPEGIN_HEX),
    });
    const strayHash = calculateBtcTxHash(strayPegin);
    const strayVaultId = vaultIdOf(strayPegin);
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({ depositorSignedPeginTx: strayPegin }),
    );
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ vaultId: strayVaultId, peginTxHash: strayHash }),
    ]);
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ peginTxHash: strayHash }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: strayVaultId, readers: r }),
    ).rejects.toThrow(
      new RegExp(
        `spends ${calculateBtcTxHash(OTHER_PREPEGIN_HEX).slice(2)}:${HTLC_VOUT} but the vault record says Pre-PegIn ${PREPEGIN_TX_HASH}`,
      ),
    );
  });

  it("refuses a depositor-signed PegIn that spends an output other than the record's htlcVout", async () => {
    const wrongVout = signedPegin({ prevoutVout: HTLC_VOUT + 1 });
    const wrongVoutHash = calculateBtcTxHash(wrongVout);
    const wrongVoutVaultId = vaultIdOf(wrongVout);
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({ depositorSignedPeginTx: wrongVout }),
    );
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ vaultId: wrongVoutVaultId, peginTxHash: wrongVoutHash }),
    ]);
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ peginTxHash: wrongVoutHash }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: wrongVoutVaultId, readers: r }),
    ).rejects.toThrow(
      new RegExp(
        `:${HTLC_VOUT + 1} but the vault record says Pre-PegIn .* output ${HTLC_VOUT}`,
      ),
    );
  });

  it("refuses a depositor-signed PegIn with more than one input", async () => {
    // Input 0 still spends the record's Pre-PegIn, so only the count refuses.
    const twoInputs = signedPegin({ withSecondInput: true });
    const twoInputsHash = calculateBtcTxHash(twoInputs);
    const twoInputsVaultId = vaultIdOf(twoInputs);
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({ depositorSignedPeginTx: twoInputs }),
    );
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ vaultId: twoInputsVaultId, peginTxHash: twoInputsHash }),
    ]);
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ peginTxHash: twoInputsHash }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: twoInputsVaultId, readers: r }),
    ).rejects.toThrow(/has 2 inputs/);
  });

  it("reads the offchain params at the vault's stamped version", async () => {
    await readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r });

    expect(
      r.protocolParamsReader.getOffchainParamsByVersion,
    ).toHaveBeenCalledWith(5);
  });

  it("derives the PegIn timelock from the stamped params' timelockAssert", async () => {
    // 701, not the 700 the whole-context assertion already pins, so the value
    // is shown to come from the stamped params rather than from a default.
    r.protocolParamsReader.getOffchainParamsByVersion.mockResolvedValue(
      offchainParams({ timelockAssert: 701n }),
    );

    const read = await readDelegatedClaimVaultContext({
      vaultId: VAULT_ID,
      readers: r,
    });

    expect(read.context.timelockPegin).toBe(701);
    expect(read.context.timelockAssert).toBe(701);
  });

  it("refuses a vault whose stamped core version is not the delegated-claim graph version", async () => {
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({ vaultCoreVersion: 2 }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(/vault core version 2.*delegated claim requires 3/);
    expect(r.registryReader.getVaultClaimableBy).not.toHaveBeenCalled();
  });

  it("reports the typed absence without scanning when the vault is not Redeemed", async () => {
    r.registryReader.getVaultData.mockResolvedValue(
      vaultData({}, { status: 2 }),
    );

    const caught = await readDelegatedClaimVaultContext({
      vaultId: VAULT_ID,
      readers: r,
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(VaultClaimableByNotFoundError);
    expect((caught as Error).message).toMatch(
      /status is 2, not Redeemed \(3\); no scan was made/,
    );
    expect(r.registryReader.getVaultClaimableBy).not.toHaveBeenCalled();
  });

  it("refuses a redemption log whose prover circuit version differs from the registration's", async () => {
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ proverCircuitVersion: 12 }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(/proverCircuitVersion 12 .* registration .* 11/);
  });

  it("refuses a redemption log whose PegIn txid is not the hash of the vault's depositor-signed PegIn", async () => {
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ peginTxHash: `0x${"11".repeat(32)}` as Hex }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Redemption log .* peginTxHash 0x1111.*depositor-signed PegIn hashes to/,
    );
  });

  it("refuses a registration log whose PegIn txid is not the hash of the vault's depositor-signed PegIn", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ peginTxHash: `0x${"22".repeat(32)}` as Hex }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* peginTxHash 0x2222.*depositor-signed PegIn hashes to/,
    );
  });

  it("refuses a redemption log whose offchain params version differs from the vault record", async () => {
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ offchainParamsVersion: 4 }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Redemption log .* offchainParamsVersion 4 .* vault record says 5/,
    );
  });

  it("refuses a registration log whose offchain params version differs from the vault record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ offchainParamsVersion: 4 }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* offchainParamsVersion 4 .* vault record says 5/,
    );
  });

  it("refuses a registration log whose universal challengers version differs from the vault record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ universalChallengersVersion: 10 }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* universalChallengersVersion 10 .* vault record says 9/,
    );
  });

  it("refuses a registration log whose app vault keepers version differs from the vault record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ appVaultKeepersVersion: 8 }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* appVaultKeepersVersion 8 .* vault record says 7/,
    );
  });

  it("refuses a registration log whose proverCircuitVersion differs from the stamped offchain params", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ proverCircuitVersion: 12 }),
    ]);
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ proverCircuitVersion: 12 }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* proverCircuitVersion 12 .* stamped offchain params say 11/,
    );
  });

  it("refuses a registration log whose depositor differs from the vault record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({
        depositor: "0x0000000000000000000000000000000000000099" as Address,
      }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* records depositor 0x0000000000000000000000000000000000000099 .* vault record says/,
    );
  });

  it("refuses a registration log whose vaultProvider differs from the vault record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({
        vaultProvider: "0x0000000000000000000000000000000000000088" as Address,
      }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* records vaultProvider 0x0000000000000000000000000000000000000088 .* vault record says/,
    );
  });

  it("refuses a redemption log whose universal challengers version differs from the vault record", async () => {
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ universalChallengersVersion: 10 }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Redemption log .* universalChallengersVersion 10 .* vault record says 9/,
    );
  });

  it("refuses a redemption log whose app vault keepers version differs from the vault record", async () => {
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ appVaultKeepersVersion: 8 }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Redemption log .* appVaultKeepersVersion 8 .* vault record says 7/,
    );
  });

  it("refuses a registration log whose Pre-PegIn txid differs from the vault's on-chain record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ unsignedPrePeginTx: OTHER_PREPEGIN_HEX }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(/prePeginTxHash/);
  });

  it("refuses a registration log whose payout script is empty", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ depositorPayoutScriptPubKey: "0x" as Hex }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(/0-byte depositorPayoutBtcAddress/);
  });

  it("refuses a registration log whose vault core version differs from the vault record", async () => {
    r.registryReader.getRegistrationRecordsAtBlock.mockResolvedValue([
      record({ vaultCoreVersion: 2 }),
    ]);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Registration log .* vault core version 2 .* vault record says 3/,
    );
  });

  it("refuses a redemption log whose vault core version differs from the vault record", async () => {
    r.registryReader.getVaultClaimableBy.mockResolvedValue(
      claimable({ vaultCoreVersion: 2 }),
    );

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toThrow(
      /Redemption log .* vault core version 2 .* vault record says 3/,
    );
  });

  // The status gate above already proved the vault is Redeemed, so the
  // reader's generic "redeem first" wording would mislead.
  it("restates the typed absence for a Redeemed vault, naming finality, redeemForAVK and the node", async () => {
    const absent = new VaultClaimableByNotFoundError(
      VAULT_ID,
      `0x${DEPOSITOR}` as Hex,
      CREATED_AT,
      CLAIMABLE_BLOCK,
    );
    r.registryReader.getVaultClaimableBy.mockRejectedValue(absent);

    const caught = await readDelegatedClaimVaultContext({
      vaultId: VAULT_ID,
      readers: r,
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(VaultClaimableByNotFoundError);
    expect((caught as Error).message).toMatch(
      /Redeemed but no VaultClaimableBy authorizes this depositor key/,
    );
    expect((caught as Error).message).toMatch(/redeemForAVK/);
    expect(caught).toMatchObject({
      fromBlock: CREATED_AT,
      toBlock: CLAIMABLE_BLOCK,
    });
  });

  it("keeps the reader's own absence as the cause of the restated one", async () => {
    const absent = new VaultClaimableByNotFoundError(
      VAULT_ID,
      `0x${DEPOSITOR}` as Hex,
      CREATED_AT,
      CLAIMABLE_BLOCK,
    );
    r.registryReader.getVaultClaimableBy.mockRejectedValue(absent);

    const caught = await readDelegatedClaimVaultContext({
      vaultId: VAULT_ID,
      readers: r,
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect((caught as Error).cause).toBe(absent);
  });

  it("propagates a reader failure that is not the typed absence unchanged", async () => {
    const transport = new Error("HTTP 503 from the node");
    r.registryReader.getVaultClaimableBy.mockRejectedValue(transport);

    await expect(
      readDelegatedClaimVaultContext({ vaultId: VAULT_ID, readers: r }),
    ).rejects.toBe(transport);
  });
});
