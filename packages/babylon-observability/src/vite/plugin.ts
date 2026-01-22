import { sentryVitePlugin } from "@sentry/vite-plugin";
import type { Plugin } from "vite";

export interface SentryVitePluginOptions {
  /**
   * Whether to disable Sentry during E2E builds
   */
  isE2EBuild?: boolean;

  /**
   * Whether Sentry is explicitly disabled via environment
   */
  isDisabled?: boolean;

  /**
   * Output directory for source maps
   * @default "./dist/**"
   */
  sourcemapAssets?: string;
}

/**
 * Check if Sentry plugin should be enabled based on environment variables
 */
export function isSentryPluginEnabled(options: SentryVitePluginOptions = {}): boolean {
  const { isE2EBuild = false, isDisabled = false } = options;

  const isSentryDisabled =
    isE2EBuild ||
    isDisabled ||
    process.env.NEXT_BUILD_E2E ||
    process.env.DISABLE_SENTRY === "true";

  return (
    !isSentryDisabled &&
    Boolean(
      process.env.SENTRY_AUTH_TOKEN &&
        process.env.SENTRY_ORG &&
        process.env.SENTRY_PROJECT,
    )
  );
}

/**
 * Create a configured Sentry Vite plugin for source map uploads
 *
 * @param options - Plugin configuration options
 * @returns Configured Sentry Vite plugin
 */
export function createSentryVitePlugin(
  options: SentryVitePluginOptions = {},
): Plugin {
  const { sourcemapAssets = "./dist/**" } = options;
  const enabled = isSentryPluginEnabled(options);

  return sentryVitePlugin({
    disable: !enabled,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    url: process.env.SENTRY_URL,
    release: {
      name: process.env.SENTRY_RELEASE,
      dist: process.env.SENTRY_DIST,
    },
    sourcemaps: {
      assets: sourcemapAssets,
    },
    silent: !process.env.CI,
    telemetry: false,
    errorHandler: (err) => {
      // Don't fail the build if Sentry operations fail
      console.warn("⚠️ Sentry encountered an error during build:");
      console.warn("⚠️", err.message);
    },
  });
}
