/**
 * The vault facts a delegated claim needs, read from chain months after the
 * deposit, with no vault provider and no indexer in the loop.
 *
 * Every field of {@link DelegatedClaimVaultContext} comes from the registry:
 * the vault record, its `PegInSubmittedV2` registration log, its finalized
 * `VaultClaimableBy` redemption log, the offchain params the vault stamped,
 * and the participant rosters at the versions and epochs the vault froze.
 * Where two of those sources carry the same value they are compared, and a
 * disagreement refuses the read rather than picking one.
 *
 * @module services/delegated-claim/readDelegatedClaimVaultContext
 */

import { Transaction } from "bitcoinjs-lib";
import type { Address, Hex } from "viem";

import {
  VaultClaimableByNotFoundError,
  isVaultClaimableByNotFoundError,
} from "../../clients/eth/claimable-event-error";
import { assertOnChainBtcPubkey } from "../../clients/eth/onChainBtcPubkey";
import { calculateBtcTxHash } from "../../clients/eth/pegin-transaction";
import {
  assertRegisteredPayoutScriptBounds,
  findRegistrationRecord,
  registrationPrePeginTxHash,
} from "../../clients/eth/registration-records";
import {
  OnChainBtcVaultStatus,
  type OnChainBtcPubkey,
  type PeginRegistrationRecord,
  type ProtocolParamsReader,
  type VaultData,
  type VaultRegistryReader,
  type VersionedOffchainParams,
} from "../../clients/eth/types";
import { PEGIN_VAULT_OUTPUT_INDEX } from "../../primitives/psbt/constants";
import { stripHexPrefix } from "../../primitives/utils/bitcoin";
import {
  readStampedParticipantKeys,
  type StampedParticipantKeyReaders,
} from "../participants/readStampedParticipantKeys";
import type { ParticipantKeySet } from "../participants/types";
import { DELEGATED_CLAIM_TX_GRAPH_VERSION } from "./readWatchtowerArtifacts";
import type { DelegatedClaimVaultContext } from "./types";

/** @experimental */
export interface DelegatedClaimVaultReaders
  extends StampedParticipantKeyReaders {
  registryReader: Pick<
    VaultRegistryReader,
    | "getVaultData"
    | "getVaultKeyEpochs"
    | "getVaultProviderGenesisBtcPubKey"
    | "getRegistrationRecordsAtBlock"
    | "getVaultClaimableBy"
  >;
  protocolParamsReader: Pick<
    ProtocolParamsReader,
    "getOffchainParamsByVersion" | "getTimelockPeginByVersion"
  >;
}

/** @experimental */
export interface ReadDelegatedClaimVaultContextParams {
  vaultId: Hex;
  readers: DelegatedClaimVaultReaders;
}

/**
 * The context, plus the sibling facts a claim needs that the context does not
 * carry: the depositor's BTC key (the graph's scripts commit to it), the
 * on-chain WOTS commitment (`deriveClaimerWotsKeypair.expectedWotsPkHash`),
 * what `buildVaultContextInputForClaim` takes, and every record this read
 * already fetched that `rebuildDepositTermsForClaim` would otherwise fetch
 * again — it takes this whole object rather than a vault id.
 *
 * @experimental
 */
export interface DelegatedClaimVaultRead {
  context: DelegatedClaimVaultContext;
  /** The target's registry record, as read here. */
  vault: VaultData;
  /** The target's own `PegInSubmittedV2` log. */
  registrationRecord: PeginRegistrationRecord;
  /** Every log in the target's registration block, the batch's siblings among them. */
  registrationRecords: readonly PeginRegistrationRecord[];
  /** Participant operation keys resolved at the vault's stamped versions and epochs. */
  participantKeys: ParticipantKeySet;
  /** The offchain params snapshot at `protocol.offchainParamsVersion`. */
  offchainParams: VersionedOffchainParams;
  /** `getTimelockPeginByVersion` at the same version. */
  timelockPegin: number;
  /** x-only, 64 lowercase hex, curve-checked. */
  depositorBtcPubkey: OnChainBtcPubkey;
  /** `VaultBasicInfo.depositorBtcPubKey` verbatim, for `buildVaultContextInputForClaim`. */
  depositorBtcPubKeyBytes32: Hex;
  depositorWotsPkHash: Hex;
  prePeginTxHash: Hex;
  /**
   * Txid of the vault's depositor-signed PegIn, derived here through the
   * dependency-free parser and cross-checked against both logs. The vault
   * provider indexes a deposit's artifacts and auth tokens by it.
   */
  peginTxHash: Hex;
  /** The vault's registered vault provider, which addresses its VP proxy. */
  vaultProvider: Address;
  htlcVout: number;
}

