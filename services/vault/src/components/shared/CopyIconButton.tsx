import {
  CheckIcon,
  CopyIcon,
  useCopy,
  useIsTouchFirst,
} from "@babylonlabs-io/core-ui";
import { twJoin } from "tailwind-merge";

const COPY_ICON_SIZE = 14;

/**
 * Where the enlarged touch target (touch-first devices only) extends past the
 * icon: 13px on every side, or, below md, only above and below the icon, for
 * a narrow column whose neighbours it must not cover.
 */
const TOUCH_TARGET_CLASSES = {
  around: "before:-inset-[13px]",
  verticalBelowMd:
    "before:inset-x-0 before:-inset-y-[13px] md:before:-inset-x-[13px]",
} as const;

interface CopyIconButtonProps {
  /** Text written to the clipboard. */
  value: string;
  /** Accessible name and tooltip. */
  label: string;
  /** How the enlarged touch target extends; see {@link TOUCH_TARGET_CLASSES}. */
  touchTarget?: keyof typeof TOUCH_TARGET_CLASSES;
}

/**
 * Icon-only copy-to-clipboard button: a copy icon that turns into a check for
 * a moment after the click. On touch-first devices its tap target extends
 * beyond the icon, so leave room around it.
 */
export function CopyIconButton({
  value,
  label,
  touchTarget = "around",
}: CopyIconButtonProps) {
  const { isCopied, copyToClipboard } = useCopy();
  const touchFirst = useIsTouchFirst();

  return (
    <button
      type="button"
      onClick={() => copyToClipboard(value, value)}
      aria-label={label}
      title={label}
      className={twJoin(
        "flex cursor-pointer items-center text-accent-secondary transition-colors hover:text-accent-primary",
        touchFirst &&
          `relative before:absolute before:content-[''] ${TOUCH_TARGET_CLASSES[touchTarget]}`,
      )}
    >
      {isCopied(value) ? (
        <CheckIcon size={COPY_ICON_SIZE} variant="success" />
      ) : (
        <CopyIcon size={COPY_ICON_SIZE} />
      )}
    </button>
  );
}
