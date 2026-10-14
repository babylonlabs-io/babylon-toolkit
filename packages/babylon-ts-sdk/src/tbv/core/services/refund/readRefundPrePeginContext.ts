/**
 * The refund context for an existing vault, read from the chain.
 *
 * `buildAndBroadcastRefund` rebuilds the vault's Pre-PegIn HTLC from a
 * {@link RefundPrePeginContext}. Every participant key in that HTLC is an
 * RFC-006 operation key at the epochs the vault froze when it registered, so
 * this reads the rosters at the vault's stamped membership versions, resolves
 * them at those epochs (`readStampedParticipantKeys`), and reads the numeric
 * params at the vault's `offchainParamsVersion`. Nothing comes from an indexer.
 *
 * It needs the vault's registry record. A Pre-PegIn whose registration was
 * lost has none; rebuild that one with `toRefundInputs` instead.
 *
 * @module services/refund/readRefundPrePeginContext
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import type { Hex } from "viem";

import type { ProtocolParamsReader } from "../../clients/eth/types";
import {
  readStampedParticipantKeys,
  type StampedParticipantKeyReaders,
} from "../participants/readStampedParticipantKeys";
import type {
  RefundPrePeginContext,
  VaultRefundData,
} from "./buildAndBroadcastRefund";

/**
 * The reads {@link readRefundPrePeginContext} needs: the stamped participant
 * key reads plus the versioned offchain params.
 */
export interface RefundPrePeginContextReaders
  extends StampedParticipantKeyReaders {
  /** Reads the offchain params at the vault's `offchainParamsVersion`. */
  protocolParamsReader: Pick<ProtocolParamsReader, "getOffchainParamsByVersion">;
}

/** Input to {@link readRefundPrePeginContext}. */
export interface ReadRefundPrePeginContextParams {
  /** The vault being refunded: the same id passed to `buildAndBroadcastRefund`. */
  vaultId: Hex;
  /** The record `readVault` returned. Its stamped versions select the rosters and the params. */
  vault: VaultRefundData;
  /** The on-chain reads; the SDK's viem readers satisfy every one. */
  readers: RefundPrePeginContextReaders;
  /** The Bitcoin network the vault lives on, passed through to the context. */
  network: Network;
}

/**
 * Read the {@link RefundPrePeginContext} for an existing vault: participant
 * operation keys at the vault's frozen epochs, and numeric params at its
 * `offchainParamsVersion`.
 *
 * Pass it to `buildAndBroadcastRefund`, closing over the vault id:
 *
 * ```ts
 * readPrePeginContext: (vault) =>
 *   readRefundPrePeginContext({ vaultId, vault, readers, network }),
 * ```
 *
 * @throws When either stamped roster is empty, key resolution fails
 *         (`readStampedParticipantKeys`), or the offchain params read fails.
 */
export async function readRefundPrePeginContext(
  params: ReadRefundPrePeginContextParams,
): Promise<RefundPrePeginContext> {
  const { vaultId, vault, readers, network } = params;

  const [participantKeys, offchainParams] = await Promise.all([
    readStampedParticipantKeys({
      vaultId,
      vault: {
        basic: {
          vaultProvider: vault.vaultProvider,
          applicationEntryPoint: vault.applicationEntryPoint,
        },
        protocol: {
          appVaultKeepersVersion: vault.appVaultKeepersVersion,
          universalChallengersVersion: vault.universalChallengersVersion,
        },
      },
      readers,
    }),
    readers.protocolParamsReader.getOffchainParamsByVersion(
      vault.offchainParamsVersion,
    ),
  ]);

  return {
    vaultProviderPubkey: participantKeys.vaultProvider.operationBtcPubkey,
    vaultKeeperPubkeys: participantKeys.vaultKeeperOperationKeysSorted,
    universalChallengerPubkeys:
      participantKeys.universalChallengerOperationKeysSorted,
    timelockRefund: offchainParams.tRefund,
    feeRate: offchainParams.feeRate,
    minPeginFeeRate: offchainParams.minPeginFeeRate,
    // The local challengers of the depositor's own claim graph, which this
    // value sizes, are the vault keepers alone: the same count
    // `PeginManager.preparePegin` sized the HTLC with.
    numLocalChallengers: participantKeys.vaultKeeperOperationKeysSorted.length,
    councilQuorum: offchainParams.councilQuorum,
    councilSize: offchainParams.securityCouncilKeys.length,
    network,
  };
}
