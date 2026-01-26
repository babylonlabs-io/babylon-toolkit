// Client initialization
export { initSentry } from "./client/init";
export type { SentryInitOptions, Context, ErrorContext, Value } from "./client/types";

// Infrastructure
export { default as logger } from "./infrastructure/logger";

// Constants
export {
  SENTRY_DEVICE_ID_KEY,
  REPLAYS_ON_ERROR_RATE,
  DEFAULT_PROD_ENVS,
} from "./constants";

// Re-export all from @sentry/react for consumers that need the full API
export * from "@sentry/react";
