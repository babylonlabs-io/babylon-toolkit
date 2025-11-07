import * as Sentry from "@sentry/react";

type AnalyticsData = NonNullable<Sentry.Breadcrumb["data"]>;

/**
 * Analytics event categories for co-staking features
 */
export enum AnalyticsCategory {
  MODAL_VIEW = "modal.view",
  MODAL_INTERACTION = "modal.interaction",
  FORM_INTERACTION = "form.interaction",
  CTA_CLICK = "cta.click",
  NAVIGATION = "navigation",
}

/**
 * Type-safe analytics event messages
 */
export type AnalyticsMessage =
  | "boost_apr_stake_baby"
  | "prefill_costaking_amount"
  | "dismiss_costaking_prefill_cta"
  | "close_modal"
  | "modal_viewed";

/**
 * Track a custom analytics event using Sentry breadcrumbs and captureEvent.
 */
export function trackEvent(
  category: AnalyticsCategory,
  message: AnalyticsMessage,
  data: AnalyticsData = {},
) {
  const breadcrumb: Sentry.Breadcrumb = {
    category,
    message,
    level: "info",
    data: {
      timestamp: new Date().toISOString(),
      ...data,
    },
  };

  Sentry.captureEvent({
    message,
    level: "info",
    breadcrumbs: [breadcrumb],
    tags: {
      "analytics.category": category,
    },
    extra: data,
  });
}

/**
 * Track modal viewing time. Returns a function to call when modal closes to log duration.
 */
export function trackModalView(
  message: AnalyticsMessage,
  data: AnalyticsData = {},
) {
  const startTime = performance.now();

  return () => {
    const duration = Math.round(performance.now() - startTime);
    trackEvent(AnalyticsCategory.MODAL_VIEW, message, {
      ...data,
      durationMs: duration,
      durationSeconds: Math.round(duration / 1000),
    });
  };
}
