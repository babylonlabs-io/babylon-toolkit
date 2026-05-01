// Public API: explicit init + getters. Library performs no side effects
// at module load and reads no environment variables.

export {
  configureBabylonConfig,
  type BabylonConfigOptions,
  type BabylonConfigState,
  type EthChainId,
  type BtcNetworkName,
  _resetBabylonConfigForTests,
} from "./runtime";

export * from "./network/eth";
export * from "./network/btc";
