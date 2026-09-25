/**
 * Rebuild a {@link DepositTerms} at claim time, from chain and mempool only.
 *
 * The delegated claim can run months after the deposit, with no in-memory
 * terms and possibly no vault provider. An approval wallet still has to load
 * this vault's intent to sign the Assert and the depositor Payout, and the
 * device recomputes the PegIn txid from the intent, so every value here must
 * be the one the deposit was built with: the stamped versions and rosters,
 * the ceiling from the registration log, the siblings from the same log, the
 * funded fee from the transaction the chain saw.
 *
 * Takes the `readDelegatedClaimVaultContext` read rather than a vault id: that
 * read already fetched the vault record, the registration block, the
 * participant keys and the stamped params, and on a public RPC every repeat is
 * another chance of a spurious empty answer. Only the siblings still need a
 * reader.
 *
 * No lifecycle gate: the vault app's resume rebuild refuses non-PENDING
 * vaults and closed ack windows because it is about to finish a deposit; a
 * claimable vault is REDEEMED and long past both. The homogeneity and
 * contiguity checks are kept.
 *
 * @module deposit-terms/rebuildDepositTermsForClaim
 */

import { registrationPrePeginTxHash } from "../clients/eth/registration-records";
import type { VaultRegistryReader } from "../clients/eth/types";
import {
  canonicalizeBtcPubkey,
  stripHexPrefix,
} from "../primitives/utils/bitcoin";
import type { DelegatedClaimVaultRead } from "../services/delegated-claim/readDelegatedClaimVaultContext";
import { calculateBtcTxHash } from "../utils/transaction/btcTxHash";
import {
  assertClaimBatchHomogeneous,
  orderClaimBatchByHtlcVout,
  selectSiblingRegistrations,
  type ClaimBatchMember,
} from "./claimSiblings";
import type { DepositTerms } from "./depositTerms";
import { computeFundedPrePeginFee } from "./fundedPrePeginFee";
import {
  rebuildDepositTermsCore,
  type RebuildDepositTermsCoreInput,
} from "./rebuildDepositTermsCore";

/** @experimental */
export interface RebuildDepositTermsForClaimParams {
  /** The vault read this rebuild reuses instead of re-reading the chain. */
  read: DelegatedClaimVaultRead;
  /**
   * The connected wallet's own key (compressed or x-only): refused unless it
   * is the vault's depositor. Passing the on-chain key here makes that check
   * vacuous.
   */
  depositorBtcPubkey: string;
  /**
   * Funded Pre-PegIn hex, e.g. `getTxHex(prepeginTxid, mempoolApiUrl)`.
   * Hash-checked against the vault's `prePeginTxHash` here before any mempool
   * lookup, and again by the core (Gate 0).
   */
  fundedPrePeginTxHex: string;
  /** Reads the sibling vaults of the batch; the target is already in `read`. */
  siblingReader: Pick<VaultRegistryReader, "getVaultData">;
  /** Mempool API base URL, for the prevouts the fee is computed from. */
  mempoolApiUrl: string;
  network: RebuildDepositTermsCoreInput["network"];
}

/**
 * @throws When the wallet key is not the depositor's, the hex is not the
 *         vault's Pre-PegIn, a sibling is registered against a different
 *         Pre-PegIn than its log records, the siblings disagree on a stamped
 *         field or are non-contiguous, the fee is out of bounds, or the core
 *         refuses (see `rebuildDepositTermsCore`).
 *         A sibling registered in another block is missing from this read and
 *         surfaces as the core's auth-anchor refusal, whose message suggests a
 *         lagging index and a retry: on this path there is no index, and a
 *         retry cannot help — that sibling must be registered in the same block.
 * @experimental
 */
export async function rebuildDepositTermsForClaim(
  params: RebuildDepositTermsForClaimParams,
): Promise<DepositTerms> {
  const { read } = params;
  const connectedDepositor = canonicalizeBtcPubkey(params.depositorBtcPubkey);
  if (connectedDepositor !== read.context.depositorBtcPubkey) {
    throw new Error(
      `Connected wallet key is not the vault's depositor key; select the account ` +
        `that made the deposit.`,
    );
  }

  const prepeginTxid = stripHexPrefix(read.prePeginTxHash).toLowerCase();
  const actualTxid = stripHexPrefix(
    calculateBtcTxHash(params.fundedPrePeginTxHex),
  ).toLowerCase();
  if (actualTxid !== prepeginTxid) {
    throw new Error(
      `Funded Pre-PegIn tx hashes to ${actualTxid}, expected ${prepeginTxid} (on-chain prePeginTxHash).`,
    );
  }

  const siblingMembers: ClaimBatchMember[] = await Promise.all(
    selectSiblingRegistrations(
      read.registrationRecords,
      read.registrationRecord,
    ).map(async (record) => {
      const vault = await params.siblingReader.getVaultData(record.vaultId);
      if (
        vault.protocol.prePeginTxHash.toLowerCase() !==
        registrationPrePeginTxHash(record).toLowerCase()
      ) {
        throw new Error(
          `Sibling ${record.vaultId} is registered against a different Pre-PegIn on chain ` +
            `than its registration log records; refusing an inconsistent node.`,
        );
      }
      return {
        vault,
        maxAcceptableCommissionBps: record.maxAcceptableCommissionBps,
      };
    }),
  );
  const targetMember: ClaimBatchMember = {
    vault: read.vault,
    maxAcceptableCommissionBps:
      read.registrationRecord.maxAcceptableCommissionBps,
  };
  assertClaimBatchHomogeneous(targetMember, siblingMembers);
  const siblings = orderClaimBatchByHtlcVout([targetMember, ...siblingMembers]);

  const prepeginMaxFee = await computeFundedPrePeginFee(
    params.fundedPrePeginTxHex,
    params.mempoolApiUrl,
  );

  return rebuildDepositTermsCore({
    vaultCoreVersion: read.vault.protocol.vaultCoreVersion,
    siblings,
    fundedPrePeginTxHex: params.fundedPrePeginTxHex,
    depositorBtcPubkey: connectedDepositor,
    vaultProviderBtcPubkey:
      read.participantKeys.vaultProvider.operationBtcPubkey,
    vaultKeeperBtcPubkeys: read.participantKeys.vaultKeeperOperationKeysSorted,
    universalChallengerBtcPubkeys:
      read.participantKeys.universalChallengerOperationKeysSorted,
    protocolFeeRate: read.offchainParams.feeRate,
    minPeginFeeRate: read.offchainParams.minPeginFeeRate,
    councilQuorum: read.offchainParams.councilQuorum,
    councilSize: read.offchainParams.securityCouncilKeys.length,
    timelockPegin: read.context.timelockPegin,
    timelockAssert: read.context.timelockAssert,
    timelockRefund: read.offchainParams.tRefund,
    prepeginTxid,
    prepeginMaxFee,
    // The submitted ceiling, verbatim: the device must see the terms the
    // depositor originally approved.
    maxAcceptableCommissionBps:
      read.registrationRecord.maxAcceptableCommissionBps,
    network: params.network,
  });
}
