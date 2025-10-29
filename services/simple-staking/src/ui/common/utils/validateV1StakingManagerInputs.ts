import {
  BabylonBtcStakingManager,
  VersionedStakingParams,
} from "@babylonlabs-io/btc-staking-ts";

import { ClientError, ERROR_CODES } from "@/ui/common/errors";
import type { BtcStakingInputs } from "@/ui/common/types/stakingInputs";
import { validateStakingInput } from "@/ui/common/utils/delegations";

interface StakerBtcInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

interface Logger {
  warn: (message: string) => void;
}

/**
 * Validates all required inputs for V1 BTC staking manager operations
 * Note: V1 operations use versioned staking params instead of tip height
 *
 * @param btcStakingManager - The BTC Staking Manager instance
 * @param stakingInput - The staking inputs (e.g. amount, timelock, finality providers)
 * @param stakerBtcInfo - The staker BTC info (address and public key)
 * @param versionedParams - The versioned staking parameters (V1 specific)
 * @param logger - Optional logger for warning messages
 * @throws {ClientError} When any input is invalid or missing
 */
export const validateV1StakingManagerInputs = (
  btcStakingManager: BabylonBtcStakingManager | null,
  stakingInput: BtcStakingInputs,
  stakerBtcInfo: StakerBtcInfo,
  versionedParams?: VersionedStakingParams[],
  logger?: Logger,
): void => {
  validateStakingInput(stakingInput);

  if (!btcStakingManager) {
    const clientError = new ClientError(
      ERROR_CODES.INITIALIZATION_ERROR,
      "BTC Staking Manager not initialized",
    );
    logger?.warn(clientError.message);
    throw clientError;
  }

  if (
    !stakerBtcInfo ||
    !stakerBtcInfo.address ||
    !stakerBtcInfo.publicKeyNoCoordHex
  ) {
    const clientError = new ClientError(
      ERROR_CODES.INITIALIZATION_ERROR,
      "Staker info not initialized",
    );
    logger?.warn(clientError.message);
    throw clientError;
  }

  if (!versionedParams?.length) {
    const clientError = new ClientError(
      ERROR_CODES.INITIALIZATION_ERROR,
      "Staking params not loaded",
    );
    logger?.warn(clientError.message);
    throw clientError;
  }
};
