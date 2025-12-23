/**
 * Configuration exports
 */

export { CONTRACTS } from "./contracts";
export { ENV, ENV_DEFAULTS } from "./env";

const PROD_ENVS = ["phase-2-mainnet"];

export const isProductionEnv = (): boolean => {
  const env = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "";
  return PROD_ENVS.includes(env);
};

export const getCommitHash = (): string => {
  return process.env.NEXT_PUBLIC_COMMIT_HASH || "development";
};

export const shouldDisplayTestingMsg = (): boolean => {
  return (
    process.env.NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES?.toString() !== "false"
  );
};
