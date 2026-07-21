import {
  CloseIcon,
  type IconProps,
  InfoIcon,
  type NotificationAction,
  NotificationActionButton,
  type NotificationActionsPlacement,
  PauseIcon,
  Text,
  WarningIcon,
} from "@babylonlabs-io/core-ui";
import { type ComponentType, type HTMLAttributes, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { COPY } from "@/copy";

/**
 * v3 notification card (Figma "TBV v.3 – Premium Design"), shared by the
 * position banner (#2072) and the protocol pause banner (#2073) behind
 * `ENABLE_V3_UI`. Pure presentation — every input is derived upstream and
 * passed in.
 *
 * Deliberate fork of core-ui's `Notification` (not an inline flag-branch, and
 * not a core-ui change). Kept in the app on purpose while the v3 epic churns:
 * the per-state accents here (error-dark, secondary-main, info-dark, the split
 * gold reorder accent) are NOT expressible through core-ui's locked variant
 * palette, and the tone names are vault-notification domain concepts
 * ("cliff" / "dust" / "too-many" / "soft-paused") that do not belong in the
 * design system's `NotificationVariant` union. When v3 becomes the default,
 * revisit consolidating the shared shell + the per-entry `assertive` flag (an
 * improvement over core-ui's hardcoded `variant === "error" || "halted"`)
 * upstream into core-ui. Until then, v2 keeps using core-ui `Notification`
 * unchanged, so the flag-off path is untouched.
 */
export type NotificationCardTone =
  | "urgent"
  | "cliff"
  | "reorder"
  | "dust"
  | "too-many"
  | "soft-paused"
  | "fully-paused";

// The Figma REORDER border gold is the app's `--risk-amber` token (255 179 0 in
// dark, #F7931A in light), so the border themes with the rest of v3 instead of
// pinning one theme's hex.
const REORDER_BORDER = "border-risk-amber";

const ON_DARK_ACCENT = "text-accent-contrast";
const ON_LIGHT_ACCENT = "text-primary-main";

// Figma card surfaces: every card is `background/secondary`, except the urgent
// one, which is `background/contrast` washed with 6% `error/dark`.
const SURFACE = "bg-background-secondary";
const SURFACE_CONTRAST = "bg-background-contrast";

// Figma shares one radius (8px, from core-ui's action button) but not one size.
// The default is core-ui's own `px-4 py-2 text-sm` = the 36px critical-card
// buttons; the other two frames deviate per card.
const ACTION_SIZE_DEFAULT = "";
const ACTION_SIZE_TALL = "h-10 text-base"; // "Add sacrificial vault" (§3)
const ACTION_SIZE_WIDE = "h-9 px-6"; // "Apply Optimal Order" (§5)

// Outlined actions take Figma's `stroke/primary` (#5A5A5A in dark), not the
// fainter `stroke/secondary` core-ui defaults to.
const SECONDARY_ACTION_BORDER = "border-secondary-strokeDark";

// The suggestion box inset differs per card: 16px on the reorder card (§5) and
// the tighter 8px/16px on the cliff card (§4). Presentational, so the caller
// picks it; `comfortable` is the default because it is the shape every
// non-cliff suggestion (reorder chips, stacked secondary warnings) uses.
export type NotificationCardSuggestionPadding = "comfortable" | "compact";

const SUGGESTION_PADDING: Record<NotificationCardSuggestionPadding, string> = {
  comfortable: "p-4",
  compact: "px-4 py-2",
};

interface ToneAccent {
  border: string;
  surface: string;
  chipBg: string;
  onChip: string;
  actionBg: string;
  onAction: string;
  actionSize: string;
  tint: string;
  icon: ComponentType<IconProps>;
  assertive: boolean;
}

const TONE_ACCENT: Record<NotificationCardTone, ToneAccent> = {
  urgent: {
    border: "border-error-dark",
    // The only card whose base is `background/contrast` (§1).
    surface: SURFACE_CONTRAST,
    chipBg: "bg-error-dark/80",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-error-dark",
    onAction: ON_DARK_ACCENT,
    actionSize: ACTION_SIZE_DEFAULT,
    // Same-stop gradient on purpose: a flat `bg-*` would clobber the surface
    // class, so the tint is layered as a gradient that twMerge keeps alongside
    // the base background.
    tint: "bg-gradient-to-r from-error-dark/[0.06] to-error-dark/[0.06]",
    icon: WarningIcon,
    assertive: true,
  },
  cliff: {
    border: "border-secondary-main",
    surface: SURFACE,
    chipBg: "bg-secondary-main",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-secondary-main",
    onAction: ON_DARK_ACCENT,
    actionSize: ACTION_SIZE_TALL,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  // Reorder splits the gold: the Figma REORDER frame draws the border in the
  // risk-amber gold but fills the "Apply Optimal Order" CTA with warning/light.
  // The icon chip never renders (the banner passes icon={null}), so
  // chipBg only mirrors the CTA fill for consistency.
  reorder: {
    border: REORDER_BORDER,
    surface: SURFACE,
    chipBg: "bg-warning-light",
    onChip: ON_LIGHT_ACCENT,
    actionBg: "bg-warning-light",
    onAction: ON_LIGHT_ACCENT,
    actionSize: ACTION_SIZE_WIDE,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  // Figma's dust accent is the deep navy `accent/secondary` (#042F40), which is
  // `accent-navy` — not `primary-main`, whose dark value is near-black #111111.
  dust: {
    border: "border-accent-navy",
    surface: SURFACE,
    chipBg: "bg-accent-navy",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-accent-navy",
    onAction: ON_DARK_ACCENT,
    actionSize: ACTION_SIZE_DEFAULT,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  "too-many": {
    border: "border-warning-main",
    surface: SURFACE,
    chipBg: "bg-warning-main",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-warning-main",
    onAction: ON_DARK_ACCENT,
    actionSize: ACTION_SIZE_DEFAULT,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  "soft-paused": {
    border: "border-info-dark",
    surface: SURFACE,
    chipBg: "bg-info-dark",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-info-dark",
    onAction: ON_DARK_ACCENT,
    actionSize: ACTION_SIZE_DEFAULT,
    tint: "",
    icon: PauseIcon,
    assertive: false,
  },
  "fully-paused": {
    border: "border-error-main",
    surface: SURFACE,
    chipBg: "bg-error-main",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-error-main",
    onAction: ON_DARK_ACCENT,
    actionSize: ACTION_SIZE_DEFAULT,
    tint: "",
    icon: PauseIcon,
    assertive: true,
  },
};

const ICON_SIZE = 24;
// Figma's close (X) is a 14px mark centered in a 24px frame; the CloseIcon glyph
// is full-bleed (no internal padding), so render it at 14 to match the visible X.
const CLOSE_ICON_SIZE = 14;

// React drops `false`/`null`/`undefined`, but `0` and `""` are valid content —
// gate optional slots on absence, not truthiness, so they are not swallowed.
const isPresent = (node: ReactNode): boolean => node != null && node !== false;

export interface NotificationCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone: NotificationCardTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode | null;
  actions?: NotificationAction[];
  actionsPlacement?: NotificationActionsPlacement;
  suggestion?: ReactNode;
  suggestionPadding?: NotificationCardSuggestionPadding;
  onClose?: () => void;
}

export function NotificationCard({
  tone,
  title,
  icon,
  actions,
  actionsPlacement = "inline",
  suggestion,
  suggestionPadding = "comfortable",
  onClose,
  className,
  children,
  role,
  ...rest
}: NotificationCardProps) {
  const accent = TONE_ACCENT[tone];
  const resolvedRole = role ?? (accent.assertive ? "alert" : "status");

  const DefaultIcon = accent.icon;
  const iconNode =
    icon === null
      ? null
      : (icon ?? <DefaultIcon size={ICON_SIZE} color={accent.onChip} />);

  const hasActions = Boolean(actions && actions.length > 0);
  const hasInlineActions = hasActions && actionsPlacement === "inline";
  const hasBelowActions = hasActions && actionsPlacement === "below";

  // Vertically center only in the simple inline case (icon + text + actions on
  // one row); any stacked content — a suggestion box or a top-right close —
  // top-aligns so the icon and close control sit at the top.
  const centerAlign = hasInlineActions && !suggestion && !onClose;
  const alignClass = centerAlign ? "items-center" : "items-start";

  // core-ui owns the shared button shell (8px radius, base padding, disabled
  // state); only the per-card size and the outlined border ride in as overrides.
  const actionButtons = actions?.map((action, index) => (
    <NotificationActionButton
      key={index}
      action={action}
      accentBg={accent.actionBg}
      onAccent={accent.onAction}
      className={twMerge(
        accent.actionSize,
        action.emphasis === "secondary" && SECONDARY_ACTION_BORDER,
      )}
    />
  ));

  return (
    <div
      role={resolvedRole}
      data-tone={tone}
      className={twMerge(
        "flex w-full gap-6 rounded-lg border-l-4 p-6",
        accent.surface,
        accent.tint,
        accent.border,
        alignClass,
        className,
      )}
      {...rest}
    >
      <div className={twMerge("flex min-w-0 flex-1 gap-4", alignClass)}>
        {iconNode && (
          <div
            aria-hidden="true"
            className={twMerge(
              "flex shrink-0 items-center justify-center rounded-lg p-2.5",
              accent.chipBg,
            )}
          >
            {iconNode}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Figma stacks the title and body with no gap. */}
          <div className="flex min-w-0 flex-col">
            {isPresent(title) && (
              <div className="break-words text-xl font-bold tracking-0.15 text-accent-primary">
                {title}
              </div>
            )}
            {isPresent(children) && (
              <Text
                as="div"
                variant="body2"
                className="break-words text-accent-secondary"
              >
                {children}
              </Text>
            )}
          </div>

          {isPresent(suggestion) && (
            <div
              className={twMerge(
                "flex w-full flex-col gap-2 rounded-lg bg-background-contrast text-accent-secondary",
                SUGGESTION_PADDING[suggestionPadding],
              )}
            >
              {suggestion}
            </div>
          )}

          {hasBelowActions && (
            <div className="flex flex-wrap items-center gap-2">
              {actionButtons}
            </div>
          )}
        </div>
      </div>

      {hasInlineActions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actionButtons}
        </div>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={COPY.common.dismissNotification}
          className="flex size-6 shrink-0 items-center justify-center rounded text-accent-secondary transition-colors hover:text-accent-primary"
        >
          <CloseIcon size={CLOSE_ICON_SIZE} />
        </button>
      )}
    </div>
  );
}
