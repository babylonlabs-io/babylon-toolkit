import { COPY } from "@/copy";

const BADGE_SIZE = 18;
const RING_STROKE_WIDTH = 2;
const RING_RADIUS = 8;
const RING_CENTER = BADGE_SIZE / 2;
const PROGRESS_ARC_PATH = "M17 9C17 4.58172 13.4183 1 9 1";
const MAX_DISPLAYED_COUNT = 9;

export function PendingDepositsBadge({ count }: { count: number }) {
  const displayedCount =
    count > MAX_DISPLAYED_COUNT
      ? COPY.nav.pendingDepositsOverflow(MAX_DISPLAYED_COUNT)
      : count;

  return (
    <span
      role="img"
      aria-label={COPY.nav.pendingDeposits(count)}
      className="relative flex size-[18px] items-center justify-center"
    >
      <svg
        className="absolute inset-0"
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        viewBox={`0 0 ${BADGE_SIZE} ${BADGE_SIZE}`}
        fill="none"
        aria-hidden
      >
        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE_WIDTH}
          className="stroke-secondary-strokeLight"
        />
        <path
          d={PROGRESS_ARC_PATH}
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinecap="round"
          className="stroke-risk-amber"
        />
      </svg>
      <span className="relative text-[10px] font-bold leading-[1.2] tracking-[0.4px] text-accent-primary">
        {displayedCount}
      </span>
    </span>
  );
}