/**
 * @throws When the vault's core version is not the delegated-claim graph
 *         version; when the depositor-signed PegIn carries no output
 *         {@link PEGIN_VAULT_OUTPUT_INDEX}; when the registration log, the
 *         redemption log and the vault record disagree on a shared field;
 *         and whatever the readers throw (notably the typed
 *         `VaultClaimableByNotFoundError`). The
 *         disagreement checks are inconsistent-node guards only: on an honest
 *         chain both logs are written from the same contract state as the
 *         record (`PeginLogic.sol:379-380`, `RedeemLogic.sol:118-124`) and
 *         cannot differ.
 * @experimental
 */
export async function readDelegatedClaimVaultContext(
  params: ReadDelegatedClaimVaultContextParams,
): Promise<DelegatedClaimVaultRead> {
  const { vaultId, readers } = params;
  const vault = await readers.registryReader.getVaultData(vaultId);
  const { basic, protocol } = vault;

  // The stamped vault core version is the graph version (one axis). The
  // delegated-claim builders exist for version 3 only, so anything else
  // cannot be claimed by this path.
  if (protocol.vaultCoreVersion !== DELEGATED_CLAIM_TX_GRAPH_VERSION) {
    throw new Error(
      `Vault ${vaultId} is stamped vault core version ${protocol.vaultCoreVersion}; ` +
        `delegated claim requires ${DELEGATED_CLAIM_TX_GRAPH_VERSION}.`,
    );
  }
  const depositorBtcPubkey = assertOnChainBtcPubkey(
    basic.depositorBtcPubKey,
    `getBtcVaultBasicInfo(${vaultId}).depositorBtcPubKey`,
  );

  // Every depositor VaultClaimableBy is emitted after the vault is set
  // Redeemed (RedeemLogic.sol redeemForDepositor via _executeRedeemVault;
  // PeginLogic.sol claimExpired), so any other status cannot have the log
  // yet: report the same typed absence without a finalized→createdAt scan.
  if (basic.status !== OnChainBtcVaultStatus.REDEEMED) {
    throw new VaultClaimableByNotFoundError(
      vaultId,
      basic.depositorBtcPubKey,
      basic.createdAt,
      basic.createdAt,
      `the vault's status is ${basic.status}, not Redeemed (${OnChainBtcVaultStatus.REDEEMED}); no scan was made`,
    );
  }

  const [
    participantKeys,
    records,
    claimableEvent,
    offchainParams,
    timelockPegin,
  ] = await Promise.all([
    readStampedParticipantKeys({ vaultId, vault, readers }),
    readers.registryReader.getRegistrationRecordsAtBlock(basic.createdAt),
    readers.registryReader
      .getVaultClaimableBy(vaultId, basic.depositorBtcPubKey, basic.createdAt)
      .catch((error: unknown) => {
        if (!isVaultClaimableByNotFoundError(error)) throw error;
        // The status gate above already proved the vault is Redeemed, so the
        // reader's generic "redeem first" wording would mislead here. Name
        // what is actually left.
        throw new VaultClaimableByNotFoundError(
          vaultId,
          basic.depositorBtcPubKey,
          error.fromBlock,
          error.toBlock,
          `the vault is Redeemed but no VaultClaimableBy authorizes this depositor key in the ` +
            `finalized range. Either the redeem has not finalized yet (the scan stops about two ` +
            `epochs behind the tip), or the vault was redeemed for a vault keeper alone ` +
            `(redeemForAVK emits no depositor log), or the node did not serve every block scanned.`,
          { cause: error },
        );
      }),
    readers.protocolParamsReader.getOffchainParamsByVersion(
      protocol.offchainParamsVersion,
    ),
    readers.protocolParamsReader.getTimelockPeginByVersion(
      protocol.offchainParamsVersion,
    ),
  ]);
  const record = findRegistrationRecord(records, vaultId, basic.createdAt);
  assertRegisteredPayoutScriptBounds(record);

  const recordPrePeginTxHash = registrationPrePeginTxHash(record);
  if (
    recordPrePeginTxHash.toLowerCase() !== protocol.prePeginTxHash.toLowerCase()
  ) {
    throw new Error(
      `Registration log of vault ${vaultId} records prePeginTxHash ${recordPrePeginTxHash} ` +
        `but the vault record says ${protocol.prePeginTxHash}; refusing an inconsistent node.`,
    );
  }
  if (record.vaultCoreVersion !== protocol.vaultCoreVersion) {
    throw new Error(
      `Registration log of vault ${vaultId} records vault core version ${record.vaultCoreVersion} ` +
        `but the vault record says ${protocol.vaultCoreVersion}; refusing an inconsistent node.`,
    );
  }
  if (claimableEvent.vaultCoreVersion !== protocol.vaultCoreVersion) {
    throw new Error(
      `Redemption log of vault ${vaultId} records vault core version ${claimableEvent.vaultCoreVersion} ` +
        `but the vault record says ${protocol.vaultCoreVersion}; refusing an inconsistent node.`,
    );
  }
  if (claimableEvent.proverCircuitVersion !== record.proverCircuitVersion) {
    throw new Error(
      `Redemption log of vault ${vaultId} records proverCircuitVersion ` +
        `${claimableEvent.proverCircuitVersion} but the registration log says ` +
        `${record.proverCircuitVersion}; refusing an inconsistent node.`,
    );
  }
  // Both logs repeat the PegIn txid, and the redemption log repeats the
  // stamped versions; the vault record is the reference for all of them. Same
  // txid derivation the registration submitted (pegin-registration-client.ts).
  const peginTxHash = calculateBtcTxHash(protocol.depositorSignedPeginTx);
  for (const [source, logged] of [
    ["Registration", record.peginTxHash],
    ["Redemption", claimableEvent.peginTxHash],
  ] as const) {
    if (logged.toLowerCase() !== peginTxHash.toLowerCase()) {
      throw new Error(
        `${source} log of vault ${vaultId} records peginTxHash ${logged} but the vault's ` +
          `depositor-signed PegIn hashes to ${peginTxHash}; refusing an inconsistent node.`,
      );
    }
  }
  for (const axis of [
    "offchainParamsVersion",
    "universalChallengersVersion",
    "appVaultKeepersVersion",
  ] as const) {
    if (claimableEvent[axis] !== protocol[axis]) {
      throw new Error(
        `Redemption log of vault ${vaultId} records ${axis} ${claimableEvent[axis]} ` +
          `but the vault record says ${protocol[axis]}; refusing an inconsistent node.`,
      );
    }
  }

  // The Payout's input 0 spends this output (btc-vault `payout.rs:103-112`
  // @ ac4954e7), so its value anchors the claim-time fee band. Read from the
  // signed transaction itself, not from `basic.amount`.
  const peginVaultOutput = Transaction.fromHex(
    stripHexPrefix(protocol.depositorSignedPeginTx),
  ).outs[PEGIN_VAULT_OUTPUT_INDEX];
  if (peginVaultOutput === undefined) {
    throw new Error(
      `Depositor-signed PegIn of vault ${vaultId} has no output ` +
        `${PEGIN_VAULT_OUTPUT_INDEX}; the Payout cannot spend the Vault UTXO.`,
    );
  }

  return {
    context: {
      vaultId,
      depositorEthAddress: basic.depositor,
      registeredPayoutScriptPubKey: stripHexPrefix(
        record.depositorPayoutScriptPubKey,
      ),
      vaultProviderBtcPubkey: participantKeys.vaultProvider.operationBtcPubkey,
      vaultKeeperBtcPubkeys: [
        ...participantKeys.vaultKeeperOperationKeysSorted,
      ],
      universalChallengerBtcPubkeys: [
        ...participantKeys.universalChallengerOperationKeysSorted,
      ],
      txGraphVersion: DELEGATED_CLAIM_TX_GRAPH_VERSION,
      proverCircuitVersion: record.proverCircuitVersion,
      vaultCoreVersion: protocol.vaultCoreVersion,
      claimableEventBlockNumber: claimableEvent.blockNumber,
      peginVaultOutputValueSats: peginVaultOutput.value,
      protocolFeeRate: offchainParams.feeRate,
      councilSize: offchainParams.securityCouncilKeys.length,
      timelockPegin,
      timelockAssert: Number(offchainParams.timelockAssert),
    },
    vault,
    registrationRecord: record,
    registrationRecords: records,
    participantKeys,
    offchainParams,
    timelockPegin,
    depositorBtcPubkey,
    depositorBtcPubKeyBytes32: basic.depositorBtcPubKey,
    depositorWotsPkHash: protocol.depositorWotsPkHash,
    prePeginTxHash: protocol.prePeginTxHash,
    peginTxHash,
    vaultProvider: basic.vaultProvider,
    htlcVout: protocol.htlcVout,
  };
}
