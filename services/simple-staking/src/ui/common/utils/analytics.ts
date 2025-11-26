import type { MutableRefObject } from "react";
import * as Sentry from "@sentry/react";

import { isRef } from "./isRef";

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
  PAGE_VIEW = "page.view",
}

/**
 * Analytics event messages
 */
export enum AnalyticsMessage {
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
  // Page view tracking
  PAGE_LEFT = "page_left",
  // Rewards tracking
  CLAIM_ALL_REWARDS = "claim_all_rewards",
  CLAIM_REWARDS_SUCCESS = "claim_rewards_success",
  CONFIRM_CLAIM_REWARDS = "confirm_claim_rewards",
  CANCEL_CLAIM_PREVIEW = "cancel_claim_preview",
  CLAIM_PREVIEW_VIEWED = "claim_preview_viewed",
}

/**
 * Track a custom analytics event using Sentry captureEvent.
 */
export function trackEvent(
  category: AnalyticsCategory,
  message: AnalyticsMessage,
  data: AnalyticsData = {},
) {
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
 * Track viewing time for modals, pages, or any component.
 * Returns a function to call when view ends to log duration.
 *
 * @param category - The analytics event category (e.g., modal, page, form).
 * @param message - The analytics event message describing the action.
 * @param data - Additional analytics data to include with the event.
 * @param minDurationMs - Minimum duration in ms to track (default: 1000ms). Ignores StrictMode double-mount and instant unmounts.
 * @remarks
 * You can pass either a static data object or a `MutableRefObject`.
 * Updating the ref's `.current` during the view ensures cleanup logs the latest values.
 *
 * @example
 * // Track page view
 * const logPageLeft = trackViewTime(AnalyticsCategory.PAGE_VIEW, AnalyticsMessage.PAGE_LEFT, { pageName: 'RewardsPage' });
 * return () => logPageLeft();
 *
 * @example
 * // Track modal view
 * const logModalClose = trackViewTime(AnalyticsCategory.MODAL_VIEW, AnalyticsMessage.MODAL_VIEWED, { modalName: 'ClaimPreview' });
 * return () => logModalClose();
 */
export function trackViewTime(
  category: AnalyticsCategory,
  message: AnalyticsMessage,
  data: AnalyticsData | MutableRefObject<AnalyticsData>,
  minDurationMs = 1000,
) {
  const startTime = performance.now();

  return () => {
    const duration = Math.round(performance.now() - startTime);

    // Ignore StrictMode double-mount and instant unmounts
    if (duration < minDurationMs) {
      return;
    }

    const dataToTrack = isRef<AnalyticsData>(data) ? data.current : data;

    trackEvent(category, message, {
      ...dataToTrack,
      durationMs: duration,
      durationSeconds: Math.round(duration / 1000),
    });
  };
}
