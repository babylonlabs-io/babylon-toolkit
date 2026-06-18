/**
 * Feature cards for the disconnected entry screen.
 *
 * Each card is a single-open expandable: the header (icon + title) is always
 * visible, the body shows truncated when collapsed and in full when expanded,
 * and an optional `expandedExtra` (e.g. the APR row on the rates card) renders
 * only while expanded. The parent owns which card is open so only one expands
 * at a time.
 *
 * Icons are inline SVGs from the design with their hardcoded white fills/strokes
 * swapped to `currentColor`, so they inherit the card's text color and stay
 * visible in both light and dark themes.
 */

import { ChevronRightIcon } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { CARD_DARK_BG_CLASS } from "@/components/shared/layoutClasses";

const ICON_SIZE = 32;

export function CompetitiveRatesIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12.8598 20C14.369 20 15.5904 18.7791 15.5904 17.2706C15.5904 15.7621 14.369 14.5412 12.8598 14.5412C11.3507 14.5412 10.1293 15.7621 10.1293 17.2706C10.1293 18.7791 11.3507 20 12.8598 20Z"
        fill="currentColor"
      />
      <path
        d="M19.9966 20C21.5057 20 22.7272 18.7791 22.7272 17.2706C22.7272 15.7621 21.5057 14.5412 19.9966 14.5412C18.4874 14.5412 17.266 15.7621 17.266 17.2706C17.266 18.7791 18.4874 20 19.9966 20Z"
        fill="currentColor"
      />
      <path
        d="M16.4227 6C9.00791 6 2.9968 12.1235 3 19.6725H6.43081C6.43081 14.0124 10.8688 9.42612 16.4259 9.42612C21.983 9.42612 26.421 14.0156 26.421 19.6725H29.8518C29.8518 12.1203 23.8407 6 16.4291 6H16.4227Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FastAccessIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <line
        x1="3.665"
        y1="11.335"
        x2="9.335"
        y2="11.335"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
      />
      <line
        x1="0.665"
        y1="15.335"
        x2="8.335"
        y2="15.335"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
      />
      <line
        x1="3.665"
        y1="19.335"
        x2="9.335"
        y2="19.335"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
      />
      <path
        d="M20.8765 25.3594C26.2208 25.3594 30.5562 21.024 30.5562 15.6797C30.5562 10.3354 26.2208 6 20.8765 6C15.5322 6 11.1968 10.3354 11.1968 15.6797C11.1968 21.024 15.5322 25.3594 20.8765 25.3594ZM20.8765 23.6512C16.4712 23.6512 12.905 20.085 12.905 15.6797C12.905 11.2744 16.4712 7.70818 20.8765 7.70818C25.2818 7.70818 28.838 11.2744 28.838 15.6797C28.838 20.085 25.2818 23.6512 20.8765 23.6512ZM25.7613 16.7485C26.1508 16.7485 26.4505 16.4489 26.4505 16.0593C26.4505 15.6797 26.1508 15.38 25.7613 15.38H21.5657V9.74601C21.5657 9.36641 21.2661 9.06673 20.8865 9.06673C20.4969 9.06673 20.1872 9.36641 20.1872 9.74601V16.0593C20.1872 16.4489 20.4969 16.7485 20.8865 16.7485H25.7613Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PartialLiquidationIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <mask id="partial-liquidation-mask" fill="white">
        <path d="M27.1781 16.8193C27.1781 18.908 26.5587 20.9497 25.3983 22.6864C24.2379 24.423 22.5886 25.7766 20.6589 26.5759C18.7292 27.3752 16.6059 27.5843 14.5573 27.1768C12.5088 26.7694 10.6271 25.7636 9.15022 24.2867C7.67331 22.8098 6.66752 20.9281 6.26005 18.8795C5.85257 16.831 6.0617 14.7077 6.861 12.778C7.66029 10.8483 9.01385 9.19899 10.7505 8.03859C12.4872 6.87819 14.5289 6.25883 16.6176 6.25883V16.8193H27.1781Z" />
      </mask>
      <path
        d="M27.1781 16.8193C27.1781 18.908 26.5587 20.9497 25.3983 22.6864C24.2379 24.423 22.5886 25.7766 20.6589 26.5759C18.7292 27.3752 16.6059 27.5843 14.5573 27.1768C12.5088 26.7694 10.6271 25.7636 9.15022 24.2867C7.67331 22.8098 6.66752 20.9281 6.26005 18.8795C5.85257 16.831 6.0617 14.7077 6.861 12.778C7.66029 10.8483 9.01385 9.19899 10.7505 8.03859C12.4872 6.87819 14.5289 6.25883 16.6176 6.25883V16.8193H27.1781Z"
        stroke="currentColor"
        strokeWidth="2.66"
        mask="url(#partial-liquidation-mask)"
      />
      <path
        d="M27.0459 15.0603C26.9896 14.0414 26.7625 13.0376 26.3711 12.0926C25.9158 10.9934 25.2475 9.99535 24.4062 9.15408C23.565 8.31282 22.5669 7.64457 21.4678 7.18924C20.5228 6.79781 19.5189 6.57173 18.5 6.51541V15.0603H27.0459Z"
        fill="currentColor"
        stroke="currentColor"
      />
    </svg>
  );
}

