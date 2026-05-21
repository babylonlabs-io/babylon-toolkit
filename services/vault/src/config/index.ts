/**
 * Configuration exports
 */

export { getBTCNetwork, getNetworkConfigBTC } from "./btc";
export type { ExtendedBTCConfig } from "./btc";
export { default as FeatureFlags } from "./featureFlags";

export const getCommitHash = (): string => {
  return process.env.NEXT_PUBLIC_COMMIT_HASH || "development";
};

export const shouldDisplayTestingMsg = (): boolean => {
  return process.env.NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES !== "false";
};
