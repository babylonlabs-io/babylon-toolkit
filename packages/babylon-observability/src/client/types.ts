import type { SeverityLevel } from "@sentry/react";

export type Value = string | number | boolean | object;

export type Context = Record<string, Value | Value[]> & {
  category?: string;
};

export type ErrorContext = {
  level?: SeverityLevel;
  tags?: Record<string, string>;
  data?: Record<string, Value | Value[]>;
};

/**
 * Configuration options for Sentry initialization
 */
export interface SentryInitOptions {
  /**
   * Function to get the current commit hash for release tracking
   */
  getCommitHash: () => string;

  /**
   * Function to determine if the current environment is production
   */
  isProductionEnv: () => boolean;

  /**
   * Optional list of analytics category strings to filter from breadcrumbs
   */
  analyticsCategories?: string[];

  /**
   * Optional list of analytics message strings to filter from sentry.event breadcrumbs
   */
  analyticsMessages?: string[];

  /**
   * Optional custom beforeSend handler for additional event processing
   */
  customBeforeSend?: (event: any, hint: any) => any;

  /**
   * Optional custom beforeBreadcrumb handler for additional breadcrumb filtering
   */
  customBeforeBreadcrumb?: (breadcrumb: any) => any | null;
}
