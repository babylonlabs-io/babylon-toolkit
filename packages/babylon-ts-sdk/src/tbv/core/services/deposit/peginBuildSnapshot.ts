/**
 * On-chain values the BTC scripts in `unsignedTxHex` were committed to.
 * Compared at resume-broadcast against current chain state to detect drift.
 */
export interface PeginBuildSnapshot {
  offchainParamsVersion: number;
  appVaultKeepersVersion: number;
  universalChallengersVersion: number;
  vaultProviderBtcPubkeyXOnly: string;
}
