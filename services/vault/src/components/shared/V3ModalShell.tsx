/**
 * Shared full-screen modal shell for the v3 flows.
 *
 * Every v3 overlay (deposit, borrow/repay, reorder, withdraw, and their
 * success screens) renders through this so they share one header: a close
 * button on the left and the network chip + settings menu on the right, both
 * aligned to the same content column the page uses. The card itself is
 * centered and capped at `contentClassName`.
 *
 * Pre-v3 it falls back to the plain centered `FullScreenDialog` those flows
 * used before, so the v2 look is unchanged.
 */

import {
  FullScreenDialog,
  StandardSettingsMenu,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { IoArrowBack, IoClose } from "react-icons/io5";
import { twJoin } from "tailwind-merge";

import { NetworkBadge } from "@/components/shared/NetworkBadge";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { FeatureFlags } from "@/config";
import { COPY } from "@/copy";

interface V3ModalShellProps {
  open: boolean;
  /** Omit to lock dismissal (e.g. while a tx is in flight). */
  onClose?: () => void;
  /** When set, the top-left control is a back arrow instead of a close X. */
  onBack?: () => void;
  disableEscapeClose?: boolean;
  /** Max-width (and any extra layout) for the centered card. */
  contentClassName?: string;
  children: ReactNode;
}

export function V3ModalShell({
  open,
  onClose,
  onBack,
  disableEscapeClose,
  contentClassName,
  children,
}: V3ModalShellProps) {
  const { theme, setTheme } = useTheme();

  if (!FeatureFlags.isV3UiEnabled) {
    return (
      <FullScreenDialog
        open={open}
        onClose={onClose}
        onBack={onBack}
        disableEscapeClose={disableEscapeClose}
        className="items-center justify-center p-6"
      >
        <div className={twJoin("mx-auto w-full", contentClassName)}>
          {children}
        </div>
      </FullScreenDialog>
    );
  }

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      onBack={onBack}
      disableEscapeClose={disableEscapeClose}
      // The shell renders its own header aligned to the page column, so hide
      // FullScreenDialog's fixed built-in close/back button (onClose is still
      // wired for backdrop + Escape dismissal).
      closeButtonClassName="!hidden"
    >
      {/* Header row: close/back on the left, network + settings on the right,
          both on the page's content column so the modal chrome lines up with
          the page underneath. */}
      <div
        className={`mx-auto flex w-full items-center justify-between py-4 ${PAGE_CONTENT_CLASS}`}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={COPY.common.back}
            className="flex size-10 items-center justify-center text-accent-primary"
          >
            <IoArrowBack size={20} />
          </button>
        ) : onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={COPY.common.close}
            className="flex size-10 items-center justify-center text-accent-primary"
          >
            <IoClose size={24} />
          </button>
        ) : (
          <span className="size-10" />
        )}
        <div className="flex items-center gap-4">
          <NetworkBadge />
          <StandardSettingsMenu theme={theme} setTheme={setTheme} />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 pb-6">
        <div className={twJoin("mx-auto w-full", contentClassName)}>
          {children}
        </div>
      </div>
    </FullScreenDialog>
  );
}
