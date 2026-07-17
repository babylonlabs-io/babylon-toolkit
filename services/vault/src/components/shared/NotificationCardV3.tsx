import {
  CloseIcon,
  type IconProps,
  InfoIcon,
  type NotificationAction,
  type NotificationActionsPlacement,
  PauseIcon,
  Text,
  WarningIcon,
} from "@babylonlabs-io/core-ui";
import { type ComponentType, type HTMLAttributes, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type NotificationCardV3Tone =
  | "urgent"
  | "cliff"
  | "reorder"
  | "dust"
  | "too-many"
  | "soft-paused"
  | "fully-paused";

const REORDER_BORDER = "border-[#ffb300]";

const ON_DARK_ACCENT = "text-accent-contrast";
const ON_LIGHT_ACCENT = "text-primary-main";

interface ToneAccent {
  border: string;
  chipBg: string;
  onChip: string;
  actionBg: string;
  onAction: string;
  tint: string;
  icon: ComponentType<IconProps>;
  assertive: boolean;
}

const TONE_ACCENT: Record<NotificationCardV3Tone, ToneAccent> = {
  urgent: {
    border: "border-error-dark",
    chipBg: "bg-error-dark/80",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-error-dark",
    onAction: ON_DARK_ACCENT,
    tint: "bg-gradient-to-r from-error-dark/[0.06] to-error-dark/[0.06]",
    icon: WarningIcon,
    assertive: true,
  },
  cliff: {
    border: "border-secondary-main",
    chipBg: "bg-secondary-main",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-secondary-main",
    onAction: ON_DARK_ACCENT,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  reorder: {
    border: REORDER_BORDER,
    chipBg: "bg-warning-light",
    onChip: ON_LIGHT_ACCENT,
    actionBg: "bg-warning-light",
    onAction: ON_LIGHT_ACCENT,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  dust: {
    border: "border-primary-main",
    chipBg: "bg-primary-main",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-primary-main",
    onAction: ON_DARK_ACCENT,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  "too-many": {
    border: "border-warning-main",
    chipBg: "bg-warning-main",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-warning-main",
    onAction: ON_DARK_ACCENT,
    tint: "",
    icon: WarningIcon,
    assertive: false,
  },
  "soft-paused": {
    border: "border-info-dark",
    chipBg: "bg-info-dark",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-info-dark",
    onAction: ON_DARK_ACCENT,
    tint: "",
    icon: InfoIcon,
    assertive: false,
  },
  "fully-paused": {
    border: "border-error-main",
    chipBg: "bg-error-main",
    onChip: ON_DARK_ACCENT,
    actionBg: "bg-error-main",
    onAction: ON_DARK_ACCENT,
    tint: "",
    icon: PauseIcon,
    assertive: true,
  },
};

const ICON_SIZE = 24;
const CLOSE_ICON_SIZE = 14;

const ACTION_BASE =
  "rounded-full px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const isPresent = (node: ReactNode): boolean => node != null && node !== false;

export interface NotificationCardV3Props
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone: NotificationCardV3Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode | null;
  actions?: NotificationAction[];
  actionsPlacement?: NotificationActionsPlacement;
  suggestion?: ReactNode;
  onClose?: () => void;
}

export function NotificationCardV3({
  tone,
  title,
  icon,
  actions,
  actionsPlacement = "inline",
  suggestion,
  onClose,
  className,
  children,
  role,
  ...rest
}: NotificationCardV3Props) {
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

  const centerAlign = hasInlineActions && !suggestion && !onClose;
  const alignClass = centerAlign ? "items-center" : "items-start";

  const actionButtons = actions?.map((action, index) => {
    const { label, emphasis = "primary", onClick, disabled } = action;
    const styles =
      emphasis === "primary"
        ? twMerge(
            ACTION_BASE,
            accent.actionBg,
            accent.onAction,
            "hover:opacity-90",
          )
        : twMerge(
            ACTION_BASE,
            "border border-secondary-strokeLight text-accent-primary hover:bg-neutral-200",
          );
    return (
      <button
        key={index}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={styles}
      >
        {label}
      </button>
    );
  });

  return (
    <div
      role={resolvedRole}
      data-tone={tone}
      className={twMerge(
        "flex w-full gap-6 rounded-lg border-l-4 bg-secondary-highlight p-6",
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
          <div className="flex min-w-0 flex-col gap-1">
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
            <div className="flex w-full flex-col gap-2 rounded-lg bg-neutral-200 p-4 text-accent-secondary">
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
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 flex shrink-0 items-center justify-center rounded p-1 text-accent-secondary transition-colors hover:text-accent-primary"
        >
          <CloseIcon size={CLOSE_ICON_SIZE} />
        </button>
      )}
    </div>
  );
}
