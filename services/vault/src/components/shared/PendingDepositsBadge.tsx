import { COPY } from "@/copy";

const BADGE_SIZE = 18;
const RING_STROKE_WIDTH = 2;
const RING_RADIUS = 8;
const RING_CENTER = BADGE_SIZE / 2;
const MAX_DISPLAYED_COUNT = 9;

export function PendingDepositsBadge({
  count,
  progress,
}: {
  count: number;
  progress: number | null;
}) {
  const displayedCount =
    count > MAX_DISPLAYED_COUNT
      ? COPY.nav.pendingDepositsOverflow(MAX_DISPLAYED_COUNT)
      : count;
  const label =
    progress === null
      ? COPY.nav.pendingDeposits(count)
      : `${COPY.nav.pendingDeposits(count)}, ${COPY.nav.pendingDepositsProgress(Math.round(progress * 100))}`;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
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
        {progress !== null && progress > 0 && (
          <circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - progress}
            transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
            strokeWidth={RING_STROKE_WIDTH}
            strokeLinecap="round"
            className="stroke-risk-amber"
          />
        )}
      </svg>
      <span className="relative text-[10px] font-bold leading-[1.2] tracking-[0.4px] text-accent-primary">
        {displayedCount}
      </span>
      {progress !== null && (
        <span
          aria-hidden
          className="absolute right-6 hidden text-xs text-accent-primary group-focus-visible:block"
        >
          {Math.round(progress * 100)}%
        </span>
      )}
    </span>
  );
}
