/**
 * Shared dot color mappings for vault status badges.
 *
 * Maps display variant strings to Tailwind background classes
 * used by VaultStatusBadge in pending deposit and withdraw cards.
 */

export const STATUS_DOT_COLORS = {
  pending: "bg-warning-main",
  active: "bg-success-main",
  inactive: "bg-gray-400",
  warning: "bg-error-main",
} as const;
