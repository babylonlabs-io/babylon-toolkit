/**
 * Navigation state keys used across the application for type-safe routing state management.
 * Centralizing these constants prevents typos and provides better IDE support.
 */
export const NAVIGATION_STATE_KEYS = {
  PREFILL_COSTAKING: "shouldPrefillCoStaking",
} as const;

/**
 * Type-safe navigation state structure.
 * Add new state properties here as needed.
 */
export type NavigationState = {
  [NAVIGATION_STATE_KEYS.PREFILL_COSTAKING]?: boolean;
};
