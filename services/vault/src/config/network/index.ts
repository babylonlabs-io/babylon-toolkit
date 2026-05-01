export {
  configureBabylonConfig,
  type BabylonConfigOptions,
  type BabylonConfigState,
  type EthChainId,
} from "./runtime";

// `_resetBabylonConfigForTests` is intentionally NOT re-exported here —
// it is a test-only escape hatch. Tests import it directly from
// `@/config/network/runtime`.

export * from "./btc";
export * from "./eth";