export function SelfCustodialIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M23.9582 13.4424C24.2911 11.2358 22.5967 10.0496 20.2799 9.25825L21.0314 6.26913L19.1964 5.81569L18.4648 8.72603C17.9824 8.60684 17.4869 8.49439 16.9946 8.38297L17.7315 5.45345L15.8976 5L15.1455 7.98808C14.7462 7.89791 14.3542 7.80878 13.9737 7.71498L13.9758 7.70565L11.4452 7.07912L10.9571 9.02246C10.9571 9.02246 12.3185 9.33184 12.2898 9.35101C13.033 9.53498 13.1673 10.0226 13.1448 10.4092L12.2888 13.8145C12.34 13.8274 12.4063 13.8461 12.4795 13.8751C12.4184 13.8601 12.353 13.8435 12.2856 13.8274L11.0856 18.5977C10.9947 18.8216 10.7642 19.1574 10.2447 19.0299C10.263 19.0563 8.91096 18.6998 8.91096 18.6998L8 20.7825L10.3879 21.3728C10.8322 21.4832 11.2675 21.5987 11.6961 21.7076L10.9367 24.7309L12.7696 25.1843L13.5217 22.1931C14.0223 22.3279 14.5084 22.4522 14.984 22.5694L14.2345 25.5466L16.0695 26L16.8289 22.9824C19.9579 23.5695 22.3108 23.3327 23.3012 20.5265C24.0993 18.2671 23.2615 16.9637 21.6152 16.1138C22.8141 15.8397 23.7172 15.0577 23.9582 13.4424ZM19.7656 19.2719C19.1985 21.5314 15.3619 20.3099 14.118 20.0036L15.1256 15.9983C16.3695 16.3061 20.3583 16.9155 19.7656 19.2719ZM20.3332 13.4097C19.8158 15.465 16.6225 14.4208 15.5866 14.1648L16.5002 10.532C17.536 10.788 20.872 11.2659 20.3332 13.4097Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function TrustlessIcon() {
  // No design SVG was provided for this card; the mockup shows a "</>" glyph.
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 11L6 16L12 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 11L26 16L20 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 8L14 24"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  body: string;
  /**
   * Extra content (e.g. the APR row). On a static card it always shows; on an
   * expandable card it shows only while expanded.
   */
  extra?: ReactNode;
  /** Expandable cards (Self-custodial, Trustless) get a chevron and truncate. */
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

export function FeatureCard({
  icon,
  title,
  body,
  extra,
  expandable = false,
  expanded = false,
  onToggle,
}: FeatureCardProps) {
  const showFull = !expandable || expanded;

  // Body + extra live in the text column so the extra (e.g. the APR row) aligns
  // with the title and subtitle rather than the card edge.
  const content = (
    <div className="flex w-full items-start gap-3">
      <span className="mt-0.5 shrink-0 text-accent-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="block text-[15px] text-accent-primary">{title}</span>
        <span
          className={`mt-1 text-[13px] leading-snug text-accent-secondary ${showFull ? "block" : "line-clamp-1"}`}
        >
          {body}
        </span>
        {extra && showFull && <div className="mt-3">{extra}</div>}
      </div>
      {expandable && (
        <ChevronRightIcon
          size={18}
          variant="secondary"
          className={`mt-1 shrink-0 transition-transform ${expanded ? "-rotate-90" : ""}`}
        />
      )}
    </div>
  );

  return (
    <div className={`rounded-2xl bg-secondary-highlight ${CARD_DARK_BG_CLASS}`}>
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="w-full px-4 py-3 text-left"
        >
          {content}
        </button>
      ) : (
        <div className="px-4 py-3">{content}</div>
      )}
    </div>
  );
}
