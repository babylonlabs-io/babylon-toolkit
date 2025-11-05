import { BabylonBtcStakingManager } from "@babylonlabs-io/btc-staking-ts";

import { ClientError, ERROR_CODES } from "@/ui/common/errors";
import type { BtcStakingInputs } from "@/ui/common/types/stakingInputs";
import { validateStakingInput } from "@/ui/common/utils/delegations";

interface StakerInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

interface CommonInputsResult {
  btcStakingManager: BabylonBtcStakingManager;
  tipHeight: number;
}

/**
 * Validates all required inputs for BTC staking manager operations
 * @param btcStakingManager - The BTC Staking Manager instance
 * @param stakingInput - The staking inputs (e.g. amount, timelock, finality providers)
 * @param tipHeight - The BTC tip height from the Babylon chain
 * @param stakerInfo - The staker info (e.g. address, public key)
 * @returns Validated and type-narrowed inputs
 * @throws {ClientError} When any input is invalid or missing
 */
export const validateStakingManagerInputs = (
  btcStakingManager: BabylonBtcStakingManager | null,
  stakingInput: BtcStakingInputs,
  tipHeight: number | undefined,
  stakerInfo: StakerInfo,
): CommonInputsResult => {
  validateStakingInput(stakingInput);

  if (!btcStakingManager) {
    throw new ClientError(
      ERROR_CODES.INITIALIZATION_ERROR,
      "BTC Staking Manager not initialized",
    );
  }

  if (
    typeof tipHeight !== "number" ||
    Number.isNaN(tipHeight) ||
    !Number.isFinite(tipHeight) ||
    tipHeight <= 0
  ) {
    throw new ClientError(
      ERROR_CODES.INITIALIZATION_ERROR,
      "Tip height not initialized",
    );
  }

  if (!stakerInfo?.address || !stakerInfo.publicKeyNoCoordHex) {
    throw new ClientError(
      ERROR_CODES.INITIALIZATION_ERROR,
      "Staker info not initialized",
    );
  }

  return {
    btcStakingManager,
    tipHeight,
  };
};
