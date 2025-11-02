export interface BtcStakingInputs {
  finalityProviderPksNoCoordHex: string[];
  stakingAmountSat: number;
  stakingTimelock: number;
}

export interface BtcStakingExpansionInputs {
  finalityProviderPksNoCoordHex: string[];
  stakingAmountSat: number;
  stakingTimelock: number;
  previousStakingTxHex: string;
  previousStakingParamsVersion: number;
  previousStakingInput: BtcStakingInputs;
}
