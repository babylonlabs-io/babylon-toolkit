import { useId, useState, type PropsWithChildren, type ReactNode } from "react";
import { InfoIcon } from "../Icons";
import { MobileDialog } from "../Dialog";
import { Heading } from "../Heading";
import { Text } from "../Text";
import { useIsTouchFirst } from "../../hooks/useIsTouchFirst";
import { Tooltip } from "react-tooltip";
import { twJoin } from "tailwind-merge";

type HintStatus = "default" | "warning" | "error";

export interface HintProps {
  tooltip?: ReactNode;
  status?: HintStatus;
  /** Attach tooltip to children instead of showing separate icon */
  attachToChildren?: boolean;
  /** Custom icon to use instead of default InfoIcon */
  icon?: ReactNode;
  /** Custom className for wrapper */
  className?: string;
  /** Placement of the tooltip */
  placement?: "top" | "bottom" | "left" | "right";
  /** Tooltip text color variant */
  tooltipVariant?: "primary" | "secondary";
  /** Custom offset for tooltip positioning [x, y] */
  offset?: [number, number];
  /** Heading of the bottom sheet the hint opens on touch-first devices */
  title?: ReactNode;
  /** On touch-first devices, how an attached hint shows: a tap-to-open sheet, or the text below the children */
  touchFallback?: "sheet" | "text";
}

const DEFAULT_INFO_LABEL = "More information";

const STATUS_COLORS = {
  default: "text-accent-primary",
  warning: "text-warning-main",
  error: "text-error-main",
} as const;

const ICON_COLOR = {
  default: "text-accent-secondary",
  warning: "text-warning-main",
  error: "text-error-main",
} as const;

export function Hint({
  children,
  tooltip,
  status = "default",
  attachToChildren = false,
  icon,
  className,
  placement = "top",
  tooltipVariant = "primary",
  offset = [8, 8],
  title,
  touchFallback = "sheet",
}: PropsWithChildren<HintProps>) {
  const id = useId();
  const isTouchFirst = useIsTouchFirst();
  const [sheetOpen, setSheetOpen] = useState(false);
  const statusColor = STATUS_COLORS[status];

  // Create custom middleware for horizontal offset
  const customOffset = {
    name: 'customOffset',
    fn: ({ x, y, placement }: { x: number; y: number; placement: HintProps['placement'] }) => {
      let nextX = x;
      let nextY = y;

      // Apply offsets based on placement direction so that positive offsets
      // move the tooltip away from the reference element on the main axis
      if (placement === 'top') {
        nextY = y - offset[1];
      } else if (placement === 'bottom') {
        nextY = y + offset[1];
      } else if (placement === 'left') {
        nextX = x - offset[0];
      } else if (placement === 'right') {
        nextX = x + offset[0];
      }

      return { x: nextX, y: nextY };
    },
  };

  if (!tooltip) {
    // Use an inline wrapper when attaching to children to keep valid inline semantics
    if (attachToChildren) {
      return (
        <span className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
          {children}
        </span>
      );
    }
    return (
      <div className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
        {children}
      </div>
    );
  }

  // Default icon with proper size and color
  const defaultIcon = <InfoIcon size={16} className={ICON_COLOR[status]} />;
  const tooltipIcon = icon || defaultIcon;

  if (isTouchFirst && attachToChildren && touchFallback === "text") {
    return (
      <span className={twJoin("inline-flex flex-col gap-1", statusColor, className)}>
        {children}
        <Text as="span" variant="caption" role="note" className="w-0 min-w-full text-accent-secondary">
          {tooltip}
        </Text>
      </span>
    );
  }

  if (isTouchFirst) {
    const titleId = `${id}-title`;
    const openSheet = () => setSheetOpen(true);
    const triggerLabel = <span className="sr-only">{title ?? DEFAULT_INFO_LABEL}</span>;
    // Kept outside the trigger wrapper: React bubbles portal clicks to it, so a backdrop tap would reopen the sheet.
    const sheet = (
      <MobileDialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        handle
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : DEFAULT_INFO_LABEL}
        backdropClassName="bg-[#000000]/40"
        className="min-h-[7.5rem] rounded-t-lg border-b-0 bg-background-contrast pt-6"
      >
        <div className="flex flex-col gap-2">
          {title ? (
            <Heading variant="h6" as="p" id={titleId} className="text-accent-primary">
              {title}
            </Heading>
          ) : null}
          <Text as="div" variant="body2" className="tracking-[0.17px] text-accent-secondary">
            {tooltip}
          </Text>
        </div>
      </MobileDialog>
    );

    if (attachToChildren) {
      return (
        <>
          <span
            className={twJoin("group relative inline-flex items-center gap-1", statusColor, className)}
            onClick={openSheet}
          >
            {children}
            {/* A disabled control swallows taps, so a cover button takes them instead. */}
            <button type="button" className="absolute inset-0 hidden group-has-[:disabled]:block">
              {triggerLabel}
            </button>
          </span>
          {sheet}
        </>
      );
    }

    return (
      <div className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
        {children}
        <button
          type="button"
          onClick={openSheet}
          className={twJoin(
            "relative inline-flex items-center before:absolute before:-inset-y-3 before:-left-6 before:right-0 before:content-['']",
            statusColor,
          )}
        >
          {tooltipIcon}
          {triggerLabel}
        </button>
        {sheet}
      </div>
    );
  }

  return (
    attachToChildren ? (
      <span className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
        <span
          className="cursor-default"
          data-tooltip-id={id}
          data-tooltip-content={
            typeof tooltip === "string" ? tooltip : undefined
          }
          data-tooltip-place={placement}
          data-tooltip-position-strategy="fixed"
          data-tooltip-wrapper="span"
        >
          {children}
        </span>

        <Tooltip
          id={id}
          className={twJoin(
            "react-tooltip",
            tooltipVariant === "secondary" && "react-tooltip--secondary"
          )}
          openOnClick={false}
          clickable={true}
          place={placement}
          style={{ zIndex: 99999 }}
          positionStrategy="fixed"
          middlewares={[customOffset]}
          offset={0}
        >
          {typeof tooltip !== "string" && tooltip}
        </Tooltip>
      </span>
    ) : (
      <div className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
        {children}
        <span
          className={twJoin("cursor-default inline-flex items-center", statusColor)}
          data-tooltip-id={id}
          data-tooltip-content={
            typeof tooltip === "string" ? tooltip : undefined
          }
          data-tooltip-place={placement}
          data-tooltip-position-strategy="fixed"
          data-tooltip-wrapper="span"
        >
          {tooltipIcon}
        </span>

        <Tooltip
          id={id}
          className={twJoin(
            "react-tooltip",
            tooltipVariant === "secondary" && "react-tooltip--secondary"
          )}
          openOnClick={false}
          clickable={true}
          place={placement}
          style={{ zIndex: 99999 }}
          positionStrategy="fixed"
          middlewares={[customOffset]}
          offset={0}
        >
          {typeof tooltip !== "string" && tooltip}
        </Tooltip>
      </div>
    )
  );
}
