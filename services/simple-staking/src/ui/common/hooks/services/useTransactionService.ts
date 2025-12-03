import { Transaction } from "bitcoinjs-lib";
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { BtcStakingInputs } from "@/ui/common/types/stakingInputs";
import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { ClientError, ERROR_CODES } from "@/ui/common/errors";
import { useLogger } from "@/ui/common/hooks/useLogger";
import { useAppState } from "@/ui/common/state";
import { getFeeRateFromMempool } from "@/ui/common/utils/getFeeRateFromMempool";
import { getTxInfo, getTxMerkleProof } from "@/ui/common/utils/mempool_api";
import { validateStakingManagerInputs } from "@/ui/common/utils/validateStakingManagerInputs";

import { useNetworkFees } from "../client/api/useNetworkFees";
import { DELEGATIONS_V2_KEY } from "../client/api/useDelegationsV2";
import { useBbnQuery } from "../client/rpc/queries/useBbnQuery";

import { useStakingManagerService } from "./useStakingManagerService";

export type { BtcStakingInputs } from "@/ui/common/types/stakingInputs";

export const useTransactionService = () => {
  const queryClient = useQueryClient();
  const { availableUTXOs, refetchUTXOs } = useAppState();

  const { data: networkFees } = useNetworkFees();
  const { defaultFeeRate } = getFeeRateFromMempool(networkFees);
  const {
    btcTipQuery: { data: tipHeight, refetch: refetchBtcTip },
  } = useBbnQuery();

  const { bech32Address } = useCosmosWallet();
  const { publicKeyNoCoord, address: btcAddress, pushTx } = useBTCWallet();
  const logger = useLogger();

  const stakerInfo = useMemo(
    () => ({
      address: btcAddress,
      publicKeyNoCoordHex: publicKeyNoCoord,
    }),
    [btcAddress, publicKeyNoCoord],
  );

  const { createBtcStakingManager } = useStakingManagerService();

  /**
   * Create the delegation EOI
   *
   * @param stakingInput - The staking inputs
   * @param feeRate - The fee rate
   * @returns The staking transaction hash
   */
  const createDelegationEoi = useCallback(
    async (stakingInput: BtcStakingInputs, feeRate: number) => {
      // Refetch the latest BTC tip height to prevent using stale data
      const { data: latestTipHeight } = await refetchBtcTip();

      const btcStakingManager = createBtcStakingManager();

      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        latestTipHeight,
        stakerInfo,
      );

      if (!availableUTXOs) {
        const clientError = new ClientError(
          ERROR_CODES.INITIALIZATION_ERROR,
          "Available UTXOs not initialized",
        );
        logger.error(clientError);
        throw clientError;
      }

      const { stakingTx, signedBabylonTx } =
        await commonInputs.btcStakingManager.preStakeRegistrationBabylonTransaction(
          stakerInfo,
          stakingInput,
          commonInputs.tipHeight,
          availableUTXOs,
          feeRate,
          bech32Address,
        );
      return {
        stakingTxHash: stakingTx.getId(),
        signedBabylonTx,
      };
    },
    [
      availableUTXOs,
      bech32Address,
      createBtcStakingManager,
      stakerInfo,
      refetchBtcTip,
      logger,
    ],
  );

  /**
   * Estimate the staking fee
   *
   * @param stakingInput - The staking inputs
   * @param feeRate - The fee rate
   * @returns The staking fee
   */
  const estimateStakingFee = useCallback(
    (stakingInput: BtcStakingInputs, feeRate: number): number => {
      logger.info("Estimating staking fee", {
        feeRate,
      });
      const btcStakingManager = createBtcStakingManager();
      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        tipHeight,
        stakerInfo,
      );
      if (!availableUTXOs) {
        const clientError = new ClientError(
          ERROR_CODES.INITIALIZATION_ERROR,
          "Available UTXOs not initialized",
        );
        logger.error(clientError);
        throw clientError;
      }
      const fee = commonInputs.btcStakingManager.estimateBtcStakingFee(
        stakerInfo,
        commonInputs.tipHeight,
        stakingInput,
        availableUTXOs,
        feeRate,
      );
      return fee;
    },
    [createBtcStakingManager, tipHeight, stakerInfo, availableUTXOs, logger],
  );

  /**
   * Transition the delegation to phase 1
   *
   * @param stakingTxHex - The staking transaction hex
   * @param stakingHeight - The staking height of the phase-1 delegation
   * @param stakingInput - The staking inputs
   */
  const transitionPhase1Delegation = useCallback(
    async (
      stakingTxHex: string,
      stakingHeight: number,
      stakingInput: BtcStakingInputs,
    ) => {
      // Refetch the latest BTC tip height to prevent using stale data
      const { data: latestTipHeight } = await refetchBtcTip();

      const btcStakingManager = createBtcStakingManager();
      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        latestTipHeight,
        stakerInfo,
      );

      const stakingTx = Transaction.fromHex(stakingTxHex);
      const inclusionProof = await getInclusionProof(stakingTx);

      logger.info("Transitioning delegation", {
        stakingHeight,
        stakingTxId: stakingTx.getId(),
      });

      const { signedBabylonTx } =
        await commonInputs.btcStakingManager.postStakeRegistrationBabylonTransaction(
          stakerInfo,
          stakingTx,
          stakingHeight,
          stakingInput,
          inclusionProof,
          bech32Address,
        );

      return {
        stakingTxHash: stakingTx.getId(),
        signedBabylonTx,
      };
    },
    [bech32Address, createBtcStakingManager, stakerInfo, refetchBtcTip, logger],
  );

  /**
   * Submit the staking transaction
   *
   * @param stakingInput - The staking inputs
   * @param paramVersion - The param version
   * @param expectedTxHashHex - The expected transaction hash hex
   * @param stakingTxHex - The staking transaction hex
   */
  const submitStakingTx = useCallback(
    async (
      stakingInput: BtcStakingInputs,
      paramVersion: number,
      expectedTxHashHex: string,
      unsignedStakingTxHex: string,
    ) => {
      const btcStakingManager = createBtcStakingManager();
      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        tipHeight,
        stakerInfo,
      );
      if (!availableUTXOs) {
        const clientError = new ClientError(
          ERROR_CODES.INITIALIZATION_ERROR,
          "Available UTXOs not initialized",
        );
        logger.error(clientError);
        throw clientError;
      }

      const unsignedStakingTx = Transaction.fromHex(unsignedStakingTxHex);

      const signedStakingTx =
        await commonInputs.btcStakingManager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          availableUTXOs,
          paramVersion,
        );

      if (signedStakingTx.getId() !== expectedTxHashHex) {
        const clientError = new ClientError(
          ERROR_CODES.VALIDATION_ERROR,
          `Staking transaction hash mismatch, expected ${expectedTxHashHex} but got ${signedStakingTx.getId()}`,
        );
        logger.error(clientError, {
          data: {
            expectedTxHashHex,
            unsignedStakingTxHex,
          },
        });
        throw clientError;
      }

      await pushTx(signedStakingTx.toHex());

      refetchUTXOs();

      // Invalidate delegations query to trigger APR refetch with updated BTC totals
      // This ensures co-staking APR updates immediately after staking
      queryClient.invalidateQueries({ queryKey: [DELEGATIONS_V2_KEY] });
    },
    [
      availableUTXOs,
      createBtcStakingManager,
      pushTx,
      refetchUTXOs,
      stakerInfo,
      tipHeight,
      logger,
      queryClient,
    ],
  );

  /**
   * Submit the unbonding transaction
   *
   * @param stakingInput - The staking inputs
   * @param paramVersion - The param version of the EOI
   * @param stakingTxHex - The staking transaction hex
   * @param unbondingTxHex - The unbonding transaction hex
   * @param covenantUnbondingSignatures - The covenant unbonding signatures
   */
  const submitUnbondingTx = useCallback(
    async (
      stakingInput: BtcStakingInputs,
      paramVersion: number,
      stakingTxHex: string,
      unbondingTxHex: string,
      covenantUnbondingSignatures: {
        btcPkHex: string;
        sigHex: string;
      }[],
    ) => {
      const btcStakingManager = createBtcStakingManager();
      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        tipHeight,
        stakerInfo,
      );

      const unsignedUnbondingTx = Transaction.fromHex(unbondingTxHex);

      const { transaction: signedUnbondingTx } =
        await commonInputs.btcStakingManager.createSignedBtcUnbondingTransaction(
          stakerInfo,
          stakingInput,
          paramVersion,
          Transaction.fromHex(stakingTxHex),
          unsignedUnbondingTx,
          covenantUnbondingSignatures,
        );

      await pushTx(signedUnbondingTx.toHex());
    },
    [createBtcStakingManager, pushTx, stakerInfo, tipHeight],
  );

  /**
   * Withdraw from the early unbonding transaction which is now unbonded
   *
   * @param stakingInput - The staking inputs
   * @param paramVersion - The param version of the EOI
   * @param earlyUnbondingTxHex - The early unbonding transaction hex
   */
  const submitEarlyUnbondedWithdrawalTx = useCallback(
    async (
      stakingInput: BtcStakingInputs,
      paramVersion: number,
      earlyUnbondingTxHex: string,
    ) => {
      logger.info("Executing submitEarlyUnbondedWithdrawalTx", {
        paramVersion,
        earlyUnbondingTxHex,
      });
      const btcStakingManager = createBtcStakingManager();
      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        tipHeight,
        stakerInfo,
      );

      const { transaction: signedWithdrawalTx } =
        await commonInputs.btcStakingManager.createSignedBtcWithdrawEarlyUnbondedTransaction(
          stakerInfo,
          stakingInput,
          paramVersion,
          Transaction.fromHex(earlyUnbondingTxHex),
          defaultFeeRate,
        );
      await pushTx(signedWithdrawalTx.toHex());
    },
    [
      createBtcStakingManager,
      defaultFeeRate,
      pushTx,
      stakerInfo,
      tipHeight,
      logger,
    ],
  );

  /**
   * Submit the timelock unbonded withdrawal transaction
   *
   * @param stakingInput - The staking inputs
   * @param paramVersion - The param version of the EOI
   * @param stakingTxHex - The staking transaction hex
   */
  const submitTimelockUnbondedWithdrawalTx = useCallback(
    async (
      stakingInput: BtcStakingInputs,
      paramVersion: number,
      stakingTxHex: string,
    ) => {
      logger.info("Executing submitTimelockUnbondedWithdrawalTx", {
        paramVersion,
        stakingTxHash: Transaction.fromHex(stakingTxHex).getId(),
      });
      const btcStakingManager = createBtcStakingManager();
      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        tipHeight,
        stakerInfo,
      );

      const { transaction: signedWithdrawalTx } =
        await commonInputs.btcStakingManager.createSignedBtcWithdrawStakingExpiredTransaction(
          stakerInfo,
          stakingInput,
          paramVersion,
          Transaction.fromHex(stakingTxHex),
          defaultFeeRate,
        );
      await pushTx(signedWithdrawalTx.toHex());
    },
    [
      createBtcStakingManager,
      defaultFeeRate,
      pushTx,
      stakerInfo,
      tipHeight,
      logger,
    ],
  );

  /**
   * Submit the withdrawal transaction for a slashed staking
   *
   * @param stakingInput - The staking inputs
   * @param paramVersion - The param version of the EOI
   * @param slashingTxHex - The slashing transaction hex that to be withdrawn
   */
  const submitSlashingWithdrawalTx = useCallback(
    async (
      stakingInput: BtcStakingInputs,
      paramVersion: number,
      slashingTxHex: string,
    ) => {
      const btcStakingManager = createBtcStakingManager();
      const commonInputs = validateStakingManagerInputs(
        btcStakingManager,
        stakingInput,
        tipHeight,
        stakerInfo,
      );

      const { transaction: signedWithdrawalTx } =
        await commonInputs.btcStakingManager.createSignedBtcWithdrawSlashingTransaction(
          stakerInfo,
          stakingInput,
          paramVersion,
          Transaction.fromHex(slashingTxHex),
          defaultFeeRate,
        );
      await pushTx(signedWithdrawalTx.toHex());
    },
    [createBtcStakingManager, defaultFeeRate, pushTx, stakerInfo, tipHeight],
  );

  return {
    createDelegationEoi,
    estimateStakingFee,
    transitionPhase1Delegation,
    submitStakingTx,
    submitUnbondingTx,
    submitEarlyUnbondedWithdrawalTx,
    submitTimelockUnbondedWithdrawalTx,
    submitSlashingWithdrawalTx,
    tipHeight,
  };
};

/**
 * Get the inclusion proof for a staking transaction
 * @param stakingTx - The staking transaction
 * @returns The inclusion proof
 */
const getInclusionProof = async (stakingTx: Transaction) => {
  // Get the merkle proof
  const { pos, merkle } = await getTxMerkleProof(stakingTx.getId());

  const {
    status: { blockHash: blockHashHex },
  } = await getTxInfo(stakingTx.getId());

  return {
    pos,
    merkle,
    blockHashHex,
  };
};
