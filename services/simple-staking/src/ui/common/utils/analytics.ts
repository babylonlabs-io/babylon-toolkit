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
 * Analytics event messages
 */
export enum AnalyticsMessage {
  BOOST_APR_STAKE_BABY = "boost_apr_stake_baby",
  PREFILL_COSTAKING_AMOUNT = "prefill_costaking_amount",
  DISMISS_COSTAKING_PREFILL_CTA = "dismiss_costaking_prefill_cta",
  CLOSE_MODAL = "close_modal",
  MODAL_VIEWED = "modal_viewed",
  PREVIEW_BABY_STAKE = "preview_baby_stake",
  CONFIRM_BABY_STAKE = "confirm_baby_stake",
  // Form interactions
  FORM_FIELD_CHANGED = "form_field_changed",
  FORM_VALIDATION_ERROR = "form_validation_error",
  FORM_SUBMITTED = "form_submitted",
  FORM_SUBMISSION_FAILED = "form_submission_failed",
}

/**
 * Track a custom analytics event using Sentry captureEvent.
 */
export function trackEvent(
  category: AnalyticsCategory,
  message: AnalyticsMessage,
  data: AnalyticsData = {},
) {
  // TODO: Remove log after testing
  console.log("trackEvent", category, message, data);
  Sentry.captureEvent({
    message,
    level: "debug",
    tags: {
      "analytics.category": category,
    },
    extra: {
      timestamp: new Date().toISOString(),
      ...data,
    },
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
